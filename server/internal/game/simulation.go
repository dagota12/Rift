package game

import "math"

// cos and sin are thin wrappers so projectile.go doesn't need to import math directly.
func cos(angle float64) float64 { return math.Cos(angle) }
func sin(angle float64) float64 { return math.Sin(angle) }

// distance returns the Euclidean distance between two points.
func distance(x1, y1, x2, y2 float64) float64 {
	dx := x2 - x1
	dy := y2 - y1
	return math.Sqrt(dx*dx + dy*dy)
}

// HitEvent records a projectile hitting a player.
type HitEvent struct {
	VictimID    string
	AttackerID  string
	Eliminated  bool
}

// Simulate advances the world by one tick and returns any hit events.
// dt is the time step in seconds (e.g. 1.0/30 for 30 TPS).
// Only the room goroutine calls this.
func (w *World) Simulate(dt float64) []HitEvent {
	w.Tick++

	// 1. Process pending player inputs.
	for playerID, inp := range w.pendingInputs {
		p, ok := w.Players[playerID]
		if !ok || !p.Alive {
			continue
		}

		// Update aim and move.
		p.AimAngle = inp.AimAngle
		p.move(inp.MoveX, inp.MoveY, dt)
		p.LastAckSequence = inp.Sequence

		// Handle shooting with cooldown enforcement.
		if inp.Shoot && p.FireCooldown <= 0 {
			proj := newProjectile(p.ID, p.X, p.Y, p.AimAngle)
			w.Projectiles[proj.ID] = proj
			p.FireCooldown = FireCooldownTicks
		}
	}
	// Clear pending inputs after processing.
	w.pendingInputs = make(map[string]Input)

	// 2. Tick down fire cooldowns.
	for _, p := range w.Players {
		if p.FireCooldown > 0 {
			p.FireCooldown--
		}
	}

	// 3. Move projectiles and check collisions.
	var hits []HitEvent
	for id, proj := range w.Projectiles {
		if !proj.Alive {
			delete(w.Projectiles, id)
			continue
		}

		proj.move(dt)

		if proj.outOfBounds() {
			delete(w.Projectiles, id)
			continue
		}

		// Check against all living players (excluding the shooter).
		for _, p := range w.Players {
			if !p.Alive || p.ID == proj.OwnerID {
				continue
			}
			if distance(proj.X, proj.Y, p.X, p.Y) < PlayerRadius+ProjectileRadius {
				// Hit!
				proj.Alive = false
				delete(w.Projectiles, proj.ID)
				p.HP--

				eliminated := p.HP <= 0
				if eliminated {
					p.Alive = false
					// Credit the kill.
					if attacker, ok := w.Players[proj.OwnerID]; ok {
						attacker.Kills++
					}
				}

				hits = append(hits, HitEvent{
					VictimID:   p.ID,
					AttackerID: proj.OwnerID,
					Eliminated: eliminated,
				})
				break // one projectile hits one player
			}
		}
	}

	return hits
}
