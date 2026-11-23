package main

import (
	"log"
	"net/http"
	"os"

	"github.com/rift-arena/server/internal/matchmaking"
	"github.com/rift-arena/server/internal/transport"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8087"
	}

	mm := matchmaking.New(2, 4)

	mux := http.NewServeMux()

	// WebSocket endpoint — all clients connect here.
	mux.HandleFunc("/ws", transport.HandleUpgrade(mm.HandleMessage))

	// Health check — used by Docker and load balancers.
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	log.Printf("rift-arena server listening on :%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
