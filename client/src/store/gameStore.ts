import { create } from 'zustand';
import type { GameOverMsg, PlayerInfo, SnapshotMsg } from '../types/protocol';

export type GameScreen = 'lobby' | 'queue' | 'playing' | 'game_over';

export interface EliminationFeedItem {
  id: string;
  victimName: string;
  killerName: string;
  timestamp: number;
}

interface GameState {
  screen: GameScreen;
  playerName: string;
  myPlayerId: string | null;
  roomId: string | null;
  queuePosition: number;
  players: Record<string, PlayerInfo>;
  currentSnapshot: SnapshotMsg | null;
  previousSnapshot: SnapshotMsg | null;
  snapshotTimestamp: number;
  eliminations: EliminationFeedItem[];
  gameOverData: GameOverMsg | null;
  matchTimeRemaining: number;
  serverConnected: boolean;

  // Actions
  setPlayerName: (name: string) => void;
  setScreen: (screen: GameScreen) => void;
  setServerConnected: (connected: boolean) => void;
  handleQueued: (position: number) => void;
  handleGameStart: (roomId: string, playerId: string, playersList: PlayerInfo[]) => void;
  handleSnapshot: (snap: SnapshotMsg) => void;
  handleElimination: (victimId: string, killerId: string) => void;
  handleGameOver: (data: GameOverMsg) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'lobby',
  playerName: 'Player_' + Math.floor(100 + Math.random() * 900),
  myPlayerId: null,
  roomId: null,
  queuePosition: 0,
  players: {},
  currentSnapshot: null,
  previousSnapshot: null,
  snapshotTimestamp: 0,
  eliminations: [],
  gameOverData: null,
  matchTimeRemaining: 60,
  serverConnected: false,

  setPlayerName: (name: string) => set({ playerName: name }),
  setScreen: (screen: GameScreen) => set({ screen }),
  setServerConnected: (connected: boolean) => set({ serverConnected: connected }),

  handleQueued: (position: number) =>
    set({
      screen: 'queue',
      queuePosition: position,
    }),

  handleGameStart: (roomId: string, playerId: string, playersList: PlayerInfo[]) => {
    const playersMap: Record<string, PlayerInfo> = {};
    for (const p of playersList) {
      playersMap[p.id] = p;
    }
    set({
      screen: 'playing',
      roomId,
      myPlayerId: playerId,
      players: playersMap,
      eliminations: [],
      gameOverData: null,
      matchTimeRemaining: 60,
    });
  },

  handleSnapshot: (snap: SnapshotMsg) => {
    const state = get();
    // Estimate match timer from tick: 60s total, 30 TPS = 1800 ticks
    const ticksLeft = Math.max(0, 1800 - snap.tick);
    const secsLeft = Math.ceil(ticksLeft / 30);

    set({
      previousSnapshot: state.currentSnapshot,
      currentSnapshot: snap,
      snapshotTimestamp: performance.now(),
      matchTimeRemaining: secsLeft,
    });
  },

  handleElimination: (victimId: string, killerId: string) => {
    const state = get();
    const victim = state.players[victimId]?.name || 'Unknown';
    const killer = state.players[killerId]?.name || 'Unknown';
    const item: EliminationFeedItem = {
      id: `${victimId}-${killerId}-${Date.now()}`,
      victimName: victim,
      killerName: killer,
      timestamp: Date.now(),
    };
    set({
      eliminations: [item, ...state.eliminations].slice(0, 5),
    });
  },

  handleGameOver: (data: GameOverMsg) => {
    set({
      screen: 'game_over',
      gameOverData: data,
    });
  },

  resetGame: () => {
    set({
      screen: 'lobby',
      roomId: null,
      myPlayerId: null,
      currentSnapshot: null,
      previousSnapshot: null,
      gameOverData: null,
      eliminations: [],
      matchTimeRemaining: 60,
    });
  },
}));
