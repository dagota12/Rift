// Protocol types mirroring the Go backend messages

export interface JoinQueueMsg {
  type: 'join_queue';
  name: string;
}

export interface InputMsg {
  type: 'input';
  sequence: number;
  moveX: number; // -1, 0, 1
  moveY: number; // -1, 0, 1
  aimAngle: number; // radians
  shoot: boolean;
}

export interface QueuedMsg {
  type: 'queued';
  position: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
}

export interface GameStartMsg {
  type: 'game_start';
  roomId: string;
  playerId: string;
  players: PlayerInfo[];
}

export interface PlayerSnapshot {
  id: string;
  x: number;
  y: number;
  hp: number;
  angle: number;
  alive: boolean;
  ackSeq: number;
}

export interface ProjectileSnapshot {
  id: string;
  x: number;
  y: number;
  angle: number;
}

export interface SnapshotMsg {
  type: 'snapshot';
  tick: number;
  ackSequence: number;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
}

export interface PlayerEliminatedMsg {
  type: 'player_eliminated';
  playerId: string;
  byPlayerId: string;
}

export interface ScoreEntry {
  playerId: string;
  name: string;
  hp: number;
  kills: number;
}

export interface GameOverMsg {
  type: 'game_over';
  winner: string; // player ID, or "" for draw
  reason: 'elimination' | 'timeout' | 'draw' | string;
  scoreboard: ScoreEntry[];
}

export type ServerMessage =
  | QueuedMsg
  | GameStartMsg
  | SnapshotMsg
  | PlayerEliminatedMsg
  | GameOverMsg;
