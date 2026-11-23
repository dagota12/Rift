import { useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import type { InputMsg } from '../types/protocol';

interface UseGameInputProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  send: (msg: unknown) => boolean;
}

export function useGameInput({ canvasRef, send }: UseGameInputProps) {
  const sequenceRef = useRef(1);
  const keysDown = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 400, y: 300 });
  const isMouseDown = useRef(false);
  const pendingShot = useRef(false);

  const { screen, myPlayerId, currentSnapshot } = useGameStore();

  // Keep a ref to the latest snapshot so our tick loop doesn't restart on every snapshot!
  const snapshotRef = useRef(currentSnapshot);
  snapshotRef.current = currentSnapshot;

  const myIdRef = useRef(myPlayerId);
  myIdRef.current = myPlayerId;

  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        if (screen === 'playing') e.preventDefault();
      }
      keysDown.current[e.code] = true;
      keysDown.current[e.key.toLowerCase()] = true;

      if (e.code === 'Space') {
        pendingShot.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.code] = false;
      keysDown.current[e.key.toLowerCase()] = false;
    };

    const updateMouseCoords = (clientX: number, clientY: number) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const scaleX = 800 / rect.width;
      const scaleY = 600 / rect.height;
      mousePos.current = {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    };

    const handleMouseMove = (e: MouseEvent) => {
      updateMouseCoords(e.clientX, e.clientY);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        isMouseDown.current = true;
        pendingShot.current = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [canvasRef, screen]);

  // Stable input transmission loop (fixed 30 Hz)
  // Depends ONLY on `screen === 'playing'` so it doesn't restart on every incoming snapshot!
  useEffect(() => {
    if (screen !== 'playing') return;

    const interval = setInterval(() => {
      let moveX = 0;
      let moveY = 0;

      const kd = keysDown.current;
      if (kd['KeyW'] || kd['w'] || kd['ArrowUp']) moveY -= 1;
      if (kd['KeyS'] || kd['s'] || kd['ArrowDown']) moveY += 1;
      if (kd['KeyA'] || kd['a'] || kd['ArrowLeft']) moveX -= 1;
      if (kd['KeyD'] || kd['d'] || kd['ArrowRight']) moveX += 1;

      // Find local player's current position to calculate aim angle
      let playerX = 400;
      let playerY = 300;
      const snap = snapshotRef.current;
      const myId = myIdRef.current;
      if (snap && myId) {
        const me = snap.players.find((p) => p.id === myId);
        if (me) {
          playerX = me.x;
          playerY = me.y;
        }
      }

      const dx = mousePos.current.x - playerX;
      const dy = mousePos.current.y - playerY;
      const aimAngle = Math.atan2(dy, dx);

      const shoot = isMouseDown.current || pendingShot.current;
      // Reset one-shot trigger after including in packet
      pendingShot.current = false;

      const msg: InputMsg = {
        type: 'input',
        sequence: sequenceRef.current++,
        moveX,
        moveY,
        aimAngle,
        shoot,
      };

      sendRef.current(msg);
    }, 1000 / 30); // 30 updates per second matching server tick rate

    return () => clearInterval(interval);
  }, [screen]);
}
