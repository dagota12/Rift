package game

import "github.com/google/uuid"

// Projectile is an authoritative server-side bullet.
type Projectile struct {
	ID       string
	X, Y     float64
	VX, VY   float64 // velocity components (pre-computed from angle)
	OwnerID  string
	Alive    bool
}

// newProjectile creates a bullet fired from (x, y) in the given direction.
func newProjectile(ownerID string, x, y, angle float64) *Projectile {
	vx := cos(angle) * ProjectileSpeed
	vy := sin(angle) * ProjectileSpeed
	return &Projectile{
		ID:      uuid.NewString(),
		X:       x,
		Y:       y,
		VX:      vx,
		VY:      vy,
		OwnerID: ownerID,
		Alive:   true,
	}
}

// move advances the projectile by dt seconds.
func (proj *Projectile) move(dt float64) {
	proj.X += proj.VX * dt
	proj.Y += proj.VY * dt
}

// outOfBounds returns true if the projectile has left the arena.
func (proj *Projectile) outOfBounds() bool {
	return proj.X < 0 || proj.X > ArenaWidth ||
		proj.Y < 0 || proj.Y > ArenaHeight
}
