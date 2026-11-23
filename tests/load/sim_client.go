package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
)

// Inbound/outbound message structs matching the server protocol
type BaseMsg struct {
	Type string `json:"type"`
}

type JoinQueueMsg struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

type InputMsg struct {
	Type     string  `json:"type"`
	Sequence int64   `json:"sequence"`
	MoveX    float64 `json:"moveX"`
	MoveY    float64 `json:"moveY"`
	AimAngle float64 `json:"aimAngle"`
	Shoot    bool    `json:"shoot"`
}

type SnapshotMsg struct {
	Type        string `json:"type"`
	Tick        int64  `json:"tick"`
	AckSequence int64  `json:"ackSequence"`
}

// Metrics collected across all bot workers
type MetricsCollector struct {
	connsAttempted   int64
	connsEstablished int64
	connsFailed      int64

	matchesStarted   int64
	matchesCompleted int64

	snapshotsReceived int64
	bytesReceived     int64
	bytesSent         int64
	inputsSent        int64

	mu            sync.Mutex
	ttmList       []time.Duration
	snapshotGaps  []time.Duration
}

func (m *MetricsCollector) RecordTTM(d time.Duration) {
	m.mu.Lock()
	m.ttmList = append(m.ttmList, d)
	m.mu.Unlock()
}

func (m *MetricsCollector) RecordSnapshotGap(d time.Duration) {
	m.mu.Lock()
	m.snapshotGaps = append(m.snapshotGaps, d)
	m.mu.Unlock()
}

func main() {
	clients := flag.Int("clients", 20, "Total number of concurrent simulated bot clients")
	addr := flag.String("addr", "localhost:8087", "Target game server address")
	duration := flag.Duration("duration", 30*time.Second, "Load test duration")
	ramp := flag.Duration("ramp", 50*time.Millisecond, "Delay between launching individual clients")
	flag.Parse()

	log.Printf("==================================================================")
	log.Printf("  RIFT ARENA LOAD BENCHMARK HARNESS")
	log.Printf("  Target Server : %s", *addr)
	log.Printf("  Simulated Bots: %d", *clients)
	log.Printf("  Test Duration : %v", *duration)
	log.Printf("==================================================================")

	metrics := &MetricsCollector{}
	u := url.URL{Scheme: "ws", Host: *addr, Path: "/ws"}

	ctx, cancel := context.WithTimeout(context.Background(), *duration)
	defer cancel()

	// Handle graceful Ctrl+C
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("\nReceived interrupt signal, stopping workers...")
		cancel()
	}()

	var wg sync.WaitGroup
	startTime := time.Now()

	for i := 1; i <= *clients; i++ {
		wg.Add(1)
		botName := fmt.Sprintf("Bot_%02d", i)
		go runSimBot(ctx, &wg, i, botName, u, metrics)

		if *ramp > 0 {
			time.Sleep(*ramp)
		}
	}

	wg.Wait()
	actualDuration := time.Since(startTime)

	printReport(metrics, *clients, actualDuration)
}

func runSimBot(
	ctx context.Context,
	wg *sync.WaitGroup,
	botID int,
	botName string,
	u url.URL,
	metrics *MetricsCollector,
) {
	defer wg.Done()
	atomic.AddInt64(&metrics.connsAttempted, 1)

	dialer := websocket.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	conn, _, err := dialer.DialContext(ctx, u.String(), nil)
	if err != nil {
		atomic.AddInt64(&metrics.connsFailed, 1)
		return
	}
	defer conn.Close()

	atomic.AddInt64(&metrics.connsEstablished, 1)

	// Send initial join_queue
	queueStart := time.Now()
	joinMsg := JoinQueueMsg{Type: "join_queue", Name: botName}
	joinBytes, _ := json.Marshal(joinMsg)
	if err := conn.WriteMessage(websocket.TextMessage, joinBytes); err != nil {
		return
	}
	atomic.AddInt64(&metrics.bytesSent, int64(len(joinBytes)))

	inputDone := make(chan struct{})
	var inGame atomic.Bool
	var lastSnapTime time.Time

	// Background input sender when in-game (runs at fixed 30 Hz)
	go func() {
		ticker := time.NewTicker(33 * time.Millisecond) // ~30 Hz
		defer ticker.Stop()
		var seq int64 = 1

		moves := []float64{-1, 0, 1}
		for {
			select {
			case <-ctx.Done():
				return
			case <-inputDone:
				return
			case <-ticker.C:
				if !inGame.Load() {
					continue
				}

				// Wander around and periodically fire
				mx := moves[rand.Intn(len(moves))]
				my := moves[rand.Intn(len(moves))]
				angle := rand.Float64() * math.Pi * 2
				shoot := rand.Float64() < 0.2 // 20% chance to shoot each input

				inp := InputMsg{
					Type:     "input",
					Sequence: seq,
					MoveX:    mx,
					MoveY:    my,
					AimAngle: angle,
					Shoot:    shoot,
				}
				seq++

				b, _ := json.Marshal(inp)
				if err := conn.WriteMessage(websocket.TextMessage, b); err != nil {
					return
				}
				atomic.AddInt64(&metrics.inputsSent, 1)
				atomic.AddInt64(&metrics.bytesSent, int64(len(b)))
			}
		}
	}()
	defer close(inputDone)

	// Read loop
	for {
		if ctx.Err() != nil {
			return
		}

		conn.SetReadDeadline(time.Now().Add(5 * time.Second))
		_, msgBytes, err := conn.ReadMessage()
		if err != nil {
			return
		}

		atomic.AddInt64(&metrics.bytesReceived, int64(len(msgBytes)))

		var base BaseMsg
		if err := json.Unmarshal(msgBytes, &base); err != nil {
			continue
		}

		switch base.Type {
		case "game_start":
			atomic.AddInt64(&metrics.matchesStarted, 1)
			inGame.Store(true)
			ttm := time.Since(queueStart)
			metrics.RecordTTM(ttm)

		case "snapshot":
			atomic.AddInt64(&metrics.snapshotsReceived, 1)
			now := time.Now()
			if !lastSnapTime.IsZero() {
				gap := now.Sub(lastSnapTime)
				metrics.RecordSnapshotGap(gap)
			}
			lastSnapTime = now

		case "game_over":
			atomic.AddInt64(&metrics.matchesCompleted, 1)
			inGame.Store(false)
			lastSnapTime = time.Time{}

			// Re-queue after small delay to test rematch lifecycle
			time.Sleep(500 * time.Millisecond)
			if ctx.Err() == nil {
				queueStart = time.Now()
				rejoinMsg := JoinQueueMsg{Type: "join_queue", Name: botName}
				b, _ := json.Marshal(rejoinMsg)
				if err := conn.WriteMessage(websocket.TextMessage, b); err == nil {
					atomic.AddInt64(&metrics.bytesSent, int64(len(b)))
				}
			}
		}
	}
}

func printReport(m *MetricsCollector, clientCount int, elapsed time.Duration) {
	secs := elapsed.Seconds()
	if secs <= 0 {
		secs = 1
	}

	snapCount := atomic.LoadInt64(&m.snapshotsReceived)
	snapsPerSec := float64(snapCount) / secs
	avgSnapPerClient := snapsPerSec / float64(clientCount)

	mbRecv := float64(atomic.LoadInt64(&m.bytesReceived)) / (1024 * 1024)
	mbSent := float64(atomic.LoadInt64(&m.bytesSent)) / (1024 * 1024)
	totalMB := mbRecv + mbSent
	kbps := (totalMB * 1024) / secs

	// Process TTM percentiles
	m.mu.Lock()
	ttms := make([]time.Duration, len(m.ttmList))
	copy(ttms, m.ttmList)

	gaps := make([]time.Duration, len(m.snapshotGaps))
	copy(gaps, m.snapshotGaps)
	m.mu.Unlock()

	var minTTM, maxTTM, medTTM, p95TTM time.Duration
	if len(ttms) > 0 {
		sort.Slice(ttms, func(i, j int) bool { return ttms[i] < ttms[j] })
		minTTM = ttms[0]
		maxTTM = ttms[len(ttms)-1]
		medTTM = ttms[len(ttms)/2]
		p95Idx := int(float64(len(ttms)) * 0.95)
		if p95Idx >= len(ttms) {
			p95Idx = len(ttms) - 1
		}
		p95TTM = ttms[p95Idx]
	}

	// Calculate snapshot gap jitter (target 33.33ms)
	var avgGapMs float64
	var stdDevMs float64
	if len(gaps) > 0 {
		var totalGapMs float64
		for _, g := range gaps {
			totalGapMs += float64(g.Milliseconds())
		}
		avgGapMs = totalGapMs / float64(len(gaps))

		var varianceSum float64
		for _, g := range gaps {
			diff := float64(g.Milliseconds()) - avgGapMs
			varianceSum += diff * diff
		}
		stdDevMs = math.Sqrt(varianceSum / float64(len(gaps)))
	}

	fmt.Println()
	fmt.Println("==================================================================================")
	fmt.Println("                         RIFT ARENA LOAD BENCHMARK REPORT                         ")
	fmt.Println("==================================================================================")
	fmt.Printf(" Execution Duration        : %.2f seconds\n", secs)
	fmt.Printf(" Concurrent Clients        : %d\n", clientCount)
	fmt.Printf(" Connections Established   : %d / %d (%.1f%% success)\n",
		m.connsEstablished, m.connsAttempted, (float64(m.connsEstablished)/float64(m.connsAttempted))*100)
	fmt.Println("----------------------------------------------------------------------------------")
	fmt.Println(" MATCHMAKING PERFORMANCE")
	fmt.Printf("   Matches Launched        : %d\n", m.matchesStarted)
	fmt.Printf("   Matches Completed       : %d\n", m.matchesCompleted)
	fmt.Printf("   Time-to-Match (TTM)     : Min: %v | Med: %v | P95: %v | Max: %v\n",
		minTTM.Round(time.Millisecond),
		medTTM.Round(time.Millisecond),
		p95TTM.Round(time.Millisecond),
		maxTTM.Round(time.Millisecond),
	)
	fmt.Println("----------------------------------------------------------------------------------")
	fmt.Println(" REAL-TIME SIMULATION & BROADCAST INTEGRITY")
	fmt.Printf("   Total Snapshots Delivered: %d\n", snapCount)
	fmt.Printf("   Total Inputs Processed   : %d\n", m.inputsSent)
	fmt.Printf("   Aggregate Snapshots Rate : %.1f snapshots/sec\n", snapsPerSec)
	fmt.Printf("   Per-Client Broadcast Rate: %.1f TPS (Target: 30.0 TPS)\n", avgSnapPerClient)
	fmt.Printf("   Snapshot Interval Jitter : Avg: %.1f ms | StdDev: ±%.2f ms (Target: 33.3 ms)\n",
		avgGapMs, stdDevMs)
	fmt.Println("----------------------------------------------------------------------------------")
	fmt.Println(" NETWORK BANDWIDTH")
	fmt.Printf("   Ingress (Client -> Srv)  : %.2f MB\n", mbSent)
	fmt.Printf("   Egress  (Srv -> Client)  : %.2f MB\n", mbRecv)
	fmt.Printf("   Total Data Transferred   : %.2f MB\n", totalMB)
	fmt.Printf("   Average Throughput       : %.2f KB/sec (%.2f KB/s per client)\n",
		kbps, kbps/float64(clientCount))
	fmt.Println("==================================================================================")
	fmt.Println()
}
