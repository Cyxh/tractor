import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { RoomManager } from './room.js';
import { ClientMessage } from 'tractor-shared';
import { register, login, validateToken, setAccountRoom, getAccountSession, changeUsername, changePassword } from './accounts.js';

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
        const result = room.handleBid(playerId, msg.payload.cards);
        if (!result.success) {
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
        const result = room.handleVoteRandomKitty(playerId);
        if (!result.success) {
          send({ type: 'error', payload: { message: 'Cannot vote now' } });
        }
        break;
      }

      case 'pickup_kitty': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handlePickupKitty(playerId);
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Cannot pick up kitty' } });
        }
        break;
      }

      case 'exchange_kitty': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleExchangeKitty(playerId, msg.payload.kitty);
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Invalid exchange' } });
        }
        break;
      }

      case 'declare_friends': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleDeclareFriends(playerId, msg.payload.declarations);
        if (!result.success) {
          send({ type: 'error', payload: { message: result.reason || 'Invalid declaration' } });
        }
        break;
      }

      case 'confirm_ready': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handleConfirmReady(playerId);
        if (!result.success) {
          send({ type: 'error', payload: { message: 'Cannot confirm ready now' } });
        }
        break;
      }

      case 'play_cards': {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;
        const result = room.handlePlayCards(playerId, msg.payload.cards);
        if (!result.success) {
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
        }
        break;
      }

      case 'leave_room' as any: {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (room) {
          room.removePlayer(playerId);
          if ((room.players.length === 0 || room.allDisconnected()) && (!room.game || room.game.state.phase === GamePhase.Lobby)) {
            roomManager.removeRoom(currentRoomId);
            const acct = playerAccounts.get(playerId);
            if (acct) setAccountRoom(acct, null, null);
          } else {
            sendRoomUpdate(currentRoomId);
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
        if ((room.players.length === 0 || room.allDisconnected()) && (!room.game || room.game.state.phase === GamePhase.Lobby)) {
          roomManager.removeRoom(currentRoomId);
          // Clear account room since room is gone
          const acct = playerAccounts.get(playerId);
          if (acct) setAccountRoom(acct, null, null);
        } else {
          sendRoomUpdate(currentRoomId);
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

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 8081;
server.listen(PORT, () => {
  console.log(`Tractor server running on port ${PORT}`);
});
