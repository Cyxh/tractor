import { useState, useEffect, useCallback } from 'react';
import { PlayerView, Card, GameSettings, FriendDeclaration, ChatMessage } from 'tractor-shared';

interface RoomInfo {
  players: { id: string; name: string; connected?: boolean }[];
  spectators?: { id: string; name: string }[];
  settings: GameSettings;
  hostId: string;
  locked?: boolean;
  chatMessages?: ChatMessage[];
}

interface RoomListItem {
  id: string;
  playerCount: number;
  maxPlayers: number;
  gameMode: string;
  inProgress: boolean;
  hostName: string;
}

interface AuthUser {
  username: string;
  token: string;
}

const SESSION_KEY = 'tractor_session';
const AUTH_KEY = 'tractor_auth';

function saveSession(roomId: string, playerName: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, playerName, ts: Date.now() }));
  } catch {}
}

function loadSession(): { roomId: string; playerName: string } | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    // Sessions expire after 2 hours
    if (Date.now() - parsed.ts > 2 * 60 * 60 * 1000) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

function saveAuth(auth: AuthUser) {
  try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch {}
}

function loadAuth(): AuthUser | null {
  try {
    const data = localStorage.getItem(AUTH_KEY);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

function clearAuth() {
  try { localStorage.removeItem(AUTH_KEY); } catch {}
}

export function useGame(ws: { send: (msg: any) => void; on: (type: string, handler: (payload: any) => void) => () => void; connected: boolean }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [gameState, setGameState] = useState<PlayerView | null>(null);
  const [roomList, setRoomList] = useState<RoomListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [spectators, setSpectators] = useState<{ id: string; name: string }[]>([]);
  const [attemptedRejoin, setAttemptedRejoin] = useState(false);
  const [authUser, setAuthUser] = useState<{ username: string } | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Load saved auth on mount
  useEffect(() => {
    const saved = loadAuth();
    if (saved) {
      setAuthUser({ username: saved.username });
      setAuthToken(saved.token);
    }
  }, []);

  // Reset rejoin flag on disconnect so we rejoin on reconnect
  useEffect(() => {
    if (!ws.connected) {
      setAttemptedRejoin(false);
    }
  }, [ws.connected]);

  // Re-request game state after reconnection if we're in a game
  useEffect(() => {
    if (!ws.connected || !roomId) return;
    // Small delay to let rejoin complete first
    const timer = setTimeout(() => {
      ws.send({ type: 'request_state', payload: {} });
    }, 500);
    return () => clearTimeout(timer);
  }, [ws.connected]);

  // Send authenticate whenever token or connection changes
  useEffect(() => {
    if (!ws.connected || !authToken) return;
    ws.send({ type: 'authenticate', payload: { token: authToken } });
  }, [ws.connected, authToken, ws]);

  // Attempt rejoin on connect
  useEffect(() => {
    if (!ws.connected || attemptedRejoin) return;
    setAttemptedRejoin(true);

    // Try account-based rejoin first
    if (authToken) {
      fetch('/api/me', { headers: { Authorization: `Bearer ${authToken}` } })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.session?.roomId && data?.session?.playerName) {
            ws.send({ type: 'rejoin_room', payload: { roomId: data.session.roomId, playerName: data.session.playerName } });
          }
        })
        .catch(() => {});
      return;
    }

    // Fall back to localStorage session
    const session = loadSession();
    if (session) {
      ws.send({ type: 'rejoin_room', payload: { roomId: session.roomId, playerName: session.playerName } });
    }
  }, [ws.connected, attemptedRejoin, ws, authToken]);

  useEffect(() => {
    const unsubs = [
      ws.on('room_created', (payload: { roomId: string }) => {
        setRoomId(payload.roomId);
      }),
      ws.on('room_joined', (payload: { roomId: string; playerId: string }) => {
        setRoomId(payload.roomId);
        setPlayerId(payload.playerId);
        if (playerName) {
          saveSession(payload.roomId, playerName);
        }
      }),
      ws.on('room_update', (payload: RoomInfo) => {
        setRoomInfo(payload);
        if (payload.spectators) setSpectators(payload.spectators);
        if (payload.chatMessages) {
          setChatMessages(payload.chatMessages);
        }
      }),
      ws.on('game_state', (payload: PlayerView) => {
        setGameState(payload);
        setError(null);
        if (payload.chatMessages) {
          setChatMessages(payload.chatMessages);
        }
      }),
      ws.on('room_list', (payload: RoomListItem[]) => {
        setRoomList(payload);
      }),
      ws.on('chat', (payload: ChatMessage) => {
        setChatMessages(prev => [...prev, payload]);
      }),
      ws.on('error', (payload: { message: string }) => {
        setError(payload.message);
        setTimeout(() => setError(null), 3000);
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [ws, playerName]);

  const authLogin = useCallback(async (username: string, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Login failed' };
      setAuthUser({ username: data.username });
      setAuthToken(data.token);
      saveAuth({ username: data.username, token: data.token });
      // Send auth to WS
      ws.send({ type: 'authenticate', payload: { token: data.token } });
      // Auto-rejoin if session exists
      if (data.session?.roomId && data.session?.playerName) {
        setPlayerName(data.session.playerName);
        ws.send({ type: 'rejoin_room', payload: { roomId: data.session.roomId, playerName: data.session.playerName } });
      }
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, [ws]);

  const authRegister = useCallback(async (username: string, password: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Registration failed' };
      setAuthUser({ username: data.username });
      setAuthToken(data.token);
      saveAuth({ username: data.username, token: data.token });
      ws.send({ type: 'authenticate', payload: { token: data.token } });
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, [ws]);

  const authLogout = useCallback(() => {
    setAuthUser(null);
    setAuthToken(null);
    clearAuth();
  }, []);

  // Helper for authenticated fetch — auto-logout on expired token
  const authFetch = useCallback(async (url: string, options: RequestInit = {}): Promise<Response> => {
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers as Record<string, string>, Authorization: `Bearer ${authToken}` },
    });
    if (res.status === 401) {
      setAuthUser(null);
      setAuthToken(null);
      clearAuth();
    }
    return res;
  }, [authToken]);

  const changeUsername = useCallback(async (newUsername: string): Promise<{ error?: string }> => {
    if (!authToken) return { error: 'Not logged in' };
    try {
      const res = await authFetch('/api/change-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newUsername }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to change username' };
      setAuthUser({ username: data.username });
      saveAuth({ username: data.username, token: authToken });
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, [authToken]);

  const getAccountEmail = useCallback(async (): Promise<{ email: string | null; emailVerified: boolean; error?: string }> => {
    if (!authToken) return { email: null, emailVerified: false, error: 'Not logged in' };
    try {
      const res = await authFetch('/api/account-email');
      const data = await res.json();
      if (!res.ok) return { email: null, emailVerified: false, error: data.error };
      return data;
    } catch { return { email: null, emailVerified: false, error: 'Network error' }; }
  }, [authToken]);

  const requestEmailVerification = useCallback(async (email: string): Promise<{ error?: string }> => {
    if (!authToken) return { error: 'Not logged in' };
    try {
      const res = await authFetch('/api/request-email-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed' };
      return {};
    } catch { return { error: 'Network error' }; }
  }, [authToken]);

  const verifyEmail = useCallback(async (code: string): Promise<{ error?: string }> => {
    if (!authToken) return { error: 'Not logged in' };
    try {
      const res = await authFetch('/api/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed' };
      return {};
    } catch { return { error: 'Network error' }; }
  }, [authToken]);

  const unlinkEmail = useCallback(async (): Promise<{ error?: string }> => {
    if (!authToken) return { error: 'Not logged in' };
    try {
      const res = await authFetch('/api/unlink-email', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed' };
      return {};
    } catch { return { error: 'Network error' }; }
  }, [authToken]);

  const fetchStats = useCallback(async () => {
    if (!authToken) return null;
    try {
      const res = await authFetch('/api/stats');
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }, [authToken, authFetch]);

  const requestPasswordReset = useCallback(async (email: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) { const data = await res.json(); return { error: data.error || 'Failed' }; }
      return {};
    } catch { return { error: 'Network error' }; }
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed' };
      return {};
    } catch { return { error: 'Network error' }; }
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string): Promise<{ error?: string }> => {
    if (!authToken) return { error: 'Not logged in' };
    try {
      const res = await authFetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to change password' };
      return {};
    } catch {
      return { error: 'Network error' };
    }
  }, [authToken]);

  const createRoom = useCallback((name: string) => {
    setPlayerName(name);
    ws.send({ type: 'create_room', payload: { playerName: name } });
  }, [ws]);

  const joinRoom = useCallback((roomId: string, name: string) => {
    setPlayerName(name);
    ws.send({ type: 'join_room', payload: { roomId, playerName: name } });
  }, [ws]);

  const updateSettings = useCallback((settings: Partial<GameSettings>) => {
    ws.send({ type: 'update_settings', payload: { settings } });
  }, [ws]);

  const startGame = useCallback(() => {
    ws.send({ type: 'start_game', payload: {} });
  }, [ws]);

  const bid = useCallback((cards: Card[]) => {
    ws.send({ type: 'bid', payload: { cards } });
  }, [ws]);

  const exchangeKitty = useCallback((kitty: Card[]) => {
    ws.send({ type: 'exchange_kitty', payload: { kitty } });
  }, [ws]);

  const declareFriends = useCallback((declarations: FriendDeclaration[]) => {
    ws.send({ type: 'declare_friends', payload: { declarations } });
  }, [ws]);

  const playCards = useCallback((cards: Card[]) => {
    ws.send({ type: 'play_cards', payload: { cards } });
  }, [ws]);

  const nextRound = useCallback(() => {
    ws.send({ type: 'next_round', payload: {} });
  }, [ws]);

  const swapPosition = useCallback((targetPlayerId: string) => {
    ws.send({ type: 'swap_position', payload: { targetPlayerId } });
  }, [ws]);

  const voteRandomKitty = useCallback(() => {
    ws.send({ type: 'vote_random_kitty', payload: {} });
  }, [ws]);

  const pickupKitty = useCallback(() => {
    ws.send({ type: 'pickup_kitty', payload: {} });
  }, [ws]);

  const confirmReady = useCallback(() => {
    ws.send({ type: 'confirm_ready', payload: {} });
  }, [ws]);

  const lockRoom = useCallback((locked: boolean) => {
    ws.send({ type: 'lock_room', payload: { locked } });
  }, [ws]);

  const toggleDevMode = useCallback(() => {
    ws.send({ type: 'toggle_dev_mode', payload: { token: authToken } });
  }, [ws, authToken]);

  const devSwitchPlayer = useCallback((targetPlayerId: string) => {
    ws.send({ type: 'dev_switch_player', payload: { targetPlayerId } });
  }, [ws]);

  const spectateAs = useCallback((targetPlayerId: string) => {
    ws.send({ type: 'spectate_as', payload: { playerId: targetPlayerId } });
  }, [ws]);

  const sendChat = useCallback((message: string) => {
    ws.send({ type: 'chat', payload: { message } });
  }, [ws]);

  const leaveRoom = useCallback(() => {
    ws.send({ type: 'leave_room', payload: {} });
    clearSession();
    setRoomId(null);
    setRoomInfo(null);
    setGameState(null);
    setChatMessages([]);
    setPlayerId(null);
  }, [ws]);

  return {
    playerId,
    playerName,
    roomId,
    roomInfo,
    gameState,
    roomList,
    error,
    chatMessages,
    authUser,
    authLogin,
    authRegister,
    authLogout,
    changeUsername,
    changePassword,
    getAccountEmail,
    requestEmailVerification,
    verifyEmail,
    unlinkEmail,
    fetchStats,
    requestPasswordReset,
    resetPassword,
    createRoom,
    joinRoom,
    updateSettings,
    startGame,
    bid,
    exchangeKitty,
    declareFriends,
    playCards,
    nextRound,
    swapPosition,
    voteRandomKitty,
    pickupKitty,
    confirmReady,
    spectators,
    lockRoom,
    toggleDevMode,
    devSwitchPlayer,
    spectateAs,
    sendChat,
    leaveRoom,
  };
}
