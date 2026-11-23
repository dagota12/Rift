import React from 'react';
import { useGameStore } from '../store/gameStore';

export const HUD: React.FC = () => {
  const {
    myPlayerId,
    currentSnapshot,
    eliminations,
    matchTimeRemaining,
  } = useGameStore();

  const myPlayer = currentSnapshot?.players.find((p) => p.id === myPlayerId);
  const myHp = myPlayer?.hp ?? 3;
  const aliveCount = currentSnapshot?.players.filter((p) => p.alive).length ?? 0;
  const totalCount = currentSnapshot?.players.length ?? 0;

  // Format time MM:SS
  const mins = Math.floor(matchTimeRemaining / 60);
  const secs = matchTimeRemaining % 60;
  const timeFormatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  return (
    <div className="hud-overlay">
      {/* Top Bar: Match Timer & Combatants Alive */}
      <div className="hud-top-bar">
        <div className="hud-stat-box">
          <span className="stat-label">PILOTS REMAINING</span>
          <span className="stat-value highlight-cyan">
            {aliveCount} <span className="stat-dim">/ {totalCount}</span>
          </span>
        </div>

        <div className="hud-timer-box">
          <span className="timer-label">ARENA COLLAPSE</span>
          <span className={`timer-value ${matchTimeRemaining <= 10 ? 'timer-danger' : ''}`}>
            {timeFormatted}
          </span>
        </div>

        <div className="hud-stat-box">
          <span className="stat-label">HULL INTEGRITY</span>
          <div className="hp-pips">
            {[1, 2, 3].map((pip) => (
              <span
                key={pip}
                className={`hp-pip ${
                  pip <= myHp ? (myHp === 3 ? 'pip-full' : myHp === 2 ? 'pip-med' : 'pip-low') : 'pip-empty'
                }`}
              ></span>
            ))}
          </div>
        </div>
      </div>

      {/* Kill Feed Notification (Top Right) */}
      <div className="kill-feed">
        {eliminations.map((item) => (
          <div key={item.id} className="kill-item">
            <span className="killer-name">{item.killerName}</span>
            <span className="kill-icon">💥</span>
            <span className="victim-name">{item.victimName}</span>
          </div>
        ))}
      </div>

      {/* Subtle Controls Tip (Bottom Left) */}
      <div className="hud-controls-tip">
        <span>WASD: Move</span> • <span>Mouse: Aim</span> • <span>Click / Space: Fire</span>
      </div>
    </div>
  );
};
