package game

// Input represents a player's intent for one frame.
// MoveX/MoveY are normalized direction components (-1, 0, or 1).
// AimAngle is in radians. Sequence enables ordering and reconciliation.
type Input struct {
	Sequence int64
	MoveX    float64
	MoveY    float64
	AimAngle float64
	Shoot    bool
}

// Player is the authoritative server-side player state.
type Player struct {
	ID    string
	X, Y  float64
	HP    int
	Alive bool

	// AimAngle is the direction the player is facing (radians).
	AimAngle float64

	// FireCooldown counts down ticks until the player can shoot again.
	FireCooldown int

	// LastAckSequence is the sequence number of the last input we processed.
	// Sent back in snapshots for client-side reconciliation.
	LastAckSequence int64

	// Kills tracks eliminations for the scoreboard.
	Kills int
}

// move applies directional input to the player's position for one tick,
// clamping to the arena bounds.
func (p *Player) move(moveX, moveY, dt float64) {
	if moveX == 0 && moveY == 0 {
		return
	}

	// Normalize diagonal movement so speed is consistent.
	if moveX != 0 && moveY != 0 {
		const invSqrt2 = 0.7071067811865475
		moveX *= invSqrt2
		moveY *= invSqrt2
	}

	p.X += moveX * PlayerSpeed * dt
	p.Y += moveY * PlayerSpeed * dt

	// Clamp to arena bounds with player radius as margin.
	if p.X < PlayerRadius {
		p.X = PlayerRadius
	}
	if p.X > ArenaWidth-PlayerRadius {
		p.X = ArenaWidth - PlayerRadius
	}
	if p.Y < PlayerRadius {
		p.Y = PlayerRadius
	}
	if p.Y > ArenaHeight-PlayerRadius {
		p.Y = ArenaHeight - PlayerRadius
	}
}
