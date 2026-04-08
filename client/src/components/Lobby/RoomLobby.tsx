import React, { useState } from 'react';
import { GameSettings, ChatMessage } from 'tractor-shared';
import SettingsPanel from './SettingsPanel';
import ChatPanel from '../Chat/ChatPanel';
import './RoomLobby.css';

interface RoomInfo {
  players: { id: string; name: string; connected?: boolean }[];
  spectators?: { id: string; name: string }[];
  settings: GameSettings;
  hostId: string;
  locked?: boolean;
}

interface RoomLobbyProps {
  roomId: string;
  playerId: string;
  roomInfo: RoomInfo;
  onUpdateSettings: (settings: Partial<GameSettings>) => void;
  onStartGame: () => void;
  onSwapPosition: (targetPlayerId: string) => void;
  onSendChat: (message: string) => void;
  chatMessages: ChatMessage[];
  onLeave: () => void;
  onLockRoom?: (locked: boolean) => void;
}

const RoomLobby: React.FC<RoomLobbyProps> = ({
  roomId, playerId, roomInfo, onUpdateSettings, onStartGame,
  onSwapPosition, onSendChat, chatMessages, onLeave, onLockRoom
}) => {
  const isHost = playerId === roomInfo.hostId;
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleStart = () => {
    setStarting(true);
    onStartGame();
  };

  return (
    <div className="room-lobby">
      <div className="room-lobby-bg" />
      <div className="room-lobby-content">
        <div className="room-lobby-header">
          <div>
            <button className="btn btn-text" onClick={onLeave}>&larr; Leave</button>
          </div>
          <div
            className="room-code-display"
            onClick={() => {
              navigator.clipboard.writeText(roomId);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            title="Click to copy"
          >
            <span className="room-code-label">{copied ? 'Copied!' : 'Room Code'}</span>
            <span className="room-code-value">{roomId}</span>
          </div>
          <div>
            {isHost && onLockRoom && (
              <button
                className={`btn btn-small ${roomInfo.locked ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onLockRoom(!roomInfo.locked)}
              >
                {roomInfo.locked ? 'Locked' : 'Lock Room'}
              </button>
            )}
          </div>
        </div>

        <div className="room-lobby-body">
          <div className="room-players-panel">
            <h3>Players ({roomInfo.players.length})</h3>
            <div className="room-player-list">
              {roomInfo.players.map((p) => (
                <div key={p.id} className={`room-player-item ${!p.connected && p.connected !== undefined ? 'disconnected' : ''}`}>
                  <div className="player-avatar-small">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="player-name-text">
                    {p.name}
                    {!p.connected && p.connected !== undefined && <span className="disconnected-tag"> (disconnected)</span>}
                  </span>
                  {p.id === roomInfo.hostId && (
                    <span className="host-tag">Host</span>
                  )}
                  {p.id !== playerId && (
                    <button
                      className="btn btn-swap"
                      onClick={() => onSwapPosition(p.id)}
                      title="Swap position"
                    >
                      &#8645;
                    </button>
                  )}
                </div>
              ))}
            </div>

            {(roomInfo.spectators?.length ?? 0) > 0 && (
              <div className="spectator-list">
                <h4 className="spectator-title">Spectators</h4>
                {roomInfo.spectators!.map(s => (
                  <div key={s.id} className="spectator-item">
                    <span className="spectator-name">{s.name}</span>
                  </div>
                ))}
              </div>
            )}

            {isHost && (
              <button
                className="btn btn-primary start-btn"
                onClick={handleStart}
                disabled={roomInfo.players.length < 2 || starting}
              >
                {starting ? (
                  <><span className="btn-spinner" /> Starting...</>
                ) : (
                  `Start Game (${roomInfo.players.length} players)`
                )}
              </button>
            )}
            {!isHost && (
              <div className="waiting-msg">Waiting for host to start...</div>
            )}
          </div>

          <div className="room-right-panel">
            <div className="room-settings-panel">
              <SettingsPanel
                settings={roomInfo.settings}
                onUpdate={onUpdateSettings}
                disabled={!isHost}
              />
            </div>
            <div className="room-chat-panel">
              <ChatPanel
                messages={chatMessages}
                onSend={onSendChat}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomLobby;
