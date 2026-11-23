import type { PlayerInfo, PlayerSnapshot, ProjectileSnapshot, SnapshotMsg } from '../types/protocol';

export const ARENA_WIDTH = 800;
export const ARENA_HEIGHT = 600;
export const PLAYER_RADIUS = 16;
export const PROJECTILE_RADIUS = 4;
export const MAX_HP = 3;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export class ArenaRenderer {
  private particles: Particle[] = [];
  private lastTime = performance.now();

  public spawnExplosion(x: number, y: number, color: string, count = 24) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 200;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 4,
        color,
        alpha: 1,
        decay: 0.8 + Math.random() * 1.5,
      });
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    currentSnapshot: SnapshotMsg | null,
    prevSnapshot: SnapshotMsg | null,
    snapshotTimestamp: number,
    myPlayerId: string | null,
    playersMap: Record<string, PlayerInfo>
  ) {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    // Clear background
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // 1. Draw arena grid & sci-fi floor accents
    this.drawFloor(ctx);

    // Calculate interpolation alpha (30 TPS = ~33.3ms between snapshots)
    const timeSinceSnap = now - snapshotTimestamp;
    const alpha = Math.max(0, Math.min(timeSinceSnap / 33.3, 1.2));

    // 2. Interpolate and draw players
    if (currentSnapshot) {
      const playerMapPrev = new Map<string, PlayerSnapshot>();
      if (prevSnapshot) {
        for (const p of prevSnapshot.players) {
          playerMapPrev.set(p.id, p);
        }
      }

      for (const curr of currentSnapshot.players) {
        if (!curr.alive) continue;

        const prev = playerMapPrev.get(curr.id) || curr;
        const x = this.lerp(prev.x, curr.x, alpha);
        const y = this.lerp(prev.y, curr.y, alpha);
        const isMe = curr.id === myPlayerId;
        const name = playersMap[curr.id]?.name || 'Player';

        this.drawPlayer(ctx, x, y, curr.angle, curr.hp, isMe, name);
      }

      // 3. Draw projectiles
      this.drawProjectiles(ctx, currentSnapshot.projectiles);
    }

    // 4. Update and render particles
    this.updateParticles(ctx, dt);

    // 5. Draw glowing arena boundary
    this.drawBoundary(ctx);
  }

  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.min(Math.max(t, 0), 1);
  }

  private drawFloor(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // Grid pattern
    const gridSize = 40;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_WIDTH, y);
      ctx.stroke();
    }

    // Center arena markings
    const cx = ARENA_WIDTH / 2;
    const cy = ARENA_HEIGHT / 2;

    const radGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 260);
    radGrad.addColorStop(0, 'rgba(120, 50, 255, 0.08)');
    radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Center ring
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(147, 51, 234, 0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center focal dot
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(147, 51, 234, 0.4)';
    ctx.fill();

    ctx.restore();
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    hp: number,
    isMe: boolean,
    name: string
  ) {
    ctx.save();
    ctx.translate(x, y);

    const baseColor = isMe ? '#00f0ff' : '#ff3366';
    const glowColor = isMe ? 'rgba(0, 240, 255, 0.6)' : 'rgba(255, 51, 102, 0.6)';

    // Ground ambient glow
    const groundGlow = ctx.createRadialGradient(0, 0, 5, 0, 0, 32);
    groundGlow.addColorStop(0, glowColor);
    groundGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();

    // Player body chassis
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = isMe ? '#0d2836' : '#2b101c';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = baseColor;
    ctx.shadowColor = baseColor;
    ctx.shadowBlur = isMe ? 12 : 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Turret barrel pointing in aim direction
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(0, -3.5, PLAYER_RADIUS + 9, 7);
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Turret center core
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.restore();

    // Player overhead Name & Health Bar (not rotated)
    this.drawOverheadUI(ctx, x, y, hp, isMe, name);
  }

  private drawOverheadUI(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    hp: number,
    isMe: boolean,
    name: string
  ) {
    ctx.save();

    // Name tag
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#70f3ff' : '#ff94b3';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    const label = isMe ? `${name} (YOU)` : name;
    ctx.fillText(label, x, y - PLAYER_RADIUS - 16);
    ctx.shadowBlur = 0;

    // 3-pip Health Bar
    const barWidth = 36;
    const barHeight = 5;
    const barX = x - barWidth / 2;
    const barY = y - PLAYER_RADIUS - 10;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Segments
    const segmentWidth = (barWidth - 4) / MAX_HP;
    for (let i = 0; i < MAX_HP; i++) {
      const segX = barX + 1 + i * (segmentWidth + 1);
      if (i < hp) {
        // Active HP segment
        if (hp === 3) ctx.fillStyle = '#00ff88';
        else if (hp === 2) ctx.fillStyle = '#ffbb00';
        else ctx.fillStyle = '#ff3344';
        ctx.fillRect(segX, barY + 1, segmentWidth, barHeight - 2);
      } else {
        // Lost HP
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(segX, barY + 1, segmentWidth, barHeight - 2);
      }
    }

    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, projectiles: ProjectileSnapshot[]) {
    ctx.save();
    for (const proj of projectiles) {
      // Plasma glow
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;

      ctx.beginPath();
      ctx.arc(proj.x, proj.y, PROJECTILE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Outer ring
      ctx.beginPath();
      ctx.arc(proj.x, proj.y, PROJECTILE_RADIUS + 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  private updateParticles(ctx: CanvasRenderingContext2D, dt: number) {
    if (this.particles.length === 0) return;

    ctx.save();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha -= p.decay * dt;

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fill();
    }
    ctx.restore();
  }

  private drawBoundary(ctx: CanvasRenderingContext2D) {
    ctx.save();
    // Glowing neon cyan boundary border
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.7)';
    ctx.shadowBlur = 12;
    ctx.strokeRect(1.5, 1.5, ARENA_WIDTH - 3, ARENA_HEIGHT - 3);

    // Corner hazard accents
    const cornerSize = 20;
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(255, 0, 85, 0.8)';
    ctx.shadowBlur = 8;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(cornerSize, 2);
    ctx.lineTo(2, 2);
    ctx.lineTo(2, cornerSize);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(ARENA_WIDTH - cornerSize, 2);
    ctx.lineTo(ARENA_WIDTH - 2, 2);
    ctx.lineTo(ARENA_WIDTH - 2, cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(2, ARENA_HEIGHT - cornerSize);
    ctx.lineTo(2, ARENA_HEIGHT - 2);
    ctx.lineTo(cornerSize, ARENA_HEIGHT - 2);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(ARENA_WIDTH - cornerSize, ARENA_HEIGHT - 2);
    ctx.lineTo(ARENA_WIDTH - 2, ARENA_HEIGHT - 2);
    ctx.lineTo(ARENA_WIDTH - 2, ARENA_HEIGHT - cornerSize);
    ctx.stroke();

    ctx.restore();
  }
}
