import React from 'react';
import { useGameStore } from '../store/gameStore';

interface MatchmakingScreenProps {
  onCancel: () => void;
}

export const MatchmakingScreen: React.FC<MatchmakingScreenProps> = ({ onCancel }) => {
  const { queuePosition, playerName } = useGameStore();

  return (
    <div className="matchmaking-container">
      <div className="matchmaking-card glassmorphism">
        <div className="radar-box">
          <div className="radar-sweep"></div>
          <div className="radar-circle radar-c1"></div>
          <div className="radar-circle radar-c2"></div>
          <div className="radar-circle radar-c3"></div>
          <div className="radar-blip blip-1"></div>
          <div className="radar-center-dot"></div>
        </div>

        <h2 className="mm-title">SEARCHING FOR OPPONENTS</h2>
        <p className="mm-pilot">Pilot: <span className="highlight-cyan">{playerName}</span></p>

        <div className="queue-badge">
          <span className="queue-label">QUEUE POSITION</span>
          <span className="queue-value">#{queuePosition || 1}</span>
        </div>

        <p className="mm-hint">
          Waiting for match fill window (2–4 players)...
        </p>

        <button onClick={onCancel} className="btn-secondary cancel-btn">
          CANCEL MATCHMAKING
        </button>
      </div>
    </div>
  );
};
