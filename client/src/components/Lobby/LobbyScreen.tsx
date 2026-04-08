import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import './LobbyScreen.css';

interface RoomListItem {
  id: string;
  playerCount: number;
  maxPlayers: number;
  gameMode: string;
  inProgress: boolean;
  hostName: string;
}

interface LobbyScreenProps {
  roomList: RoomListItem[];
  onCreateRoom: (name: string) => void;
  onJoinRoom: (roomId: string, name: string) => void;
  authUser: { username: string } | null;
  onLogin: (username: string, password: string) => Promise<{ error?: string }>;
  onRegister: (username: string, password: string) => Promise<{ error?: string }>;
  onLogout: () => void;
  onChangeUsername: (newUsername: string) => Promise<{ error?: string }>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<{ error?: string }>;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomList, onCreateRoom, onJoinRoom, authUser, onLogin, onRegister, onLogout, onChangeUsername, onChangePassword
}) => {
  const [playerName, setPlayerName] = useState(authUser?.username || '');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [authMode, setAuthMode] = useState<'guest' | 'login' | 'register' | null>(authUser ? 'guest' : null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'username' | 'password'>('username');
  const [newUsername, setNewUsername] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);

  // Pip positions (same as Card.tsx)
  const pipPositions: Record<string, [number, number][]> = useMemo(() => ({
    'A': [[0.5, 0.5]],
    '2': [[0.5, 0.25], [0.5, 0.75]],
    '3': [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
    '4': [[0.3, 0.25], [0.7, 0.25], [0.3, 0.75], [0.7, 0.75]],
    '5': [[0.3, 0.25], [0.7, 0.25], [0.5, 0.5], [0.3, 0.75], [0.7, 0.75]],
    '6': [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
    '7': [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
    '8': [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65], [0.3, 0.8], [0.7, 0.8]],
    '9': [[0.3, 0.18], [0.7, 0.18], [0.3, 0.39], [0.7, 0.39], [0.5, 0.5], [0.3, 0.61], [0.7, 0.61], [0.3, 0.82], [0.7, 0.82]],
    '10': [[0.3, 0.18], [0.7, 0.18], [0.5, 0.29], [0.3, 0.39], [0.7, 0.39], [0.3, 0.61], [0.7, 0.61], [0.5, 0.71], [0.3, 0.82], [0.7, 0.82]],
  }), []);

  const faceSymbols: Record<string, string> = { 'J': '\u265E', 'Q': '\u2655', 'K': '\u2654' };
  const faceLabels: Record<string, string> = { 'J': 'JACK', 'Q': 'QUEEN', 'K': 'KING' };

  // Generate floating card data once
  const floatingCards = useMemo(() => {
    const suits = ['\u2660', '\u2665', '\u2666', '\u2663'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const cards: {
      id: number; suit: string; rank: string; isRed: boolean; isFace: boolean; isAce: boolean;
      isJoker: boolean; isBigJoker: boolean; isBack: boolean;
      left: string; delay: string; duration: string; size: number; startRotate: number; endRotate: number;
    }[] = [];

    for (let i = 0; i < 22; i++) {
      const isBack = i >= 19;
      const isJoker = i === 17 || i === 18;
      const isBigJoker = i === 17;
      const suitIdx = i % 4;
      const rankIdx = i % 13;
      cards.push({
        id: i,
        suit: suits[suitIdx],
        rank: ranks[rankIdx],
        isRed: suitIdx === 1 || suitIdx === 2,
        isFace: !isJoker && !isBack && (rankIdx >= 10), // J=10, Q=11, K=12
        isAce: !isJoker && !isBack && rankIdx === 0,
        isJoker, isBigJoker, isBack,
        left: `${(i * 4.7 + 1) % 98}%`,
        delay: `${i * -1.5}s`,
        duration: `${20 + (i % 7) * 3}s`,
        size: 0.7 + (i % 4) * 0.1,
        startRotate: (i * 31) % 40 - 20,
        endRotate: (i % 2 === 0 ? 1 : -1) * (30 + (i * 17) % 50),
      });
    }
    return cards;
  }, []);

  // Entrance animation trigger
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Panel transition system for smooth switching between auth screens
  type Panel = 'auth-select' | 'login' | 'register' | 'guest-lobby' | 'settings';
  const getPanel = (): Panel => {
    if (showSettings && authUser) return 'settings';
    if (authMode === null) return 'auth-select';
    if (authMode === 'login') return 'login';
    if (authMode === 'register') return 'register';
    return 'guest-lobby';
  };
  const currentPanel = getPanel();
  const [displayedPanel, setDisplayedPanel] = useState<Panel>(currentPanel);
  const [panelPhase, setPanelPhase] = useState<'out' | 'in' | null>(null);
  const prevPanelRef = useRef(currentPanel);

  useEffect(() => {
    if (currentPanel === prevPanelRef.current) return;
    prevPanelRef.current = currentPanel;
    setPanelPhase('out');
    const exitTimer = setTimeout(() => {
      setDisplayedPanel(currentPanel);
      setPanelPhase('in');
      const enterTimer = setTimeout(() => setPanelPhase(null), 350);
      return () => clearTimeout(enterTimer);
    }, 250);
    return () => clearTimeout(exitTimer);
  }, [currentPanel]);

  const panelClass = panelPhase === 'out' ? 'panel-exit' : panelPhase === 'in' ? 'panel-enter' : '';

  // Track displayed rooms with exit animations
  type DisplayedRoom = RoomListItem & { removing?: boolean };
  const [displayedRooms, setDisplayedRooms] = useState<DisplayedRoom[]>(roomList.map(r => ({ ...r })));
  const removeTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setDisplayedRooms(prev => {
      const currentIds = new Set(roomList.map(r => r.id));
      const prevIds = new Set(prev.map(r => r.id));

      // Update existing & mark removed
      const result: DisplayedRoom[] = prev.map(r => {
        if (!currentIds.has(r.id)) {
          // Room was removed — mark for exit animation
          if (!r.removing) {
            if (!removeTimers.current.has(r.id)) {
              const timer = setTimeout(() => {
                setDisplayedRooms(d => d.filter(x => x.id !== r.id));
                removeTimers.current.delete(r.id);
              }, 400);
              removeTimers.current.set(r.id, timer);
            }
            return { ...r, removing: true };
          }
          return r;
        }
        // Update with latest data
        const updated = roomList.find(x => x.id === r.id)!;
        return { ...updated, removing: false };
      });

      // Add new rooms
      for (const r of roomList) {
        if (!prevIds.has(r.id)) {
          result.push({ ...r });
        }
      }

      return result;
    });
  }, [roomList]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { removeTimers.current.forEach(t => clearTimeout(t)); };
  }, []);

  // Smooth height animation for panel wrapper
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!panelRef.current) return;
    const measure = () => {
      if (panelRef.current) {
        setPanelHeight(panelRef.current.scrollHeight);
      }
    };
    requestAnimationFrame(measure);
  }, [displayedPanel, panelPhase, displayedRooms.length]);

  const renderFloatingCard = (c: typeof floatingCards[number]) => {
    // Card back
    if (c.isBack) {
      return (
        <div key={c.id}
          className="fc"
          style={{
            left: c.left, animationDelay: c.delay, animationDuration: c.duration,
            '--start-rotate': `${c.startRotate}deg`, '--end-rotate': `${c.endRotate}deg`, '--fc-scale': c.size,
          } as React.CSSProperties}
        >
          <div className="fc-inner fc-back">
            <div className="fc-back-pattern" />
          </div>
        </div>
      );
    }

    // Joker
    if (c.isJoker) {
      return (
        <div key={c.id}
          className="fc"
          style={{
            left: c.left, animationDelay: c.delay, animationDuration: c.duration,
            '--start-rotate': `${c.startRotate}deg`, '--end-rotate': `${c.endRotate}deg`, '--fc-scale': c.size,
          } as React.CSSProperties}
        >
          <div className={`fc-inner fc-joker ${c.isBigJoker ? 'fc-joker-big' : 'fc-joker-little'}`}>
            <span className="fc-joker-star">{c.isBigJoker ? '\u2605' : '\u2606'}</span>
          </div>
        </div>
      );
    }

    // Normal card
    const colorCls = c.isRed ? 'fc-red' : 'fc-black';

    return (
      <div key={c.id}
        className="fc"
        style={{
          left: c.left, animationDelay: c.delay, animationDuration: c.duration,
          '--start-rotate': `${c.startRotate}deg`, '--end-rotate': `${c.endRotate}deg`, '--fc-scale': c.size,
        } as React.CSSProperties}
      >
        <div className={`fc-inner fc-face ${colorCls}`}>
          {/* Corners */}
          <div className="fc-corner fc-corner-tl">
            <span className="fc-corner-rank">{c.rank}</span>
            <span className="fc-corner-suit">{c.suit}</span>
          </div>
          <div className="fc-corner fc-corner-br">
            <span className="fc-corner-rank">{c.rank}</span>
            <span className="fc-corner-suit">{c.suit}</span>
          </div>
          {/* Center */}
          <div className="fc-center">
            {c.isAce && <span className="fc-ace-pip">{c.suit}</span>}
            {c.isFace && (
              <div className="fc-face-center">
                <span className="fc-face-symbol">{faceSymbols[c.rank]}</span>
                <span className="fc-face-label">{faceLabels[c.rank]}</span>
                <span className="fc-face-suit">{c.suit}</span>
              </div>
            )}
            {!c.isAce && !c.isFace && pipPositions[c.rank] && (
              <div className="fc-pips">
                {pipPositions[c.rank].map(([x, y], i) => (
                  <span key={i} className={`fc-pip ${y > 0.5 ? 'fc-pip-inv' : ''}`}
                    style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>{c.suit}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBackground = () => (
    <>
      <div className="lobby-bg" />
      <div className="lobby-vignette" />
      <div className="floating-cards-layer" aria-hidden>
        {floatingCards.map(renderFloatingCard)}
      </div>
      <div className="lobby-sparkles" aria-hidden>
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            className="sparkle"
            style={{
              left: `${(i * 4.1 + 1) % 100}%`,
              top: `${(i * 7.3 + 3) % 100}%`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>
    </>
  );

  const handleLogout = () => {
    onLogout();
    setAuthMode(null);
    setPlayerName('');
  };

  const handleCreate = () => {
    const name = authUser ? authUser.username : playerName.trim();
    if (name) {
      onCreateRoom(name);
    }
  };

  const handleJoin = (roomId?: string) => {
    const id = roomId || joinRoomId.trim();
    const name = authUser ? authUser.username : playerName.trim();
    if (name && id) {
      onJoinRoom(id, name);
    }
  };

  const handleAuth = async (mode: 'login' | 'register') => {
    if (!authUsername.trim() || !authPassword) return;
    setAuthLoading(true);
    setAuthError('');
    const fn = mode === 'login' ? onLogin : onRegister;
    const result = await fn(authUsername.trim(), authPassword);
    setAuthLoading(false);
    if (result.error) {
      setAuthError(result.error);
    } else {
      setAuthMode('guest'); // authenticated, go to lobby
    }
  };

  const handleChangeUsername = async () => {
    if (!newUsername.trim()) return;
    setSettingsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');
    const result = await onChangeUsername(newUsername.trim());
    setSettingsLoading(false);
    if (result.error) {
      setSettingsError(result.error);
    } else {
      setSettingsSuccess('Username changed successfully');
      setNewUsername('');
    }
  };

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) return;
    setSettingsLoading(true);
    setSettingsError('');
    setSettingsSuccess('');
    const result = await onChangePassword(currentPw, newPw);
    setSettingsLoading(false);
    if (result.error) {
      setSettingsError(result.error);
    } else {
      setSettingsSuccess('Password changed successfully');
      setCurrentPw('');
      setNewPw('');
    }
  };

  const openSettings = () => {
    setShowSettings(true);
    setSettingsError('');
    setSettingsSuccess('');
    setNewUsername('');
    setCurrentPw('');
    setNewPw('');
  };

  // Subtitle per panel — use target panel during 'out' phase so it updates at the midpoint
  const [displayedSubtitle, setDisplayedSubtitle] = useState(() => {
    const p = getPanel();
    return p === 'settings' ? 'Account Settings'
      : p === 'login' ? 'Log In'
      : p === 'register' ? 'Create Account'
      : 'Sheng Ji / Finding Friends Online';
  });
  const [subtitleFading, setSubtitleFading] = useState(false);

  // Sync subtitle with panel transitions: fade out, swap text, fade in
  const prevSubtitlePanel = useRef(displayedPanel);
  useEffect(() => {
    if (displayedPanel === prevSubtitlePanel.current) return;
    prevSubtitlePanel.current = displayedPanel;
    const newSub = displayedPanel === 'settings' ? 'Account Settings'
      : displayedPanel === 'login' ? 'Log In'
      : displayedPanel === 'register' ? 'Create Account'
      : 'Sheng Ji / Finding Friends Online';
    if (newSub !== displayedSubtitle) {
      setSubtitleFading(true);
      const t = setTimeout(() => {
        setDisplayedSubtitle(newSub);
        setSubtitleFading(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [displayedPanel, displayedSubtitle]);

  const displayName = authUser ? authUser.username : playerName.trim();

  const renderPanel = () => {
    switch (displayedPanel) {
      case 'settings':
        return (
          <div className="lobby-card">
            <div className="settings-tabs">
              <button
                className={`settings-tab ${settingsTab === 'username' ? 'active' : ''}`}
                onClick={() => { setSettingsTab('username'); setSettingsError(''); setSettingsSuccess(''); }}
              >
                Change Username
              </button>
              <button
                className={`settings-tab ${settingsTab === 'password' ? 'active' : ''}`}
                onClick={() => { setSettingsTab('password'); setSettingsError(''); setSettingsSuccess(''); }}
              >
                Change Password
              </button>
            </div>

            {settingsTab === 'username' && (
              <div className="lobby-section" style={{ marginTop: 16 }}>
                <label className="lobby-label">Current Username</label>
                <div className="settings-current-value">{authUser?.username}</div>
                <label className="lobby-label" style={{ marginTop: 12 }}>New Username</label>
                <input
                  className="lobby-input"
                  type="text"
                  placeholder="Enter new username..."
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangeUsername()}
                  maxLength={20}
                  autoFocus
                />
              </div>
            )}

            {settingsTab === 'password' && (
              <div className="lobby-section" style={{ marginTop: 16 }}>
                <label className="lobby-label">Current Password</label>
                <input
                  className="lobby-input"
                  type="password"
                  placeholder="Enter current password..."
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  autoFocus
                />
                <label className="lobby-label" style={{ marginTop: 12 }}>New Password</label>
                <input
                  className="lobby-input"
                  type="password"
                  placeholder="Enter new password..."
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                />
              </div>
            )}

            {settingsError && <div className="auth-error">{settingsError}</div>}
            {settingsSuccess && <div className="settings-success">{settingsSuccess}</div>}

            <div className="lobby-actions">
              <button
                className="btn btn-primary lobby-btn"
                onClick={settingsTab === 'username' ? handleChangeUsername : handleChangePassword}
                disabled={settingsLoading || (settingsTab === 'username' ? !newUsername.trim() : !currentPw || !newPw)}
              >
                {settingsLoading ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-text" onClick={() => setShowSettings(false)}>
                &larr; Back to Lobby
              </button>
            </div>
          </div>
        );

      case 'auth-select':
        return (
          <div className="lobby-card glow-border">
            <div className="auth-options">
              <button className="btn btn-primary lobby-btn btn-shine" onClick={() => setAuthMode('guest')}>
                Play as Guest
              </button>
              <div className="auth-divider"><span>or</span></div>
              <button className="btn btn-secondary lobby-btn" onClick={() => setAuthMode('login')}>
                Log In
              </button>
              <button className="btn btn-secondary lobby-btn" onClick={() => setAuthMode('register')}>
                Create Account
              </button>
            </div>
          </div>
        );

      case 'login':
      case 'register':
        return (
          <div className="lobby-card">
            <div className="lobby-section">
              <label className="lobby-label">Username</label>
              <input
                className="lobby-input"
                type="text"
                placeholder="Enter username..."
                value={authUsername}
                onChange={e => setAuthUsername(e.target.value)}
                maxLength={20}
                autoFocus
              />
            </div>
            <div className="lobby-section">
              <label className="lobby-label">Password</label>
              <input
                className="lobby-input"
                type="password"
                placeholder="Enter password..."
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAuth(displayedPanel as 'login' | 'register')}
              />
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <div className="lobby-actions">
              <button
                className="btn btn-primary lobby-btn"
                onClick={() => handleAuth(displayedPanel as 'login' | 'register')}
                disabled={authLoading || !authUsername.trim() || !authPassword}
              >
                {authLoading ? 'Loading...' : displayedPanel === 'login' ? 'Log In' : 'Create Account'}
              </button>
              <button className="btn btn-text" onClick={() => { setAuthMode(null); setAuthError(''); }}>
                &larr; Back
              </button>
            </div>
          </div>
        );

      case 'guest-lobby':
        return (
          <>
            <div className="lobby-card glow-border">
              {authUser ? (
                <div className="lobby-section auth-user-bar">
                  <span className="auth-user-name">Logged in as <strong>{authUser.username}</strong></span>
                  <div className="auth-user-actions">
                    <button className="btn btn-text btn-small" onClick={openSettings} title="Account Settings">&#9881;</button>
                    <button className="btn btn-text btn-small" onClick={handleLogout}>Log Out</button>
                  </div>
                </div>
              ) : (
                <div className="lobby-section">
                  <label className="lobby-label">Your Name</label>
                  <input
                    className="lobby-input"
                    type="text"
                    placeholder="Enter your name..."
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                    maxLength={16}
                  />
                </div>
              )}

              <div className="lobby-actions">
                <button
                  className="btn btn-primary lobby-btn"
                  onClick={handleCreate}
                  disabled={!displayName}
                >
                  Create Room
                </button>

                <div className="lobby-join-row">
                  <input
                    className="lobby-input lobby-input-code"
                    type="text"
                    placeholder="Room Code"
                    value={joinRoomId}
                    onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                    maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  />
                  <button
                    className="btn btn-secondary lobby-btn"
                    onClick={() => handleJoin()}
                    disabled={!displayName || !joinRoomId.trim()}
                  >
                    Join
                  </button>
                </div>
              </div>

              {!authUser && (
                <button className="btn btn-text" style={{ marginTop: 8, width: '100%' }} onClick={() => { setAuthMode(null); }}>
                  &larr; Back to Login
                </button>
              )}
            </div>

            {displayedRooms.length > 0 && (
              <div className="lobby-rooms">
                <h3 className="rooms-title">Open Rooms</h3>
                <div className="room-list">
                  {displayedRooms.map(room => (
                    <div key={room.id} className={`room-item ${room.removing ? 'room-item-exit' : ''}`}>
                      <div className="room-info">
                        <span className="room-code">{room.id}</span>
                        <span className="room-host">{room.hostName}</span>
                        <span className="room-mode">{room.gameMode === 'findingFriends' ? 'Finding Friends' : 'Tractor'}</span>
                      </div>
                      <div className="room-meta">
                        <span className="room-players">{room.playerCount} players</span>
                        {room.inProgress ? (
                          <span className="room-status in-progress">In Progress</span>
                        ) : (
                          <button
                            className="btn btn-small btn-secondary"
                            onClick={() => handleJoin(room.id)}
                            disabled={!displayName || room.removing}
                          >
                            Join
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        );
    }
  };

  return (
    <div className="lobby-screen">
      {renderBackground()}
      <div className={`lobby-content ${entered ? 'entered' : ''}`}>
        <div className="lobby-header">
          <h1 className="lobby-title">
            <span className="title-icon float-icon">&#9824;</span>
            <span className="title-text">Tractor</span>
            <span className="title-icon red float-icon">&#9829;</span>
          </h1>
          <p className={`lobby-subtitle ${subtitleFading ? 'subtitle-changing' : ''}`}>{displayedSubtitle}</p>
        </div>

        <div
          className={`lobby-panel-outer ${panelPhase ? 'height-animating' : ''}`}
          style={panelHeight !== undefined ? { height: panelHeight } : undefined}
        >
          <div ref={panelRef} className={`lobby-panel ${panelClass}`}>
            {renderPanel()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LobbyScreen;
