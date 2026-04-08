import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './room.js';
import { ClientMessage, Card, decomposePlay, hasWonGame } from 'tractor-shared';
import { register, login, validateToken, setAccountRoom, getAccountSession, changeUsername, changePassword, getAccountEmail, requestEmailVerification, verifyEmailCode, unlinkEmail, requestPasswordReset, resetPassword, getStats, incrementStats, updateStats } from './accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const roomManager = new RoomManager();

// Track player-to-room mapping and account associations
const playerRooms = new Map<string, string>();
const playerAccounts = new Map<string, string>(); // playerId -> username
let nextPlayerId = 1;

app.use(express.json());

// Serve built frontend in production
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));


// REST endpoints for room listing
app.get('/api/rooms', (_req, res) => {
  const rooms = roomManager.getAllRooms().map(r => r.getRoomInfo());
  res.json(rooms);
});

// Auth endpoints
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  const result = register(username, password);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ token: result.token, username: username.trim().toLowerCase() });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  const result = login(username, password);
  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }
  // Return session info so client can auto-rejoin
  const session = getAccountSession(username.trim().toLowerCase());
  res.json({ token: result.token, username: username.trim().toLowerCase(), session });
});

app.post('/api/change-username', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  const { newUsername } = req.body;
  if (!newUsername) { res.status(400).json({ error: 'New username required' }); return; }
  const result = changeUsername(username, newUsername);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ username: newUsername.trim().toLowerCase() });
});

app.post('/api/change-password', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) { res.status(400).json({ error: 'Current and new password required' }); return; }
  const result = changePassword(username, currentPassword, newPassword);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ success: true });
});

// Email verification endpoints
app.get('/api/account-email', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  res.json(getAccountEmail(username));
});

app.post('/api/request-email-verification', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  const result = await requestEmailVerification(username, email);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ success: true });
});

app.post('/api/verify-email', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  const { code } = req.body;
  if (!code) { res.status(400).json({ error: 'Code required' }); return; }
  const result = verifyEmailCode(username, code);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ success: true });
});

app.post('/api/unlink-email', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  const result = unlinkEmail(username);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ success: true });
});

// Password reset (no auth required)
app.post('/api/request-password-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Email required' }); return; }
  const result = await requestPasswordReset(email);
  res.json({ success: true }); // Always success to not leak info
});

app.post('/api/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) { res.status(400).json({ error: 'Email, code, and new password required' }); return; }
  const result = resetPassword(email, code, newPassword);
  if (!result.success) { res.status(400).json({ error: result.error }); return; }
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const username = validateToken(token);
  if (!username) { res.status(401).json({ error: 'Invalid token' }); return; }
  res.json(getStats(username));
});

app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
  const username = validateToken(token);
  if (!username) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
  const session = getAccountSession(username);
  res.json({ username, session });
});

wss.on('connection', (ws: WebSocket) => {
  const playerId = `player_${nextPlayerId++}`;
  let currentRoomId: string | null = null;

  const send = (msg: any) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const sendRoomUpdate = (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (!room) return;
    room.broadcast({
      type: 'room_update',
      payload: {
        players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected })),
        spectators: room.spectators.map(s => ({ id: s.id, name: s.name })),
        settings: room.settings,
        hostId: room.hostId,
        locked: room.locked,
        devMode: room.devMode,
        chatMessages: room.chatMessages,
      },
    });
  };

  ws.on('message', (data: Buffer) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      send({ type: 'error', payload: { message: 'Invalid JSON' } });
      return;
    }

    // In dev mode, game actions use the player the dev is currently controlling
    const getEffectivePlayerId = (): string => {
      if (!currentRoomId) return playerId;
      const r = roomManager.getRoom(currentRoomId);
      if (r?.devMode && r.devRealPlayerId === playerId && r.devPlayingAs) {
        return r.devPlayingAs;
      }
      return playerId;
    };

    switch (msg.type) {
      case 'authenticate': {
        // Associate this WS connection with an account
        const token = (msg as any).payload?.token;
        if (token) {
          const username = validateToken(token);
          if (username) {
            playerAccounts.set(playerId, username);
          }
        }
        break;
      }

      case 'create_room': {
        const room = roomManager.createRoom();
        room.addPlayer(playerId, msg.payload.playerName, ws);
        currentRoomId = room.id;
        playerRooms.set(playerId, room.id);
        // Track room in account
        const acctCreate = playerAccounts.get(playerId);
        if (acctCreate) setAccountRoom(acctCreate, room.id, msg.payload.playerName);
        send({ type: 'room_created', payload: { roomId: room.id } });
        send({ type: 'room_joined', payload: { roomId: room.id, playerId } });
        sendRoomUpdate(room.id);
        broadcastRoomList();
        break;
      }

      case 'join_room': {
        const room = roomManager.getRoom(msg.payload.roomId);
        if (!room) {
          send({ type: 'error', payload: { message: 'Room not found' } });
          return;
        }
        if (!room.addPlayer(playerId, msg.payload.playerName, ws)) {
          send({ type: 'error', payload: { message: 'Could not join room' } });
          return;
        }
        currentRoomId = room.id;
        playerRooms.set(playerId, room.id);
        // Track room in account
        const acctJoin = playerAccounts.get(playerId);
        if (acctJoin) setAccountRoom(acctJoin, room.id, msg.payload.playerName);
        send({ type: 'room_joined', payload: { roomId: room.id, playerId } });
        sendRoomUpdate(room.id);
        // If joined as spectator (game in progress), send game state
        if (room.spectators.find(s => s.id === playerId) && room.game) {
          const spectatorView = room.getSpectatorView(playerId, null);
          if (spectatorView) {
            send({ type: 'game_state', payload: { ...spectatorView, isSpectator: true, spectatorOf: null } });
          }
        }
        broadcastRoomList();
        break;
      }

      case 'rejoin_room': {
        const room = roomManager.getRoom(msg.payload.roomId);
        if (!room) {
          // Try to find room by player name
          const found = roomManager.findRoomByPlayerName(msg.payload.playerName);
          if (!found) {
            send({ type: 'error', payload: { message: 'Room not found or cannot rejoin' } });
            return;
          }
          const success = found.room.rejoinPlayer(playerId, msg.payload.playerName, ws);
          if (!success) {
            send({ type: 'error', payload: { message: 'Cannot rejoin room' } });
            return;
          }
          currentRoomId = found.room.id;
          playerRooms.set(playerId, found.room.id);
          send({ type: 'room_joined', payload: { roomId: found.room.id, playerId } });
          sendRoomUpdate(found.room.id);
          found.room.broadcastState();
          break;
        }

        const success = room.rejoinPlayer(playerId, msg.payload.playerName, ws);
        if (!success) {
          send({ type: 'error', payload: { message: 'Cannot rejoin room' } });
          return;
        }
        currentRoomId = room.id;
        playerRooms.set(playerId, room.id);
        send({ type: 'room_joined', payload: { roomId: room.id, playerId } });
        sendRoomUpdate(room.id);
        room.broadcastState();
        broadcastRoomList();
        break;
      }

      case 'update_settings': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || playerId !== room.hostId) return;
        room.updateSettings(msg.payload.settings);
        sendRoomUpdate(currentRoomId);
        break;
      }

      case 'lock_room' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || playerId !== room.hostId) return;
        room.setLocked((msg as any).payload?.locked ?? true);
        sendRoomUpdate(currentRoomId);
        broadcastRoomList();
        break;
      }

      case 'toggle_dev_mode' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || playerId !== room.hostId) return;
        // Check playerAccounts first, fall back to token-based auth
        let username = playerAccounts.get(playerId);
        if (!username) {
          const token = (msg as any).payload?.token;
          if (token) {
            username = validateToken(token) || undefined;
            if (username) playerAccounts.set(playerId, username);
          }
        }
        if (username !== 'cyxh') {
          send({ type: 'error', payload: { message: 'Dev mode is not available for this account' } });
          return;
        }
        room.devMode = !room.devMode;
        sendRoomUpdate(currentRoomId);
        break;
      }

      case 'request_state' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        sendRoomUpdate(currentRoomId);
        if (room.game) {
          room.broadcastState();
        }
        break;
      }

      case 'spectate_as' as any: {
        // Spectator requests to view from a specific player's perspective
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || !room.game) return;
        const targetPlayerId = (msg as any).payload?.playerId;
        const view = room.getSpectatorView(playerId, targetPlayerId);
        if (view) {
          send({ type: 'game_state', payload: { ...view, isSpectator: true, spectatorOf: targetPlayerId } });
        }
        break;
      }

      case 'swap_position': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const success = room.swapPositions(playerId, msg.payload.targetPlayerId);
        if (success) {
          sendRoomUpdate(currentRoomId);
        } else {
          send({ type: 'error', payload: { message: 'Cannot swap positions' } });
        }
        break;
      }

      case 'dev_switch_player' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || !room.devMode || room.devRealPlayerId !== playerId) return;
        const targetId = (msg as any).payload?.targetPlayerId;
        if (targetId && room.players.find(p => p.id === targetId)) {
          room.devPlayingAs = targetId;
          room.broadcastState();
        }
        break;
      }

      case 'start_game': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || playerId !== room.hostId) {
          send({ type: 'error', payload: { message: 'Only host can start' } });
          return;
        }
        const result = room.startGame();
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Cannot start' } });
        }
        break;
      }

      case 'bid': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleBid(getEffectivePlayerId(), msg.payload.cards);
        if (result.success) {
          const acct = playerAccounts.get(playerId);
          if (acct) incrementStats(acct, { bidsMade: 1 });
        } else {
          send({ type: 'error', payload: { message: result.reason || 'Invalid bid' } });
        }
        break;
      }

      case 'skip_bid': {
        // No action needed for skipping bid currently
        break;
      }

      case 'vote_random_kitty': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleVoteRandomKitty(getEffectivePlayerId());
        if (!result.success) {
          send({ type: 'error', payload: { message: 'Cannot vote now' } });
        }
        break;
      }

      case 'pickup_kitty': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handlePickupKitty(getEffectivePlayerId());
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Cannot pick up kitty' } });
        }
        break;
      }

      case 'exchange_kitty': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleExchangeKitty(getEffectivePlayerId(), msg.payload.kitty);
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Invalid exchange' } });
        }
        break;
      }

      case 'declare_friends': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleDeclareFriends(getEffectivePlayerId(), msg.payload.declarations);
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Invalid declaration' } });
        }
        break;
      }

      case 'confirm_ready': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleConfirmReady(getEffectivePlayerId());
        if (!result.success) {
          send({ type: 'error', payload: { message: 'Cannot confirm ready now' } });
        }
        break;
      }

      case 'play_cards': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room || !room.game) return;
        const prevPhase = room.game.state.phase;
        const prevTrickCount = room.game.state.tricks.length;
        const result = room.handlePlayCards(getEffectivePlayerId(), msg.payload.cards);
        if (result.success) {
          const acct = playerAccounts.get(playerId);
          if (acct) {
            // Track play types using decomposeTrickComponents from shared
            const playedCards = msg.payload.cards as Card[];
            const trumpInfo = room.game.state.trumpInfo;
            const settings = room.game.state.settings;
            try {
              const components = decomposePlay(playedCards, trumpInfo, settings);
              let singles = 0, pairs = 0, tractors = 0, longestTractor = 0;
              for (const comp of components) {
                if (comp.length > 1) {
                  tractors++;
                  if (comp.length > longestTractor) longestTractor = comp.length;
                } else if (comp.groupSize >= 2) {
                  pairs++;
                } else {
                  singles++;
                }
              }
              const statsInc: any = { tricksPlayed: 1 };
              if (singles > 0) statsInc.singlesPlayed = singles;
              if (pairs > 0) statsInc.pairsPlayed = pairs;
              if (tractors > 0) statsInc.tractorsPlayed = tractors;
              incrementStats(acct, statsInc);
              if (longestTractor > 0) {
                const currentStats = getStats(acct);
                if (longestTractor > currentStats.longestTractor) {
                  updateStats(acct, { longestTractor });
                }
              }
            } catch {
              incrementStats(acct, { tricksPlayed: 1 });
            }
          }
          // Check if a trick was completed (new trick added to list)
          if (room.game.state.tricks.length > prevTrickCount) {
            const lastTrick = room.game.state.tricks[room.game.state.tricks.length - 1];
            if (lastTrick.winner !== undefined) {
              const winnerPlayer = room.game.state.players[lastTrick.winner];
              const winnerAcct = playerAccounts.get(winnerPlayer.id);
              if (winnerAcct) {
                const pts = lastTrick.points || 0;
                incrementStats(winnerAcct, { tricksWon: 1, totalPointsScored: pts });
                if (pts > 0) {
                  const currentStats = getStats(winnerAcct);
                  if (pts > currentStats.highestTrickPoints) {
                    updateStats(winnerAcct, { highestTrickPoints: pts });
                  }
                }
              }
            }
          }
          // Check if round/game ended
          const newPhase = room.game.state.phase;
          if ((newPhase === GamePhase.Scoring || newPhase === GamePhase.GameOver) && prevPhase === GamePhase.Playing) {
            // Round just ended — track round stats for all players
            for (const p of room.game.state.players) {
              const pAcct = playerAccounts.get(p.id);
              if (!pAcct) continue;
              const isDefending = room.game.state.defendingTeam.has(p.id);
              const isLeader = room.game.state.players[room.game.state.currentLeaderIdx]?.id === p.id;
              incrementStats(pAcct, {
                roundsPlayed: 1,
                ...(isDefending ? { timesDefending: 1 } : { timesAttacking: 1 }),
                ...(isLeader ? { timesAsLeader: 1 } : {}),
              });
            }
            if (newPhase === GamePhase.GameOver) {
              for (const p of room.game.state.players) {
                const pAcct = playerAccounts.get(p.id);
                if (pAcct) {
                  incrementStats(pAcct, { gamesPlayed: 1 });
                  if (hasWonGame(p.rank, room.game.state.settings.maxRank)) {
                    incrementStats(pAcct, { gamesWon: 1 });
                  }
                }
              }
            }
          }
        } else {
          // Check for throw penalty
          if (result.reason && result.reason.includes('penalty')) {
            const acct = playerAccounts.get(playerId);
            if (acct) incrementStats(acct, { throwPenalties: 1 });
          }
          send({ type: 'error', payload: { message: result.reason || 'Invalid play' } });
        }
        break;
      }

      case 'takeback': {
        // TODO: implement takeback
        break;
      }

      case 'next_round': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        room.handleNextRound();
        break;
      }

      case 'chat': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const chatMsg = room.addChatMessage(playerId, msg.payload.message);
        if (chatMsg) {
          room.broadcast({ type: 'chat', payload: chatMsg });
          const acct = playerAccounts.get(playerId);
          if (acct) incrementStats(acct, { chatMessagesSent: 1 });
        }
        break;
      }

      case 'leave_room' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (room) {
          room.removePlayer(playerId);
          if (room.players.length === 0 || room.allDisconnected()) {
            roomManager.removeRoom(currentRoomId);
            const acct = playerAccounts.get(playerId);
            if (acct) setAccountRoom(acct, null, null);
          } else {
            sendRoomUpdate(currentRoomId);
            if (room.game) {
              room.broadcastState();
            }
          }
        }
        playerRooms.delete(playerId);
        currentRoomId = null;
        broadcastRoomList();
        break;
      }
    }
  });

  ws.on('close', () => {
    if (currentRoomId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        room.removePlayer(playerId);
        if (room.players.length === 0 || room.allDisconnected()) {
          roomManager.removeRoom(currentRoomId);
          const acct = playerAccounts.get(playerId);
          if (acct) setAccountRoom(acct, null, null);
        } else {
          sendRoomUpdate(currentRoomId);
          if (room.game) {
            room.broadcastState();
          }
        }
      }
      playerRooms.delete(playerId);
      broadcastRoomList();
    }
    playerAccounts.delete(playerId);
  });
});

function broadcastRoomList() {
  const rooms = roomManager.getAllRooms().map(r => r.getRoomInfo());
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'room_list', payload: rooms }));
    }
  });
}

import { GamePhase } from 'tractor-shared';

// Periodic cleanup: remove rooms where all players are disconnected
setInterval(() => {
  let changed = false;
  for (const room of roomManager.getAllRooms()) {
    if (room.players.length === 0 || room.allDisconnected()) {
      roomManager.removeRoom(room.id);
      changed = true;
    }
  }
  if (changed) broadcastRoomList();
}, 30000);

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Tractor server running on port ${PORT}`);
});
