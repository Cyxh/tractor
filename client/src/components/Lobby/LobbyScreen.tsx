import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import AccountSettings from './AccountSettings';
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
  onGetAccountEmail: () => Promise<{ email: string | null; emailVerified: boolean; error?: string }>;
  onRequestEmailVerification: (email: string) => Promise<{ error?: string }>;
  onVerifyEmail: (code: string) => Promise<{ error?: string }>;
  onUnlinkEmail: () => Promise<{ error?: string }>;
  onGetStats: () => Promise<any>;
  onRequestPasswordReset: (email: string) => Promise<{ error?: string }>;
  onResetPassword: (email: string, code: string, newPassword: string) => Promise<{ error?: string }>;
}

const LobbyScreen: React.FC<LobbyScreenProps> = ({
  roomList, onCreateRoom, onJoinRoom, authUser, onLogin, onRegister, onLogout, onChangeUsername, onChangePassword,
  onGetAccountEmail, onRequestEmailVerification, onVerifyEmail, onUnlinkEmail, onGetStats, onRequestPasswordReset, onResetPassword
}) => {
  const [playerName, setPlayerName] = useState(authUser?.username || '');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [authMode, setAuthMode] = useState<'guest' | 'login' | 'register' | null>(authUser ? 'guest' : null);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Forgot password state
  const [forgotMode, setForgotMode] = useState<'email' | 'code' | null>(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

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

    // Build a shuffled mini-deck: 2 jokers + 3 backs + 17 random suited cards
    const pool: { isJoker: boolean; isBigJoker: boolean; isBack: boolean; suitIdx: number; rankIdx: number }[] = [];
    pool.push({ isJoker: true, isBigJoker: true, isBack: false, suitIdx: 0, rankIdx: 0 });
    pool.push({ isJoker: true, isBigJoker: false, isBack: false, suitIdx: 0, rankIdx: 0 });
    for (let i = 0; i < 3; i++) pool.push({ isJoker: false, isBigJoker: false, isBack: true, suitIdx: 0, rankIdx: 0 });
    for (let i = 0; i < 17; i++) {
      pool.push({
        isJoker: false, isBigJoker: false, isBack: false,
        suitIdx: Math.floor(Math.random() * 4),
        rankIdx: Math.floor(Math.random() * 13),
      });
    }
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      cards.push({
        id: i,
        suit: suits[p.suitIdx],
        rank: ranks[p.rankIdx],
        isRed: p.suitIdx === 1 || p.suitIdx === 2,
        isFace: !p.isJoker && !p.isBack && (p.rankIdx >= 10),
        isAce: !p.isJoker && !p.isBack && p.rankIdx === 0,
        isJoker: p.isJoker, isBigJoker: p.isBigJoker, isBack: p.isBack,
        left: `${Math.random() * 94 + 3}%`,
        delay: `${-Math.random() * 30}s`,
        duration: `${18 + Math.random() * 12}s`,
        size: 0.7 + Math.random() * 0.3,
        startRotate: Math.random() * 40 - 20,
        endRotate: (Math.random() < 0.5 ? 1 : -1) * (20 + Math.random() * 60),
      });
    }
    return cards;
  }, []);

  // Generate sparkle data once with true randomness
  const sparkles = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 2 + Math.random() * 2,
      delay: Math.random() * 8,
      duration: 2 + Math.random() * 3,
    })),
  []);

  // Entrance animation trigger
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Panel transition system for smooth switching between auth screens
  type Panel = 'auth-select' | 'login' | 'register' | 'guest-lobby' | 'forgot-password';
  const getPanel = (): Panel => {
    if (forgotMode) return 'forgot-password';
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

  // Exploding cards state
  const [explodedCards, setExplodedCards] = useState<Set<number>>(new Set());
  const [explosions, setExplosions] = useState<{ id: number; x: number; y: number; fragments: { dx: number; dy: number; rot: number; size: number; hue: number }[] }[]>([]);

  const handleCardExplode = (cardId: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    setExplodedCards(prev => { const s = new Set(prev); s.add(cardId); return s; });
    const fragments = Array.from({ length: 10 }, () => ({
      dx: (Math.random() - 0.5) * 260,
      dy: (Math.random() - 0.5) * 260,
      rot: Math.random() * 720 - 360,
      size: 6 + Math.random() * 12,
      hue: Math.random() * 50 + 20,
    }));
    setExplosions(prev => [...prev, { id: cardId, x, y, fragments }]);
    setTimeout(() => setExplosions(prev => prev.filter(p => p.id !== cardId)), 700);
  };

  const renderFloatingCard = (c: typeof floatingCards[number]) => {
    if (explodedCards.has(c.id)) return null;

    // Depth: smaller cards go behind bigger ones
    const fcStyle = {
      left: c.left, animationDelay: c.delay, animationDuration: c.duration,
      '--start-rotate': `${c.startRotate}deg`, '--end-rotate': `${c.endRotate}deg`, '--fc-scale': c.size,
      zIndex: Math.round(c.size * 10),
    } as React.CSSProperties;

    const onClick = (e: React.MouseEvent) => handleCardExplode(c.id, e);

    // Card back
    if (c.isBack) {
      return (
        <div key={c.id} className="fc" style={fcStyle} onClick={onClick}>
          <div className="fc-inner fc-back">
            <div className="fc-back-pattern" />
          </div>
        </div>
      );
    }

    // Joker
    if (c.isJoker) {
      return (
        <div key={c.id} className="fc" style={fcStyle} onClick={onClick}>
          <div className={`fc-inner fc-joker ${c.isBigJoker ? 'fc-joker-big' : 'fc-joker-little'}`}>
            <span className="fc-joker-star">{c.isBigJoker ? '\u2605' : '\u2606'}</span>
          </div>
        </div>
      );
    }

    // Normal card
    const colorCls = c.isRed ? 'fc-red' : 'fc-black';

    return (
      <div key={c.id} className="fc" style={fcStyle} onClick={onClick}>
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
      <div className="floating-cards-layer">
        {floatingCards.map(renderFloatingCard)}
      </div>
      {explosions.map(exp => (
        <div key={exp.id} className="fc-explosion" style={{ left: exp.x, top: exp.y }} aria-hidden>
          {exp.fragments.map((f, i) => (
            <div key={i} className="fc-fragment" style={{
              '--frag-dx': `${f.dx}px`, '--frag-dy': `${f.dy}px`, '--frag-rot': `${f.rot}deg`,
              width: f.size, height: f.size,
              background: `hsl(${f.hue}, 80%, 60%)`,
            } as React.CSSProperties} />
          ))}
        </div>
      ))}
      <div className="lobby-sparkles" aria-hidden>
        {sparkles.map(s => (
          <div
            key={s.id}
            className="sparkle"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
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

  const openSettings = () => setShowSettings(true);

  // Subtitle per panel — use target panel during 'out' phase so it updates at the midpoint
  const [displayedSubtitle, setDisplayedSubtitle] = useState(() => {
    const p = getPanel();
    return p === 'login' ? 'Log In'
      : p === 'register' ? 'Create Account'
      : p === 'forgot-password' ? 'Reset Password'
      : 'Sheng Ji / Finding Friends Online';
  });
  const [subtitleFading, setSubtitleFading] = useState(false);

  // Sync subtitle with panel transitions: fade out, swap text, fade in
  const prevSubtitlePanel = useRef(displayedPanel);
  useEffect(() => {
    if (displayedPanel === prevSubtitlePanel.current) return;
    prevSubtitlePanel.current = displayedPanel;
    const newSub = displayedPanel === 'login' ? 'Log In'
      : displayedPanel === 'register' ? 'Create Account'
      : displayedPanel === 'forgot-password' ? 'Reset Password'
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
              {displayedPanel === 'login' && (
                <button className="btn btn-text" style={{ marginTop: 4 }} onClick={() => {
                  setForgotMode('email');
                  setForgotEmail('');
                  setForgotCode('');
                  setForgotNewPw('');
                  setForgotError('');
                  setForgotSuccess('');
                }}>
                  Forgot Password?
                </button>
              )}
            </div>
          </div>
        );

      case 'forgot-password':
        return (
          <div className="lobby-card">
            {forgotMode === 'email' && (
              <div className="lobby-section">
                <label className="lobby-label">Enter your account's linked email</label>
                <input
                  className="lobby-input"
                  type="email"
                  placeholder="Enter email address..."
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter' && forgotEmail.trim()) {
                      setForgotLoading(true);
                      setForgotError('');
                      const result = await onRequestPasswordReset(forgotEmail.trim());
                      setForgotLoading(false);
                      if (result.error) setForgotError(result.error);
                      else setForgotMode('code');
                    }
                  }}
                  autoFocus
                />
              </div>
            )}
            {forgotMode === 'code' && (
              <>
                <div className="lobby-section">
                  <label className="lobby-label">Reset code sent to {forgotEmail}</label>
                  <input
                    className="lobby-input"
                    type="text"
                    placeholder="Enter 6-digit code..."
                    value={forgotCode}
                    onChange={e => setForgotCode(e.target.value)}
                    maxLength={6}
                    autoFocus
                  />
                </div>
                <div className="lobby-section">
                  <label className="lobby-label">New Password</label>
                  <input
                    className="lobby-input"
                    type="password"
                    placeholder="Enter new password..."
                    value={forgotNewPw}
                    onChange={e => setForgotNewPw(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && forgotCode.trim() && forgotNewPw) {
                        setForgotLoading(true);
                        setForgotError('');
                        const result = await onResetPassword(forgotEmail.trim(), forgotCode.trim(), forgotNewPw);
                        setForgotLoading(false);
                        if (result.error) setForgotError(result.error);
                        else {
                          setForgotSuccess('Password reset! You can now log in.');
                          setTimeout(() => { setForgotMode(null); setAuthMode('login'); }, 2000);
                        }
                      }
                    }}
                  />
                </div>
              </>
            )}
            {forgotError && <div className="auth-error">{forgotError}</div>}
            {forgotSuccess && <div className="settings-success">{forgotSuccess}</div>}
            <div className="lobby-actions">
              {forgotMode === 'email' && (
                <button
                  className="btn btn-primary lobby-btn"
                  onClick={async () => {
                    if (!forgotEmail.trim()) return;
                    setForgotLoading(true);
                    setForgotError('');
                    const result = await onRequestPasswordReset(forgotEmail.trim());
                    setForgotLoading(false);
                    if (result.error) setForgotError(result.error);
                    else setForgotMode('code');
                  }}
                  disabled={forgotLoading || !forgotEmail.trim()}
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Code'}
                </button>
              )}
              {forgotMode === 'code' && (
                <button
                  className="btn btn-primary lobby-btn"
                  onClick={async () => {
                    if (!forgotCode.trim() || !forgotNewPw) return;
                    setForgotLoading(true);
                    setForgotError('');
                    const result = await onResetPassword(forgotEmail.trim(), forgotCode.trim(), forgotNewPw);
                    setForgotLoading(false);
                    if (result.error) setForgotError(result.error);
                    else {
                      setForgotSuccess('Password reset! You can now log in.');
                      setTimeout(() => { setForgotMode(null); setAuthMode('login'); }, 2000);
                    }
                  }}
                  disabled={forgotLoading || !forgotCode.trim() || !forgotNewPw}
                >
                  {forgotLoading ? 'Resetting...' : 'Reset Password'}
                </button>
              )}
              <button className="btn btn-text" onClick={() => { setForgotMode(null); }}>
                &larr; Back to Login
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
      {showSettings && authUser && (
        <AccountSettings
          username={authUser.username}
          onClose={() => setShowSettings(false)}
          onChangeUsername={onChangeUsername}
          onChangePassword={onChangePassword}
          onGetAccountEmail={onGetAccountEmail}
          onRequestEmailVerification={onRequestEmailVerification}
          onVerifyEmail={onVerifyEmail}
          onUnlinkEmail={onUnlinkEmail}
          onGetStats={onGetStats}
        />
      )}
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
