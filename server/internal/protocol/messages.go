package protocol

// --- Inbound messages (client → server) ---

// BaseMsg is used to peek at the type field before full unmarshalling.
type BaseMsg struct {
	Type string `json:"type"`
}

// JoinQueueMsg is sent by a client to enter the matchmaking queue.
type JoinQueueMsg struct {
	Type string `json:"type"`
	Name string `json:"name"`
}

// InputMsg carries a player's complete input state for one frame.
// Movement and firing intent are always sent together.
// Sequence numbers enable input ordering and future reconciliation.
type InputMsg struct {
	Type     string  `json:"type"`
	Sequence int64   `json:"sequence"`
	MoveX    float64 `json:"moveX"`    // -1, 0, or 1
	MoveY    float64 `json:"moveY"`    // -1, 0, or 1
	AimAngle float64 `json:"aimAngle"` // radians
	Shoot    bool    `json:"shoot"`
}

// --- Outbound messages (server → client) ---

// QueuedMsg tells a player their position in the matchmaking queue.
type QueuedMsg struct {
	Type     string `json:"type"`
	Position int    `json:"position"`
}

// PlayerInfo is a snapshot of a player's identity (no game state).
type PlayerInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// GameStartMsg is broadcast to all players when a room is ready.
type GameStartMsg struct {
	Type     string       `json:"type"`
	RoomID   string       `json:"roomId"`
	PlayerID string       `json:"playerId"` // this client's own ID
	Players  []PlayerInfo `json:"players"`
}

// PlayerSnapshot carries a player's in-game state for a tick snapshot.
type PlayerSnapshot struct {
	ID     string  `json:"id"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	HP     int     `json:"hp"`
	Angle  float64 `json:"angle"`
	Alive  bool    `json:"alive"`
	AckSeq int64   `json:"ackSeq"` // last input sequence the server processed for this player
}

// ProjectileSnapshot carries a projectile's state for a tick snapshot.
type ProjectileSnapshot struct {
	ID    string  `json:"id"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Angle float64 `json:"angle"`
}

// SnapshotMsg is sent each tick to all players in a room.
// ackSequence tells the client the last input sequence the server processed.
type SnapshotMsg struct {
	Type        string               `json:"type"`
	Tick        int64                `json:"tick"`
	AckSequence int64                `json:"ackSequence"`
	Players     []PlayerSnapshot     `json:"players"`
	Projectiles []ProjectileSnapshot `json:"projectiles"`
}

// PlayerEliminatedMsg notifies all clients when a player is knocked out.
type PlayerEliminatedMsg struct {
	Type       string `json:"type"`
	PlayerID   string `json:"playerId"`
	ByPlayerID string `json:"byPlayerId"`
}

// ScoreEntry is one row in the end-of-match scoreboard.
type ScoreEntry struct {
	PlayerID string `json:"playerId"`
	Name     string `json:"name"`
	HP       int    `json:"hp"`
	Kills    int    `json:"kills"`
}

// GameOverMsg is sent when the round ends (by elimination or timeout).
type GameOverMsg struct {
	Type       string       `json:"type"`
	Winner     string       `json:"winner"` // player ID, or "" for a draw
	Reason     string       `json:"reason"` // "elimination" | "timeout" | "draw"
	Scoreboard []ScoreEntry `json:"scoreboard"`
}
