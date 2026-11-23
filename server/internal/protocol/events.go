package protocol

// Event type constants — used by both inbound and outbound messages.
const (
	EventJoinQueue       = "join_queue"
	EventQueued          = "queued"
	EventGameStart       = "game_start"
	EventInput           = "input"
	EventSnapshot        = "snapshot"
	EventPlayerEliminated = "player_eliminated"
	EventGameOver        = "game_over"
)
