package transport

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// readPump runs in its own goroutine. It reads messages from the WebSocket
// connection, enforces size limits and read deadlines, and dispatches valid
// messages to the provided handler.
//
// The read pump closes the done channel when it exits, signalling to the
// write pump and the room goroutine that this client has disconnected.
func (c *Client) readPump(onMessage MessageHandler) {
	defer func() {
		close(c.done)
		c.conn.Close()
		log.Printf("client disconnected: %s (%s)", c.ID, c.Name)
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway,
				websocket.CloseAbnormalClosure,
			) {
				log.Printf("read error for client %s: %v", c.ID, err)
			}
			return
		}
		onMessage(c.ID, c, msg)
	}
}
