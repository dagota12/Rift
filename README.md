# 🎮 Rift Arena — Authoritative Real-Time Multiplayer Engine

> **A high-throughput, low-latency authoritative multiplayer game engine built with Go, Gorilla WebSockets, React, TypeScript, and Docker.**

[![Go Version](https://img.shields.io/badge/Go-1.24%2B-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-3178C6?style=flat&logo=typescript)](https://www.typescriptlang.org)
[![Bun](https://img.shields.io/badge/Bun-1.3%2B-FBF0DF?style=flat&logo=bun)](https://bun.sh)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker)](https://www.docker.com)

---

## 🎯 Architecture & Design Highlights

Rift Arena is designed to demonstrate production-grade distributed systems patterns used in real-time gaming:

* **Goroutine-per-Room Concurrency Model**: Each game room runs in an isolated Go routine that exclusively owns all world simulation state (player positions, velocities, raycast collisions, cooldowns). **Hot-path simulation ticks require zero mutex locks.**
* **Actor-Style Channel Pipelines**: Inbound player inputs pass through non-blocking Go channels into the room goroutine. Outbound 30 TPS world snapshots are serialized once and fanned out to independent per-client `writePump` channels.
* **Gorilla WebSocket Single-Writer Guarantees**: Follows the strict single-writer model to ensure zero concurrent write deadlocks or socket frame corruption.
* **Server-Authoritative Combat**: Client sends only raw inputs (`moveX`, `moveY`, `aimAngle`, `shoot`). Movement clamping, firing cooldowns, projectile raycasting, damage calculation, and win conditions are 100% computed on the server.
* **Client-Side State Interpolation**: The HTML5 Canvas frontend interpolates positions between server ticks at 60+ FPS, eliminating visual stutter while preserving server authority.

```mermaid
flowchart TD
    subgraph Client["React + TypeScript Client (Canvas)"]
        UI[HUD & Controls] -->|WASD / Aim / Shoot| WSClient[useWebSocket]
        WSClient -->|Render Loop (60 FPS Lerp)| Canvas[Arena Canvas]
    end

    subgraph Transport["Transport Layer (Go)"]
        Upgrade[HTTP -> WS Upgrade]
        ReadPump["Client readPump()"]
        WritePump["Client writePump()"]
    end

    subgraph Matchmaking["Matchmaker Engine"]
        Queue["Thread-Safe Queue"]
        FillWindow["2-4 Player Fill Window Timer"]
    end

    subgraph Room["Room Worker Goroutine (Isolated)"]
        TickLoop["Fixed 30 TPS Ticker Loop"]
        World["Authoritative World State (Zero Mutexes)"]
        Combat["Physics & Bullet Collision Detection"]
    end

    WSClient <-->|Full-Duplex WS| Upgrade
    Upgrade --> ReadPump
    WritePump --> WSClient
    ReadPump --> Queue
    Queue --> FillWindow
    FillWindow -->|Spawn Match| Room
    ReadPump -->|Channel InputEnvelope| TickLoop
    TickLoop --> World
    World --> Combat
    Combat -->|Serialize Snapshot 30 TPS| WritePump
```

---

## 📊 Verified Load Test Benchmarks

The repository includes a standalone headless load-testing suite ([tests/load/sim_client.go](tests/load/sim_client.go)) that spins up hundreds of simulated bot clients making dynamic movements and firing weapons.

Below are the actual benchmark results from a stress run on a single machine:

```text
==================================================================================
                         RIFT ARENA LOAD BENCHMARK REPORT                         
==================================================================================
 Execution Duration        : 35.01 seconds
 Concurrent Clients        : 500 Bots
 Connections Established   : 500 / 500 (100.0% success rate)
----------------------------------------------------------------------------------
 MATCHMAKING PERFORMANCE
   Matches Launched        : 499 matches
   Time-to-Match (TTM)     : Min: 0ms | Median: 42ms | P95: 1.14s
----------------------------------------------------------------------------------
 REAL-TIME SIMULATION & BROADCAST INTEGRITY
   Total Snapshots Delivered: 331,268 snapshots
   Total Inputs Processed   : 69,010 inputs
   Aggregate Broadcast Rate : 9,461.7 snapshots/sec
   Per-Client Broadcast Rate: ~19-25 TPS sustained under peak saturation
   Snapshot Interval Jitter : Avg: 38.8 ms (Target: 33.3 ms)
----------------------------------------------------------------------------------
 NETWORK BANDWIDTH
   Total Data Transferred   : 242.77 MB
   Average Throughput       : 7,100.43 KB/sec (7.1 MB/s)
==================================================================================
```

---

## 🚀 Quickstart

### Option 1: Docker Compose (Recommended)

Run the entire stack (Go server + Nginx React client) with a single command:

```bash
docker compose up --build
```

- **Frontend Client**: Open [http://localhost:3000](http://localhost:3000)
- **Game Server**: Listening on `:8087` (Health check at [http://localhost:8087/health](http://localhost:8087/health))

Open two browser tabs at `http://localhost:3000` to enter the queue and play against yourself or a friend!

---

### Option 2: Run Locally from Source

#### 1. Start the Go Server
```bash
cd server
go run ./cmd/server
```
*Server starts on port `:8087`.*

#### 2. Start the Frontend Client
```bash
cd client
bun install   # or npm install
bun dev       # or npm run dev
```
*Client will be running at [http://localhost:5173](http://localhost:5173).*

---

## 🧪 Running the Load Test Harness

Simulate active players and measure real-time throughput metrics:

```bash
# 20 Bots for 15 seconds
cd tests
go run ./load/sim_client.go -clients=20 -duration=15s -addr=localhost:8087

# 500 Bots Stress Test
cd tests
go run ./load/sim_client.go -clients=500 -duration=30s -ramp=5ms -addr=localhost:8087
```

---

## 📡 Wire Protocol Specification

Communication takes place over binary/text JSON WebSocket frames:

### Client ➔ Server
| Message | Type | Description |
|---|---|---|
| `join_queue` | `{"type":"join_queue", "name":"Pilot_01"}` | Enters matchmaking queue |
| `input` | `{"type":"input", "sequence":42, "moveX":1, "moveY":0, "aimAngle":1.57, "shoot":true}` | Sent at 30Hz containing directional input and firing intent |

### Server ➔ Client
| Message | Type | Description |
|---|---|---|
| `queued` | `{"type":"queued", "position":1}` | Queue position updates |
| `game_start` | `{"type":"game_start", "roomId":"...", "playerId":"...", "players":[...]}` | Room initialization with assigned IDs and spawn points |
| `snapshot` | `{"type":"snapshot", "tick":120, "players":[...], "projectiles":[...]}` | Authoritative tick state (broadcasted 30 times/sec) |
| `player_eliminated`| `{"type":"player_eliminated", "playerId":"...", "byPlayerId":"..."}` | Elimination broadcast for kill feed notifications |
| `game_over` | `{"type":"game_over", "winner":"...", "reason":"elimination", "scoreboard":[...]}` | Match conclusion with stats and rematch support |

---

## 📁 Repository Structure

```
Rift/
├── server/                     # Go Authoritative Game Engine
│   ├── cmd/server/             # Main HTTP / WebSocket entrypoint
│   ├── internal/
│   │   ├── game/               # Pure world simulation (player, projectile, physics)
│   │   ├── matchmaking/        # Queue management & fill window logic
│   │   ├── room/               # Isolated room loop, tick pacing, broadcasting
│   │   ├── transport/          # Gorilla WebSocket read & write pumps
│   │   └── protocol/           # JSON message definitions
│   └── Dockerfile              # Multi-stage Alpine build (< 15MB)
│
├── client/                     # React + Vite + Canvas Frontend
│   ├── src/
│   │   ├── components/         # LobbyScreen, Matchmaking, HUD, Scoreboard, Canvas
│   │   ├── game/               # HTML5 Canvas 60 FPS lerp renderer
│   │   ├── hooks/              # useWebSocket, useGameInput
│   │   └── store/              # Zustand global game state
│   ├── Dockerfile              # Bun builder + Nginx image
│   └── nginx.conf              # SPA routing & compression config
│
├── tests/                      # Headless Stress & Load Testing Suite
│   └── load/sim_client.go      # Concurrent bot simulator & benchmark reporter
│
└── docker-compose.yml          # One-click multi-container deployment
```

---

## 🛡️ License

MIT License. Designed and built as a systems engineering portfolio artifact.
