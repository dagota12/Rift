package game

// Arena dimensions in world units.
const (
	ArenaWidth  = 800.0
	ArenaHeight = 600.0

	// Player radius for collision detection.
	PlayerRadius = 16.0

	// Player movement speed in world units per second.
	PlayerSpeed = 200.0

	// Maximum starting HP.
	MaxHP = 3

	// Fire cooldown — minimum ticks between shots.
	FireCooldownTicks = 20 // ~667ms at 30 TPS

	// Projectile speed in world units per second.
	ProjectileSpeed = 400.0

	// Projectile radius for hit detection.
	ProjectileRadius = 4.0
)

// World holds the complete authoritative game state for one room.
// Only the room goroutine may read or write a World.
type World struct {
	Tick        int64
	Players     map[string]*Player
	Projectiles map[string]*Projectile

	// Pending inputs, keyed by player ID.
	// Consumed each tick by Simulate().
	pendingInputs map[string]Input
}

// NewWorld creates a fresh game world for the given player IDs,
// placing them at spawn positions.
func NewWorld(playerIDs []string) *World {
	w := &World{
		Players:       make(map[string]*Player),
		Projectiles:   make(map[string]*Projectile),
		pendingInputs: make(map[string]Input),
	}

	spawns := spawnPoints(len(playerIDs))
	for i, id := range playerIDs {
		sp := spawns[i]
		w.Players[id] = &Player{
			ID:    id,
			X:     sp[0],
			Y:     sp[1],
			HP:    MaxHP,
			Alive: true,
		}
	}
	return w
}

// spawnPoints returns evenly distributed spawn positions for n players.
func spawnPoints(n int) [][2]float64 {
	positions := [][2]float64{
		{100, 100},
		{ArenaWidth - 100, ArenaHeight - 100},
		{ArenaWidth - 100, 100},
		{100, ArenaHeight - 100},
	}
	if n > len(positions) {
		n = len(positions)
	}
	return positions[:n]
}

// ApplyInput queues an input for a player. Called from the room goroutine.
func (w *World) ApplyInput(playerID string, inp Input) {
	// Always keep the latest input per player.
	w.pendingInputs[playerID] = inp
}

// AliveCount returns the number of players still in the game.
func (w *World) AliveCount() int {
	count := 0
	for _, p := range w.Players {
		if p.Alive {
			count++
		}
	}
	return count
}

// LastAlive returns the ID of the last surviving player, or "" if none.
func (w *World) LastAlive() string {
	var id string
	for _, p := range w.Players {
		if p.Alive {
			if id != "" {
				return "" // more than one alive
			}
			id = p.ID
		}
	}
	return id
}
