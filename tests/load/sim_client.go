package main

// sim_client.go — Phase 6 load test stub.
//
// This file will be expanded in Phase 6 to:
//   - Spin up N concurrent WebSocket clients
//   - Have each send a join_queue message
//   - Verify all clients receive a game_start message
//   - Measure time-to-match under varying loads
//   - Report goroutine counts and memory usage
//
// Run with:
//   go run ./tests/load/sim_client.go --clients=4

import (
	"flag"
	"fmt"
	"log"
	"net/url"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

func main() {
	clients := flag.Int("clients", 2, "number of simulated clients")
	addr := flag.String("addr", "localhost:8080", "server address")
	flag.Parse()

	log.Printf("simulating %d clients connecting to %s", *clients, *addr)

	u := url.URL{Scheme: "ws", Host: *addr, Path: "/ws"}
	var wg sync.WaitGroup
	results := make(chan string, *clients)

	for i := 0; i < *clients; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			err := runClient(id, u)
			if err != nil {
				results <- fmt.Sprintf("client %d: ERROR: %v", id, err)
			} else {
				results <- fmt.Sprintf("client %d: OK", id)
			}
		}(i)
	}

	wg.Wait()
	close(results)
	for r := range results {
		log.Println(r)
	}
}

func runClient(id int, u url.URL) error {
	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	// Send join_queue.
	msg := fmt.Sprintf(`{"type":"join_queue","name":"SimBot%d"}`, id)
	if err := conn.WriteMessage(websocket.TextMessage, []byte(msg)); err != nil {
		return fmt.Errorf("write join_queue: %w", err)
	}

	// Wait for game_start or queued, with a timeout.
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		log.Printf("client %d received: %s", id, string(raw))
		if string(raw) != "" {
			// For now, just log and return — Phase 6 will validate properly.
			return nil
		}
	}
}
