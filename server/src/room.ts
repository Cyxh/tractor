import {
  GameSettings, Player, Rank, defaultSettings, PlayerView, Card,
  FriendDeclaration, GamePhase, ChatMessage,
} from 'tractor-shared';
import { Game } from './game.js';

export interface RoomPlayer {
  id: string;
  name: string;
  ws: any; // WebSocket
  connected: boolean;
}

export class Room {
  id: string;
  settings: GameSettings;
  players: RoomPlayer[] = [];
  spectators: RoomPlayer[] = [];
  game: Game | null = null;
  hostId: string | null = null;
  locked: boolean = false;
  drawInterval: ReturnType<typeof setInterval> | null = null;
  chatMessages: ChatMessage[] = [];

  constructor(id: string) {
    this.id = id;
    this.settings = defaultSettings(4);
  }

  addPlayer(id: string, name: string, ws: any): boolean {
    if (this.players.find(p => p.id === id)) return false;

    // If game is in progress, add as spectator instead
    if (this.game && this.game.state.phase !== GamePhase.Lobby) {
      return this.addSpectator(id, name, ws);
    }

    // Check if room is locked
    if (this.locked) return false;

    // Max 6 players in lobby
    if (this.players.length >= 6) return false;

    this.players.push({ id, name, ws, connected: true });
    if (!this.hostId) this.hostId = id;

    return true;
  }

  addSpectator(id: string, name: string, ws: any): boolean {
    if (this.spectators.find(s => s.id === id)) return false;
    this.spectators.push({ id, name, ws, connected: true });
    return true;
  }

  removeSpectator(id: string): void {
    this.spectators = this.spectators.filter(s => s.id !== id);
  }

  removePlayer(id: string): void {
    // Check spectators first
    const specIdx = this.spectators.findIndex(s => s.id === id);
    if (specIdx >= 0) {
      const spec = this.spectators[specIdx];
      spec.connected = false;
      spec.ws = null;
      this.spectators.splice(specIdx, 1);
      return;
    }

    // If game is in progress, mark as disconnected instead of removing
    if (this.game && this.game.state.phase !== GamePhase.Lobby) {
      const player = this.players.find(p => p.id === id);
      if (player) {
        player.connected = false;
        player.ws = null;
      }
      return;
    }

    this.players = this.players.filter(p => p.id !== id);
    if (this.hostId === id && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }
  }

  rejoinPlayer(id: string, name: string, ws: any): boolean {
    const player = this.players.find(p => p.id === id || p.name === name);
    if (!player) return false;

    player.ws = ws;
    player.connected = true;
    // Update id if rejoining by name
    if (player.id !== id) {
      // Update game state references
      if (this.game) {
        const gamePlayer = this.game.state.players.find(p => p.id === player.id);
        if (gamePlayer) gamePlayer.id = id;
        const hand = this.game.state.hands[player.id];
        if (hand) {
          this.game.state.hands[id] = hand;
          delete this.game.state.hands[player.id];
        }
        if (this.game.state.defendingTeam.has(player.id)) {
          this.game.state.defendingTeam.delete(player.id);
          this.game.state.defendingTeam.add(id);
        }
      }
      player.id = id;
    }
    return true;
  }

  swapPositions(requesterId: string, targetId: string): boolean {
    if (this.game) return false; // Can't swap during game
    const idx1 = this.players.findIndex(p => p.id === requesterId);
    const idx2 = this.players.findIndex(p => p.id === targetId);
    if (idx1 < 0 || idx2 < 0) return false;

    [this.players[idx1], this.players[idx2]] = [this.players[idx2], this.players[idx1]];
    return true;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  promoteSpectators(): void {
    // Move spectators to players for the next game
    for (const spec of this.spectators) {
      if (this.players.length >= 6) break;
      this.players.push({ ...spec });
    }
    this.spectators = this.spectators.filter(s => !this.players.find(p => p.id === s.id));
  }

  updateSettings(settings: Partial<GameSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }

  addChatMessage(playerId: string, message: string): ChatMessage | null {
    const player = this.players.find(p => p.id === playerId) || this.spectators.find(s => s.id === playerId);
    if (!player) return null;
    const chatMsg: ChatMessage = {
      playerName: player.name,
      message,
      timestamp: Date.now(),
    };
    this.chatMessages.push(chatMsg);
    // Also add to game if active
    if (this.game) {
      this.game.chatMessages.push(chatMsg);
    }
    return chatMsg;
  }

  startGame(): { success: boolean; reason?: string } {
    if (this.players.length < 2) {
      return { success: false, reason: 'Need at least 2 players' };
    }

    this.settings.numPlayers = this.players.length;

    // Auto-calculate decks if needed
    if (this.settings.numDecks < 1) {
      this.settings.numDecks = Math.ceil(this.players.length / 2);
    }

    const gamePlayers: Player[] = this.players.map(p => ({
      id: p.id,
      name: p.name,
      ready: true,
      rank: Rank.Two,
      team: undefined,
    }));

    this.game = new Game(this.settings, gamePlayers);
    // Copy existing chat messages
    this.game.chatMessages = [...this.chatMessages];
    this.game.startRound();

    // Broadcast initial game state so clients transition to the game table
    this.broadcastState();

    // Start auto-drawing
    this.startDrawing();

    return { success: true };
  }

  private startDrawing(): void {
    if (this.drawInterval) clearInterval(this.drawInterval);

    this.drawInterval = setInterval(() => {
      if (!this.game || this.game.state.phase !== GamePhase.Drawing) {
        if (this.drawInterval) {
          clearInterval(this.drawInterval);
          this.drawInterval = null;
        }
        this.broadcastState();
        return;
      }

      const result = this.game.drawCard();
      if (result) {
        // Broadcast full state after each draw so clients see hands growing
        this.broadcastState();
      }

      // If drawing complete, broadcast full state
      if (this.game.state.phase !== GamePhase.Drawing) {
        if (this.drawInterval) {
          clearInterval(this.drawInterval);
          this.drawInterval = null;
        }
        this.broadcastState();
      }
    }, 250); // Draw a card every 250ms (slightly slower for better animation)
  }

  handleBid(playerId: string, cards: Card[]): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.placeBid(playerId, cards);
    if (result.success) {
      this.broadcastState();
      this.broadcastSound('bid');
    }
    return result;
  }

  handleVoteRandomKitty(playerId: string): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.voteRandomKitty(playerId);
    if (result.success) {
      this.broadcastState();
      if (result.allVoted) {
        this.broadcastSound('kitty-select');
      }
    }
    return result;
  }

  handlePickupKitty(playerId: string): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.pickupKitty(playerId);
    if (result.success) {
      this.broadcastState();
    }
    return result;
  }

  handleConfirmReady(playerId: string): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.confirmReady(playerId);
    if (result.success) {
      this.broadcastState();
      if (result.allReady) {
        this.broadcastSound('game-start');
      }
    }
    return result;
  }

  handleExchangeKitty(playerId: string, kitty: Card[]): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.exchangeKitty(playerId, kitty);
    if (result.success) {
      this.broadcastState();
    }
    return result;
  }

  handleDeclareFriends(playerId: string, declarations: FriendDeclaration[]): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.declareFriends(playerId, declarations);
    if (result.success) {
      this.broadcastState();
    }
    return result;
  }

  handlePlayCards(playerId: string, cards: Card[]): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    const result = this.game.playCards(playerId, cards);
    if (result.success) {
      this.broadcastState();
      this.broadcastSound('play-card');
    }
    return result;
  }

  handleNextRound(): { success: boolean; reason?: string } {
    if (!this.game) return { success: false, reason: 'No game in progress' };
    if (this.game.state.phase !== GamePhase.Scoring) {
      return { success: false, reason: 'Not in scoring phase' };
    }
    this.game.startRound();
    this.broadcastState();
    this.startDrawing();
    return { success: true };
  }

  getSpectatorView(spectatorId: string, viewAsPlayerId: string | null): PlayerView | null {
    if (!this.game) return null;
    const targetId = viewAsPlayerId || this.players[0]?.id;
    if (!targetId) return null;
    const view = this.game.getPlayerView(targetId);
    if (!view) return null;
    return {
      ...view,
      hand: [], // spectators can't see hands by default
    };
  }

  getPlayerView(playerId: string): PlayerView | null {
    if (!this.game) return null;
    return this.game.getPlayerView(playerId);
  }

  broadcastState(): void {
    const connectedPlayers = this.players.filter(p => p.connected).map(p => p.id);
    for (const p of this.players) {
      if (!p.connected) continue;
      const view = this.getPlayerView(p.id);
      if (view) {
        this.sendToPlayer(p.id, { type: 'game_state', payload: { ...view, connectedPlayers } });
      }
    }
    // Send spectator view (default to player 0's perspective)
    for (const s of this.spectators) {
      if (!s.connected) continue;
      // Spectators get a view with no hand (spectatorView handled client-side)
      const spectatorViewPlayerId = this.players[0]?.id;
      if (spectatorViewPlayerId && this.game) {
        const view = this.game.getPlayerView(spectatorViewPlayerId);
        if (view) {
          const spectatorView = {
            ...view,
            hand: [], // Don't show hand by default
            connectedPlayers,
            isSpectator: true,
            spectatorOf: null as string | null,
          };
          this.sendTo(s, { type: 'game_state', payload: spectatorView });
        }
      }
    }
  }

  broadcastSound(sound: string): void {
    this.broadcast({ type: 'sound', payload: { sound } });
  }

  sendToPlayer(playerId: string, message: any): void {
    const player = this.players.find(p => p.id === playerId) || this.spectators.find(s => s.id === playerId);
    if (player?.ws?.readyState === 1) { // WebSocket.OPEN
      player.ws.send(JSON.stringify(message));
    }
  }

  sendTo(player: RoomPlayer, message: any): void {
    if (player?.ws?.readyState === 1) {
      player.ws.send(JSON.stringify(message));
    }
  }

  broadcast(message: any): void {
    for (const p of this.players) {
      if (p.connected) {
        this.sendToPlayer(p.id, message);
      }
    }
    for (const s of this.spectators) {
      if (s.connected) {
        this.sendTo(s, message);
      }
    }
  }

  hasDisconnectedPlayers(): boolean {
    return this.players.some(p => !p.connected);
  }

  allDisconnected(): boolean {
    return this.players.every(p => !p.connected) && this.spectators.every(s => !s.connected);
  }

  getRoomInfo() {
    return {
      id: this.id,
      playerCount: this.players.filter(p => p.connected).length,
      maxPlayers: 6,
      gameMode: this.settings.gameMode,
      inProgress: this.game !== null && this.game.state.phase !== GamePhase.Lobby,
      hostName: this.players.find(p => p.id === this.hostId)?.name || 'Unknown',
      locked: this.locked,
      spectatorCount: this.spectators.filter(s => s.connected).length,
    };
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    const id = this.generateId();
    const room = new Room(id);
    this.rooms.set(id, room);
    return room;
  }

  getRoom(id: string): Room | undefined {
    return this.rooms.get(id);
  }

  removeRoom(id: string): void {
    const room = this.rooms.get(id);
    if (room?.drawInterval) clearInterval(room.drawInterval);
    this.rooms.delete(id);
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  findRoomByPlayerName(playerName: string): { room: Room; playerId: string } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find(p => p.name === playerName && !p.connected);
      if (player) return { room, playerId: player.id };
    }
    return null;
  }

  private generateId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
      id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
  }
}
