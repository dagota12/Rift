package room

import (
	"encoding/json"
	"log"
	"time"

	"github.com/rift-arena/server/internal/game"
	"github.com/rift-arena/server/internal/protocol"
)

const (
	defaultTickRate = 30 // ticks per second
)

// gameLoop replaces the Phase 1 stub run() with a real fixed-timestep loop.
// It owns the World and is the only goroutine that reads or writes game state.
func (r *Room) gameLoop(world *game.World) {
	defer r.cleanup()

	tickDuration := time.Second / time.Duration(defaultTickRate)
	dt := 1.0 / float64(defaultTickRate)

	ticker := time.NewTicker(tickDuration)
	defer ticker.Stop()

	matchTimer := time.NewTimer(60 * time.Second)
	defer matchTimer.Stop()

	for {
		select {
		case <-ticker.C:
			start := time.Now()

			// Drain pending inputs into the world before simulating.
			r.drainInputs(world)

			// Advance simulation by one tick.
			hits := world.Simulate(dt)

			// Broadcast hit and elimination events.
			r.broadcastHits(hits, world)

			// Check win condition.
			if winner, reason := r.checkWinCondition(world); reason != "" {
				r.broadcastGameOver(winner, reason, world)
				return
			}

			// Broadcast state snapshot to all players.
			r.broadcastSnapshot(world)

			// Measure and warn on tick overruns.
			elapsed := time.Since(start)
			if elapsed > tickDuration {
				log.Printf("room %s tick overrun: %v (budget %v)", r.ID, elapsed, tickDuration)
			}

		case inp := <-r.inputCh:
			// Queue inputs; they are consumed at the start of the next tick.
			r.queuedInputs = append(r.queuedInputs, inp)

		case <-matchTimer.C:
			// 60-second timeout — highest HP wins.
			winner, reason := r.timeoutWinner(world)
			r.broadcastGameOver(winner, reason, world)
			return

		case <-r.done:
			log.Printf("room %s game loop stopped", r.ID)
			return
		}
	}
}

// drainInputs applies all queued inputs to the world.
func (r *Room) drainInputs(world *game.World) {
	// Drain any inputs currently waiting in the channel.
drainLoop:
	for {
		select {
		case inp := <-r.inputCh:
			r.queuedInputs = append(r.queuedInputs, inp)
		default:
			break drainLoop
		}
	}

	for _, inp := range r.queuedInputs {
		var msg protocol.InputMsg
		if err := json.Unmarshal(inp.Raw, &msg); err != nil {
			continue
		}
		world.ApplyInput(inp.ClientID, game.Input{
			Sequence: msg.Sequence,
			MoveX:    clamp(msg.MoveX, -1, 1),
			MoveY:    clamp(msg.MoveY, -1, 1),
			AimAngle: msg.AimAngle,
			Shoot:    msg.Shoot,
		})
	}
	r.queuedInputs = r.queuedInputs[:0]
}

// checkWinCondition returns a winner ID and reason if the game is over.
// Returns ("", "") if the game should continue.
func (r *Room) checkWinCondition(world *game.World) (winner, reason string) {
	if world.AliveCount() <= 1 {
		return world.LastAlive(), "elimination"
	}
	return "", ""
}

// timeoutWinner determines the winner by HP when time runs out.
func (r *Room) timeoutWinner(world *game.World) (winner, reason string) {
	var topHP int
	var topID string
	var draw bool

	for _, p := range world.Players {
		if !p.Alive {
			continue
		}
		if p.HP > topHP {
			topHP = p.HP
			topID = p.ID
			draw = false
		} else if p.HP == topHP {
			draw = true
		}
	}

	if draw {
		return "", "draw"
	}
	return topID, "timeout"
}

// clamp restricts a value to [min, max].
func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
