package room

import (
	"encoding/json"
	"log"
	"math"

	"github.com/rift-arena/server/internal/game"
	"github.com/rift-arena/server/internal/protocol"
	"github.com/rift-arena/server/internal/transport"
)

// broadcastSnapshot serializes the current world state and sends it
// to every player's send channel.
func (r *Room) broadcastSnapshot(world *game.World) {
	playerSnaps := make([]protocol.PlayerSnapshot, 0, len(world.Players))
	for _, p := range world.Players {
		playerSnaps = append(playerSnaps, protocol.PlayerSnapshot{
			ID:    p.ID,
			X:     p.X,
			Y:     p.Y,
			HP:    p.HP,
			Angle: p.AimAngle,
			Alive: p.Alive,
		})
	}

	projSnaps := make([]protocol.ProjectileSnapshot, 0, len(world.Projectiles))
	for _, proj := range world.Projectiles {
		if proj.Alive {
			projSnaps = append(projSnaps, protocol.ProjectileSnapshot{
				ID:    proj.ID,
				X:     proj.X,
				Y:     proj.Y,
				Angle: math.Atan2(proj.VY, proj.VX),
			})
		}
	}

	msg := protocol.SnapshotMsg{
		Type:        protocol.EventSnapshot,
		Tick:        world.Tick,
		Players:     playerSnaps,
		Projectiles: projSnaps,
	}

	r.broadcast(msg)
}

// broadcastHits sends player_eliminated messages for any hits this tick.
func (r *Room) broadcastHits(hits []game.HitEvent, _ *game.World) {
	for _, h := range hits {
		if h.Eliminated {
			msg := protocol.PlayerEliminatedMsg{
				Type:       protocol.EventPlayerEliminated,
				PlayerID:   h.VictimID,
				ByPlayerID: h.AttackerID,
			}
			r.broadcast(msg)
		}
	}
}

// broadcastGameOver sends the game_over message to all players.
func (r *Room) broadcastGameOver(winner, reason string, world *game.World) {
	scoreboard := make([]protocol.ScoreEntry, 0, len(world.Players))
	for _, p := range world.Players {
		scoreboard = append(scoreboard, protocol.ScoreEntry{
			PlayerID: p.ID,
			Name:     r.playerName(p.ID),
			HP:       p.HP,
			Kills:    p.Kills,
		})
	}

	msg := protocol.GameOverMsg{
		Type:       protocol.EventGameOver,
		Winner:     winner,
		Reason:     reason,
		Scoreboard: scoreboard,
	}

	r.broadcast(msg)
	log.Printf("room %s game over — winner: %s reason: %s", r.ID, winner, reason)
}

// broadcast serializes v and sends it to every player's send channel.
func (r *Room) broadcast(v any) {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("broadcast marshal error: %v", err)
		return
	}
	for _, p := range r.players {
		r.sendTo(p, b)
	}
}

// sendTo sends a pre-serialized message to a single client.
// Non-blocking: drops the message if the send buffer is full.
func (r *Room) sendTo(p *transport.Client, b []byte) {
	select {
	case p.SendCh <- b:
	default:
		log.Printf("send buffer full for client %s — dropping message", p.ID)
	}
}

// playerName returns the display name for a player ID.
func (r *Room) playerName(id string) string {
	for _, p := range r.players {
		if p.ID == id {
			return p.Name
		}
	}
	return id
}
