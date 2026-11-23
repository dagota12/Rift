package matchmaking

import (
	"encoding/json"
	"log"
	"time"

	"github.com/rift-arena/server/internal/protocol"
	"github.com/rift-arena/server/internal/room"
	"github.com/rift-arena/server/internal/transport"
)

const (
	// fillWindowDuration is how long the matchmaker waits after reaching
	// minPlayers before starting the room, to allow more players to join.
	fillWindowDuration = 2 * time.Second
)

// playerEntry holds a queued player together with their assigned room (once matched).
type playerEntry struct {
	client *transport.Client
	// activeRoom is set once the player has been placed into a room.
	// Input messages are routed here.
	activeRoom *room.Room
}

type roomDoneEvent struct {
	roomID    string
	playerIDs []string
}

// Matchmaker manages the queue of waiting players and creates rooms.
// It runs a single background goroutine (run) that owns the queue state.
type Matchmaker struct {
	joinCh     chan *transport.Client // clients entering the queue
	msgCh      chan inboundMsg        // all inbound messages from any client
	roomDoneCh chan roomDoneEvent     // room completion notifications
	minSize    int
	maxSize    int

	// registry maps client ID → entry. Only the run goroutine accesses this.
	registry map[string]*playerEntry
}

type inboundMsg struct {
	clientID string
	client   *transport.Client
	raw      []byte
}

// New creates and starts a Matchmaker.
func New(minPlayers, maxPlayers int) *Matchmaker {
	m := &Matchmaker{
		joinCh:     make(chan *transport.Client, 64),
		msgCh:      make(chan inboundMsg, 256),
		roomDoneCh: make(chan roomDoneEvent, 64),
		minSize:    minPlayers,
		maxSize:    maxPlayers,
		registry:   make(map[string]*playerEntry),
	}
	go m.run()
	return m
}

// HandleMessage is called by the transport layer for every inbound WebSocket message.
// It is safe to call from multiple goroutines.
func (m *Matchmaker) HandleMessage(clientID string, client *transport.Client, raw []byte) {
	m.msgCh <- inboundMsg{clientID: clientID, client: client, raw: raw}
}

// run is the matchmaker's goroutine. It owns the registry and the queue.
func (m *Matchmaker) run() {
	var queue []*transport.Client

	for {
		select {
		case msg := <-m.msgCh:
			m.dispatch(msg, &queue)
		case done := <-m.roomDoneCh:
			log.Printf("room %s completed — freeing %d player(s)", done.roomID, len(done.playerIDs))
			for _, id := range done.playerIDs {
				if entry, ok := m.registry[id]; ok {
					entry.activeRoom = nil
				}
			}
		}
	}
}

// dispatch routes an inbound message to the appropriate handler.
func (m *Matchmaker) dispatch(msg inboundMsg, queue *[]*transport.Client) {
	entry, known := m.registry[msg.clientID]

	// If the client is already in a room, forward the input there.
	if known && entry.activeRoom != nil {
		entry.activeRoom.RouteInput(msg.clientID, msg.raw)
		return
	}

	// Otherwise parse the type and handle pre-game messages.
	var base protocol.BaseMsg
	if err := json.Unmarshal(msg.raw, &base); err != nil {
		return
	}

	switch base.Type {
	case protocol.EventJoinQueue:
		var jq protocol.JoinQueueMsg
		if err := json.Unmarshal(msg.raw, &jq); err != nil {
			return
		}
		m.enqueue(msg.client, jq.Name, queue)
	}
}

// enqueue adds a player to the queue and triggers matchmaking if ready.
func (m *Matchmaker) enqueue(client *transport.Client, name string, queue *[]*transport.Client) {
	// If the player is currently inside an active room, ignore join_queue.
	if entry, exists := m.registry[client.ID]; exists && entry.activeRoom != nil {
		return
	}

	// If already in queue, update name and do not duplicate.
	for _, c := range *queue {
		if c.ID == client.ID {
			client.Name = name
			return
		}
	}

	client.Name = name
	m.registry[client.ID] = &playerEntry{client: client, activeRoom: nil}
	*queue = append(*queue, client)

	log.Printf("player %s (%s) joined queue — queue size: %d", client.ID, name, len(*queue))

	// Notify the player of their position.
	m.sendQueued(client, len(*queue))

	// Start the fill window once we have enough for a minimum game.
	if len(*queue) >= m.minSize {
		m.startFillWindow(queue)
	}
}

// startFillWindow waits briefly for more players, then creates a room.
// It runs inline (called from the run goroutine) using a timer + select.
func (m *Matchmaker) startFillWindow(queue *[]*transport.Client) {
	log.Printf("fill window started — %d player(s) in queue", len(*queue))
	timer := time.NewTimer(fillWindowDuration)
	defer timer.Stop()

	for {
		if len(*queue) >= m.maxSize {
			break
		}
		select {
		case <-timer.C:
			goto launch
		case done := <-m.roomDoneCh:
			for _, id := range done.playerIDs {
				if entry, ok := m.registry[id]; ok {
					entry.activeRoom = nil
				}
			}
		case msg := <-m.msgCh:
			// Process messages that arrive during the fill window.
			var base protocol.BaseMsg
			if err := json.Unmarshal(msg.raw, &base); err != nil {
				continue
			}
			if base.Type == protocol.EventJoinQueue {
				var jq protocol.JoinQueueMsg
				if err := json.Unmarshal(msg.raw, &jq); err != nil {
					continue
				}
				if entry, exists := m.registry[msg.clientID]; exists && entry.activeRoom != nil {
					continue
				}
				inQueue := false
				for _, c := range *queue {
					if c.ID == msg.clientID {
						inQueue = true
						break
					}
				}
				if inQueue {
					continue
				}
				msg.client.Name = jq.Name
				m.registry[msg.clientID] = &playerEntry{client: msg.client, activeRoom: nil}
				*queue = append(*queue, msg.client)
				log.Printf("player %s (%s) joined during fill window — queue: %d", msg.clientID, jq.Name, len(*queue))
				m.sendQueued(msg.client, len(*queue))
			}
		}
	}

launch:
	// Slice off up to maxSize players for this room.
	count := m.maxSize
	if len(*queue) < count {
		count = len(*queue)
	}
	batch := (*queue)[:count]
	*queue = (*queue)[count:]

	// Build the room.QueuedPlayer slice and record the room in the registry.
	qp := make([]room.QueuedPlayer, len(batch))
	for i, c := range batch {
		qp[i] = room.QueuedPlayer{Client: c, Name: c.Name}
	}

	r := room.StartAndReturn(qp, func(roomID string, playerIDs []string) {
		m.roomDoneCh <- roomDoneEvent{roomID: roomID, playerIDs: playerIDs}
	})
	for _, c := range batch {
		if entry, ok := m.registry[c.ID]; ok {
			entry.activeRoom = r
		}
	}

	// Notify remaining queued players of their updated position.
	for i, c := range *queue {
		m.sendQueued(c, i+1)
	}
}

// sendQueued sends a queued message to the client.
func (m *Matchmaker) sendQueued(client *transport.Client, position int) {
	msg := protocol.QueuedMsg{
		Type:     protocol.EventQueued,
		Position: position,
	}
	b, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case client.SendCh <- b:
	default:
		log.Printf("send buffer full for client %s — could not send queued", client.ID)
	}
}
