package transport

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

// writePump runs in its own goroutine. It is the ONLY goroutine that writes
// to this client's WebSocket connection — gorilla/websocket requires that
// concurrent writes do not happen.
//
// It drains the SendCh channel and forwards messages to the connection.
// It also sends periodic pings to keep the connection alive.
//
// The write pump exits when SendCh is closed or when the done channel fires.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.SendCh:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// SendCh was closed — send a close frame and exit.
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				log.Printf("write error for client %s: %v", c.ID, err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-c.done:
			// Read pump closed the connection — exit cleanly.
			return
		}
	}
}
