import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { useGameStore } from '../store/gameStore';

interface ScoreboardProps {
  onPlayAgain: () => void;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({ onPlayAgain }) => {
  const { gameOverData, myPlayerId, players } = useGameStore();

  const isWinner = gameOverData?.winner === myPlayerId;
  const isDraw = gameOverData?.reason === 'draw' || !gameOverData?.winner;

  useEffect(() => {
    if (isWinner) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00f0ff', '#ff0055', '#ffe600', '#7928ca'],
      });
    }
  }, [isWinner]);

  return (
    <div className="scoreboard-modal-backdrop">
      <div className="scoreboard-card glassmorphism">
        <div className="results-header">
          {isDraw ? (
            <h1 className="outcome-title draw">STALEMATE (DRAW)</h1>
          ) : isWinner ? (
            <h1 className="outcome-title victory">VICTORY ACHIEVED</h1>
          ) : (
            <h1 className="outcome-title defeat">CHASSIS DESTROYED</h1>
          )}
          <p className="outcome-reason">
            Round concluded via {gameOverData?.reason ?? 'combat resolution'}
          </p>
        </div>

        {/* Scoreboard table */}
        <div className="scoreboard-table-container">
          <table className="scoreboard-table">
            <thead>
              <tr>
                <th>RANK</th>
                <th>PILOT</th>
                <th>KILLS</th>
                <th>HP REMAINING</th>
              </tr>
            </thead>
            <tbody>
              {gameOverData?.scoreboard?.map((entry, idx) => {
                const isMe = entry.playerId === myPlayerId;
                const isRoundWinner = entry.playerId === gameOverData.winner;
                return (
                  <tr key={entry.playerId} className={`${isMe ? 'row-me' : ''} ${isRoundWinner ? 'row-winner' : ''}`}>
                    <td>
                      <span className="rank-badge">#{idx + 1}</span>
                    </td>
                    <td>
                      <span className="pilot-name">
                        {entry.name || players[entry.playerId]?.name || 'Unknown'}
                        {isMe && <span className="you-pill">YOU</span>}
                        {isRoundWinner && <span className="winner-pill">👑 WINNER</span>}
                      </span>
                    </td>
                    <td className="center-cell">{entry.kills}</td>
                    <td className="center-cell">{entry.hp} / 3</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button onClick={onPlayAgain} className="btn-primary play-again-btn">
          ENTER NEXT ARENA
        </button>
      </div>
    </div>
  );
};
