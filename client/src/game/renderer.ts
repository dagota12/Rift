import type { PlayerInfo, PlayerSnapshot, ProjectileSnapshot, SnapshotMsg } from '../types/protocol';
import { soundManager } from './audio';

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

// Module-level static cache: images are downsampled to 64x64 and processed ONCE
let cachedPlayerSprite: HTMLCanvasElement | null = null;
let cachedEnemySprite: HTMLCanvasElement | null = null;

export class ArenaRenderer {
  private particles: Particle[] = [];
  private lastTime = performance.now();
  private playerSprite: HTMLCanvasElement | null = cachedPlayerSprite;
  private enemySprite: HTMLCanvasElement | null = cachedEnemySprite;
  private recoilMap = new Map<string, number>();
  private hitFlashMap = new Map<string, number>();
  private prevHpMap = new Map<string, number>();
  private knownProjectileIds = new Set<string>();

  constructor() {
    if (!this.playerSprite) {
      this.loadProcessedSprite('/sprites/player_tank.jpg', true, (canvas) => {
        this.playerSprite = canvas;
      });
    }
    if (!this.enemySprite) {
      this.loadProcessedSprite('/sprites/enemy_tank.jpg', false, (canvas) => {
        this.enemySprite = canvas;
      });
    }
  }

  private loadProcessedSprite(src: string, isMe: boolean, onLoad: (c: HTMLCanvasElement) => void) {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      // Downscale to 64x64 so processing 4,096 pixels takes <0.5ms instead of 1,000,000 pixels
      const targetSize = 64;
      const canvas = document.createElement('canvas');
      canvas.width = targetSize;
      canvas.height = targetSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, targetSize, targetSize);
      try {
        const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const maxVal = Math.max(d[i], d[i + 1], d[i + 2]);
          if (maxVal < 18) {
            d[i + 3] = 0;
          } else if (maxVal < 45) {
            d[i + 3] = Math.round(((maxVal - 18) / 27) * d[i + 3]);
          }
        }
        ctx.putImageData(imgData, 0, 0);
      } catch {
        // Fallback gracefully
      }
      if (isMe) cachedPlayerSprite = canvas;
      else cachedEnemySprite = canvas;
      onLoad(canvas);
    };
  }

  public spawnExplosion(x: number, y: number, color: string, count = 12) {
    if (this.particles.length > 50) return;
    const actualCount = Math.min(count, 12);
    for (let i = 0; i < actualCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color,
        alpha: 1,
        decay: 1.2 + Math.random() * 1.5,
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

    // Detect new projectiles to trigger shooting recoil, muzzle flash, and laser audio
    if (currentSnapshot?.projectiles) {
      for (const proj of currentSnapshot.projectiles) {
        if (!this.knownProjectileIds.has(proj.id)) {
          this.knownProjectileIds.add(proj.id);
          let shooterId: string | null = null;
          for (const p of currentSnapshot.players) {
            const dist = Math.hypot(p.x - proj.x, p.y - proj.y);
            if (dist < PLAYER_RADIUS + 35) {
              this.recoilMap.set(p.id, now);
              shooterId = p.id;
              break;
            }
          }
          soundManager.playLaser(shooterId === myPlayerId);
        }
      }
      if (this.knownProjectileIds.size > 200) {
        this.knownProjectileIds.clear();
      }
    }

    // 2. Interpolate and draw players
    if (currentSnapshot) {
      const playerMapPrev = new Map<string, PlayerSnapshot>();
      if (prevSnapshot) {
        for (const p of prevSnapshot.players) {
          playerMapPrev.set(p.id, p);
        }
      }

      // Check for damage to trigger shield ripple and impact sound
      for (const curr of currentSnapshot.players) {
        const prevHp = this.prevHpMap.get(curr.id);
        if (prevHp !== undefined && curr.hp < prevHp) {
          this.hitFlashMap.set(curr.id, now);
          this.spawnExplosion(curr.x, curr.y, '#ffffff', 8);
          soundManager.playHit();
        }
        this.prevHpMap.set(curr.id, curr.hp);
      }

      for (const curr of currentSnapshot.players) {
        if (!curr.alive) continue;

        const prev = playerMapPrev.get(curr.id) || curr;
        const x = this.lerp(prev.x, curr.x, alpha);
        const y = this.lerp(prev.y, curr.y, alpha);
        const isMe = curr.id === myPlayerId;
        const name = playersMap[curr.id]?.name || 'Player';
        const isMoving = Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.08;

        // Thruster exhaust particles when moving - rate-limited and capped
        if (isMoving && Math.random() < 0.25 && this.particles.length < 35) {
          const backAngle = curr.angle + Math.PI;
          const spread = (Math.random() - 0.5) * 0.4;
          const speed = 30 + Math.random() * 40;
          this.particles.push({
            x: x - Math.cos(curr.angle) * 16,
            y: y - Math.sin(curr.angle) * 16,
            vx: Math.cos(backAngle + spread) * speed,
            vy: Math.sin(backAngle + spread) * speed,
            size: 2,
            color: isMe ? '#00f0ff' : '#ff3366',
            alpha: 0.75,
            decay: 2.8,
          });
        }

        this.drawPlayer(ctx, x, y, curr.angle, curr.hp, isMe, name, curr.id, isMoving, now);
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
    name: string,
    playerId: string,
    isMoving: boolean,
    now: number
  ) {
    ctx.save();

    // Hover floating oscillation
    const hoverBob = Math.sin(now * 0.005 + (isMe ? 0 : 2.5)) * 1.5;
    ctx.translate(x, y + hoverBob);

    const baseColor = isMe ? '#00f0ff' : '#ff3366';
    const glowColor = isMe ? 'rgba(0, 240, 255, 0.3)' : 'rgba(255, 51, 102, 0.3)';

    // Ground ambient hover glow
    const groundGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 32);
    groundGlow.addColorStop(0, glowColor);
    groundGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 32, 0, Math.PI * 2);
    ctx.fill();

    // Recoil kick calculation (pushes backwards along aim axis)
    const recoilTime = this.recoilMap.get(playerId) || 0;
    const recoilElapsed = now - recoilTime;
    let recoilOffset = 0;
    const hasMuzzleFlash = recoilElapsed < 65;
    if (recoilElapsed < 120) {
      const progress = 1 - recoilElapsed / 120;
      recoilOffset = -4 * progress;
    }

    ctx.rotate(angle);

    // Thruster Jet Flares (behind the craft at rear-left)
    const jetFlicker = Math.sin(now * 0.04) * 3;
    const jetLength = isMoving ? 14 + jetFlicker : 6 + jetFlicker * 0.5;
    const jetColor = isMe ? 'rgba(0, 240, 255, 0.85)' : 'rgba(255, 51, 102, 0.85)';

    ctx.fillStyle = jetColor;
    for (const thrusterY of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(-18 + recoilOffset, thrusterY - 3);
      ctx.lineTo(-18 - jetLength + recoilOffset, thrusterY);
      ctx.lineTo(-18 + recoilOffset, thrusterY + 3);
      ctx.closePath();
      ctx.fill();
    }

    // Draw Sprite (or fallback vector if loading)
    const sprite = isMe ? this.playerSprite : this.enemySprite;
    const spriteW = 54;
    const spriteH = 50;

    if (sprite) {
      ctx.drawImage(
        sprite,
        -spriteW * 0.46 + recoilOffset,
        -spriteH / 2,
        spriteW,
        spriteH
      );
    } else {
      // Fallback geometric chassis
      ctx.beginPath();
      ctx.arc(recoilOffset, 0, PLAYER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isMe ? '#0d2836' : '#2b101c';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = baseColor;
      ctx.stroke();

      // Barrel
      ctx.beginPath();
      ctx.rect(recoilOffset, -3.5, PLAYER_RADIUS + 9, 7);
      ctx.fillStyle = baseColor;
      ctx.fill();
    }

    // Dynamic Pulsing Reactor Core in center
    const pulse = Math.sin(now * 0.007) * 0.25 + 0.75;
    const coreGlow = ctx.createRadialGradient(recoilOffset, 0, 1, recoilOffset, 0, 9 * pulse);
    coreGlow.addColorStop(0, '#ffffff');
    coreGlow.addColorStop(0.5, baseColor);
    coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(recoilOffset, 0, 9 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Dual Muzzle Flash when firing
    if (hasMuzzleFlash) {
      ctx.fillStyle = '#ffffff';
      for (const barrelY of [-7, 7]) {
        ctx.beginPath();
        ctx.arc(26 + recoilOffset, barrelY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Shield Hit Barrier Ripple on damage
    const hitTime = this.hitFlashMap.get(playerId) || 0;
    const hitElapsed = now - hitTime;
    if (hitElapsed < 260) {
      const hitProgress = 1 - hitElapsed / 260;
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (hitProgress * 0.8) + ')';
      ctx.lineWidth = 2.5 * hitProgress;
      ctx.beginPath();
      ctx.arc(0, 0, PLAYER_RADIUS + 10 * (1 - hitProgress * 0.3), 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();

    // Player overhead Name & Health Bar (not rotated)
    this.drawOverheadUI(ctx, x, y + hoverBob, hp, isMe, name);
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
