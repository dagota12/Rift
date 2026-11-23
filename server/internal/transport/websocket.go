package transport

import (
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const (
	// Maximum message size enforced on the read pump.
	maxMessageSize = 512

	// Time allowed to write a message to the peer.
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer.
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait.
	pingPeriod = (pongWait * 9) / 10

	// Outbound send channel buffer per client.
	sendBufferSize = 256
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins for development. Tighten for production.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client represents one connected WebSocket player.
// SendCh is the only channel that the write pump reads from.
// All other goroutines write to SendCh to send messages to this client.
type Client struct {
	// ID is a unique identifier for this connection, assigned on connect.
	ID string

	// Name is set when the client sends join_queue.
	Name string

	conn   *websocket.Conn
	SendCh chan []byte

	// done is closed by the read pump when the connection is lost.
	// Other goroutines can select on done to detect disconnection.
	done chan struct{}
}

// Done returns a channel that is closed when this client disconnects.
func (c *Client) Done() <-chan struct{} {
	return c.done
}

// MessageHandler is called by the read pump for each valid message received.
// clientID is provided for convenience; raw is the raw JSON bytes.
type MessageHandler func(clientID string, client *Client, raw []byte)

// HandleUpgrade upgrades an HTTP connection to WebSocket and starts
// the read and write pumps for the new client.
func HandleUpgrade(onMessage MessageHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Printf("websocket upgrade error: %v", err)
			return
		}

		client := &Client{
			ID:     uuid.NewString(),
			conn:   conn,
			SendCh: make(chan []byte, sendBufferSize),
			done:   make(chan struct{}),
		}

		log.Printf("client connected: %s", client.ID)

		go client.writePump()
		go client.readPump(onMessage)
	}
}
