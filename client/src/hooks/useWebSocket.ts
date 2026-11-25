import { useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import type { ServerMessage } from '../types/protocol';
import { soundManager } from '../game/audio';

const WS_PORT = 8087;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  const {
    setServerConnected,
    handleQueued,
    handleGameStart,
    handleSnapshot,
    handleElimination,
    handleGameOver,
  } = useGameStore();

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const envUrl = import.meta.env.VITE_WS_URL;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const wsUrl = envUrl || `${protocol}//${host}:${WS_PORT}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setServerConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          switch (msg.type) {
            case 'queued':
              handleQueued(msg.position);
              break;
            case 'game_start':
              handleGameStart(msg.roomId, msg.playerId, msg.players);
              soundManager.playMatchFound();
              break;
            case 'snapshot':
              handleSnapshot(msg);
              break;
            case 'player_eliminated':
              handleElimination(msg.playerId, msg.byPlayerId);
              soundManager.playExplosion();
              break;
            case 'game_over': {
              handleGameOver(msg);
              const myId = useGameStore.getState().myPlayerId;
              soundManager.playGameOver(msg.winner === myId);
              break;
            }
            default:
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };

      ws.onclose = () => {
        setServerConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 2 seconds if not connected
        if (!reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 2000);
        }
      };
    } catch (e) {
      console.error('WebSocket creation failed:', e);
    }
  }, [setServerConnected, handleQueued, handleGameStart, handleSnapshot, handleElimination, handleGameOver]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { send, ws: wsRef.current };
}
