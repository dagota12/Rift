import React, { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { ArenaRenderer, ARENA_WIDTH, ARENA_HEIGHT } from '../game/renderer';
import { HUD } from './HUD';
import { useGameInput } from '../hooks/useGameInput';

interface GameCanvasProps {
  send: (msg: unknown) => boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ send }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<ArenaRenderer>(new ArenaRenderer());

  const {
    currentSnapshot,
    previousSnapshot,
    snapshotTimestamp,
    myPlayerId,
    players,
    eliminations,
  } = useGameStore();

  // Attach input hook for WASD, aim angle, and shooting
  useGameInput({ canvasRef, send });

  // Listen to eliminations to spawn visual explosions
  const prevElimCount = useRef(eliminations.length);
  useEffect(() => {
    if (eliminations.length > prevElimCount.current) {
      // Find victim pos
      const latest = eliminations[0];
      const victim = currentSnapshot?.players.find((p) => {
        const name = players[p.id]?.name;
        return name === latest.victimName;
      });
      if (victim) {
        rendererRef.current.spawnExplosion(victim.x, victim.y, '#ff0055', 30);
      }
    }
    prevElimCount.current = eliminations.length;
  }, [eliminations, currentSnapshot, players]);

  // Main 60 FPS requestAnimationFrame render loop
  useEffect(() => {
    let animId: number;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          rendererRef.current.render(
            ctx,
            currentSnapshot,
            previousSnapshot,
            snapshotTimestamp,
            myPlayerId,
            players
          );
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [currentSnapshot, previousSnapshot, snapshotTimestamp, myPlayerId, players]);

  return (
    <div className="game-viewport-container">
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={ARENA_WIDTH}
          height={ARENA_HEIGHT}
          className="arena-canvas"
        />
        <HUD />
      </div>
    </div>
  );
};
