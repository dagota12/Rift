package room

import (
	"encoding/json"
	"log"

	"github.com/google/uuid"
	"github.com/rift-arena/server/internal/game"
	"github.com/rift-arena/server/internal/protocol"
	"github.com/rift-arena/server/internal/transport"
)

// InputEnvelope wraps a raw input message with its sender's ID.
type InputEnvelope struct {
	ClientID string
	Raw      []byte
}

// Room owns all mutable game state for a single match.
// Only the room goroutine (gameLoop) may read or write game state.
type Room struct {
	ID      string
	players []*transport.Client

	// inputCh receives validated input messages from read pumps.
	inputCh chan InputEnvelope

	// queuedInputs holds inputs accumulated between ticks.
	// Only accessed by the room goroutine.
	queuedInputs []InputEnvelope

	// done is closed to signal the room goroutine to stop.
	done chan struct{}

	onDone func(roomID string, playerIDs []string)
}

// QueuedPlayer is the handoff type from matchmaking to the room.
type QueuedPlayer struct {
	Client *transport.Client
	Name   string
}

// StartAndReturn creates a room, broadcasts game_start, starts the game loop,
// and returns the room so the matchmaker can route inputs to it.
func StartAndReturn(players []QueuedPlayer, onDone func(roomID string, playerIDs []string)) *Room {
	r := &Room{
		ID:      uuid.NewString(),
		inputCh: make(chan InputEnvelope, 128),
		done:    make(chan struct{}),
		onDone:  onDone,
	}

	for _, p := range players {
		r.players = append(r.players, p.Client)
	}

	log.Printf("room %s started with %d players", r.ID, len(r.players))
	r.broadcastGameStart()

	// Build the initial world with all player IDs.
	playerIDs := make([]string, len(r.players))
	for i, p := range r.players {
		playerIDs[i] = p.ID
	}
	world := game.NewWorld(playerIDs)

	go r.watchDisconnects()
	go r.gameLoop(world)

	return r
}

// broadcastGameStart sends a personalised game_start to every player.
func (r *Room) broadcastGameStart() {
	infos := make([]protocol.PlayerInfo, len(r.players))
	for i, p := range r.players {
		infos[i] = protocol.PlayerInfo{ID: p.ID, Name: p.Name}
	}

	for _, p := range r.players {
		msg := protocol.GameStartMsg{
			Type:     protocol.EventGameStart,
			RoomID:   r.ID,
			PlayerID: p.ID,
			Players:  infos,
		}
		b, err := json.Marshal(msg)
		if err != nil {
			log.Printf("marshal game_start error: %v", err)
			continue
		}
		select {
		case p.SendCh <- b:
		default:
			log.Printf("send buffer full for client %s on game_start", p.ID)
		}
	}
}

// watchDisconnects monitors all player connections. If any player disconnects,
// the room is shut down. Phase 5 will handle graceful mid-game disconnection.
func (r *Room) watchDisconnects() {
	for _, p := range r.players {
		go func(c *transport.Client) {
			<-c.Done()
			log.Printf("player %s (%s) disconnected from room %s", c.ID, c.Name, r.ID)
			select {
			case <-r.done:
			default:
				close(r.done)
			}
		}(p)
	}
}

// cleanup stops the room and notifies the matchmaker that the room has finished.
// Note: It does NOT close client send channels; the client WebSocket connections
// remain open for future games.
func (r *Room) cleanup() {
	log.Printf("room %s cleanup", r.ID)
	select {
	case <-r.done:
	default:
		close(r.done)
	}

	if r.onDone != nil {
		playerIDs := make([]string, len(r.players))
		for i, p := range r.players {
			playerIDs[i] = p.ID
		}
		r.onDone(r.ID, playerIDs)
	}
}

// RouteInput forwards a player's input message to this room's input channel.
// Called by the matchmaker from any goroutine — channel send is safe.
func (r *Room) RouteInput(clientID string, raw []byte) {
	select {
	case r.inputCh <- InputEnvelope{ClientID: clientID, Raw: raw}:
	default:
		log.Printf("room %s input channel full, dropping input from %s", r.ID, clientID)
	}
}
