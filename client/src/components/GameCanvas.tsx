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
  const rendererRef = useRef<ArenaRenderer | null>(null);
  if (!rendererRef.current) {
    rendererRef.current = new ArenaRenderer();
  }

  // Attach input hook for WASD, aim angle, and shooting
  useGameInput({ canvasRef, send });

  // Main 60 FPS requestAnimationFrame render loop - runs stably on mount
  useEffect(() => {
    let animId: number;
    const renderer = rendererRef.current!;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const state = useGameStore.getState();
          renderer.render(
            ctx,
            state.currentSnapshot,
            state.previousSnapshot,
            state.snapshotTimestamp,
            state.myPlayerId,
            state.players
          );
        }
      }
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

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
