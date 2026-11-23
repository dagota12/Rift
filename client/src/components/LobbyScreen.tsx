import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';

interface LobbyScreenProps {
  onJoinQueue: (name: string) => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({ onJoinQueue }) => {
  const { playerName, setPlayerName, serverConnected } = useGameStore();
  const [inputName, setInputName] = useState(playerName);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputName.trim() || 'Pilot_' + Math.floor(100 + Math.random() * 900);
    setPlayerName(trimmed);
    onJoinQueue(trimmed);
  };

  const handleRandomize = () => {
    const prefixes = ['Vortex', 'Cyber', 'Neon', 'Echo', 'Phantom', 'Nova', 'Pulse', 'Zero', 'Apex'];
    const suffixes = ['Striker', 'Ghost', 'Rogue', 'Blade', 'Viper', 'Titan', 'Fury', 'Rider'];
    const random = `${prefixes[Math.floor(Math.random() * prefixes.length)]}_${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
    setInputName(random);
    setPlayerName(random);
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card glassmorphism">
        <div className="header-badge">PORTFOLIO SHOWCASE • MULTIPLAYER ENGINE</div>

        <h1 className="game-title">
          RIFT <span className="title-highlight">ARENA</span>
        </h1>
        <p className="subtitle">Real-Time Authoritative Go WebSocket Battle Arena</p>

        <div className="server-status">
          <span className={`status-dot ${serverConnected ? 'connected' : 'disconnected'}`}></span>
          <span className="status-text">
            {serverConnected ? 'Server Online (:8087)' : 'Connecting to Server...'}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="lobby-form">
          <label className="input-label" htmlFor="player-name-input">CALLSIGN</label>
          <div className="input-group">
            <input
              id="player-name-input"
              type="text"
              maxLength={16}
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="Enter your name..."
              className="cyber-input"
            />
            <button
              type="button"
              onClick={handleRandomize}
              className="btn-secondary randomize-btn"
              title="Generate random name"
            >
              🎲
            </button>
          </div>

          <button
            type="submit"
            disabled={!serverConnected}
            className="btn-primary join-btn"
          >
            ENTER ARENA
          </button>
        </form>

        <div className="controls-guide">
          <div className="guide-title">COMBAT CONTROLS</div>
          <div className="guide-grid">
            <div className="guide-item">
              <span className="key-badge">W A S D</span>
              <span className="guide-desc">Move Ship</span>
            </div>
            <div className="guide-item">
              <span className="key-badge">MOUSE</span>
              <span className="guide-desc">Aim Turret</span>
            </div>
            <div className="guide-item">
              <span className="key-badge">CLICK / SPACE</span>
              <span className="guide-desc">Plasma Bolt</span>
            </div>
          </div>
        </div>

        <div className="tech-pills">
          <span className="pill">Go 1.23</span>
          <span className="pill">gorilla/websocket</span>
          <span className="pill">30 TPS Ticker</span>
          <span className="pill">Client Lerp</span>
        </div>
      </div>
    </div>
  );
};
