import React from 'react';
import { useGameStore } from './store/gameStore';
import { useWebSocket } from './hooks/useWebSocket';
import { LobbyScreen } from './components/LobbyScreen';
import { MatchmakingScreen } from './components/MatchmakingScreen';
import { GameCanvas } from './components/GameCanvas';
import { Scoreboard } from './components/Scoreboard';
import type { JoinQueueMsg } from './types/protocol';

export const App: React.FC = () => {
  const { screen, setScreen, resetGame, playerName } = useGameStore();
  const { send } = useWebSocket();

  const handleJoinQueue = (name: string) => {
    const msg: JoinQueueMsg = {
      type: 'join_queue',
      name,
    };
    send(msg);
    setScreen('queue');
  };

  const handleCancelMatchmaking = () => {
    resetGame();
  };

  const handlePlayAgain = () => {
    resetGame();
    handleJoinQueue(playerName);
  };

  return (
    <div className="app-root">
      {screen === 'lobby' && (
        <LobbyScreen onJoinQueue={handleJoinQueue} />
      )}

      {screen === 'queue' && (
        <MatchmakingScreen onCancel={handleCancelMatchmaking} />
      )}

      {(screen === 'playing' || screen === 'game_over') && (
        <GameCanvas send={send} />
      )}

      {screen === 'game_over' && (
        <Scoreboard onPlayAgain={handlePlayAgain} />
      )}
    </div>
  );
};

export default App;
