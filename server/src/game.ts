import {
  GameState, GamePhase, GameSettings, Player, Card, Bid, Trick,
  TrumpInfo, Rank, Suit, FriendDeclaration, PlayerView, ChatMessage,
  defaultSettings, JokerType, SuitedCard,
} from 'tractor-shared';
import {
  createDeck, shuffleDeck, countPoints,
} from 'tractor-shared';
import {
  getEffectiveSuit, sortHand, cardOrder, isTrump, sameCardFace,
} from 'tractor-shared';
import {
  isValidPlay, determineTrickWinner,
} from 'tractor-shared';
import {
  calculateRoundResult, advanceRank, hasWonGame,
} from 'tractor-shared';

export class Game {
  state: GameState;
  chatMessages: ChatMessage[] = [];

  constructor(settings: GameSettings, players: Player[]) {
    this.state = {
      phase: GamePhase.Lobby,
      settings,
      players,
      roundNumber: 0,
      trumpInfo: { trumpRank: Rank.Two, trumpSuit: null },
      currentLeaderIdx: 0,
      currentTurnIdx: 0,
      drawPile: [],
      hands: {},
      kitty: [],
      bids: [],
      tricks: [],
      currentTrick: null,
      attackingPoints: 0,
      defendingPoints: 0,
      friendDeclarations: [],
      defendingTeam: new Set<string>(),
      lastTrickWinner: undefined,
      noBidVotes: new Set<string>(),
      noBidSelectionCard: null,
      kittyPickedUp: false,
      readyPlayers: new Set<string>(),
    };
  }

  startRound(): void {
    const { settings, players, currentLeaderIdx } = this.state;
    const deck = shuffleDeck(createDeck(settings));

    let kittySize = settings.kittySize;
    if (kittySize <= 0 || kittySize >= deck.length) {
      const remainder = deck.length % settings.numPlayers;
      kittySize = remainder === 0 ? settings.numPlayers : remainder;
    }

    const kitty = deck.slice(deck.length - kittySize);
    const drawPile = deck.slice(0, deck.length - kittySize);

    const hands: Record<string, Card[]> = {};
    for (const p of players) {
      hands[p.id] = [];
    }

    const leader = players[currentLeaderIdx];
    const trumpRank = leader.rank;
    const firstDealIdx = Math.floor(Math.random() * players.length);

    const defendingTeam = new Set<string>();
    const isFirstRound = this.state.roundNumber === 0;
    if (!isFirstRound) {
      if (settings.gameMode === 'tractor') {
        defendingTeam.add(leader.id);
        if (players.length === 4) {
          defendingTeam.add(players[(currentLeaderIdx + 2) % 4].id);
        }
      } else {
        defendingTeam.add(leader.id);
      }
    }

    this.state = {
      ...this.state,
      phase: GamePhase.Drawing,
      roundNumber: this.state.roundNumber + 1,
      trumpInfo: { trumpRank, trumpSuit: null },
      drawPile,
      hands,
      kitty,
      bids: [],
      tricks: [],
      currentTrick: null,
      attackingPoints: 0,
      defendingPoints: 0,
      friendDeclarations: [],
      defendingTeam,
      currentTurnIdx: firstDealIdx,
      lastTrickWinner: undefined,
      noBidVotes: new Set<string>(),
      noBidSelectionCard: null,
      kittyPickedUp: false,
      readyPlayers: new Set<string>(),
    };

    for (const p of players) {
      p.team = defendingTeam.has(p.id) ? 'defending' : 'attacking';
    }
  }

  drawCard(): { playerIdx: number; card: Card } | null {
    if (this.state.phase !== GamePhase.Drawing) return null;
    if (this.state.drawPile.length === 0) return null;

    const card = this.state.drawPile.shift()!;
    const playerIdx = this.state.currentTurnIdx;
    const player = this.state.players[playerIdx];

    this.state.hands[player.id].push(card);
    this.state.currentTurnIdx = (playerIdx + 1) % this.state.players.length;

    if (this.state.drawPile.length === 0) {
      this.finishDrawing();
    }

    return { playerIdx, card };
  }

  private finishDrawing(): void {
    if (this.state.bids.length > 0) {
      // Someone bid - go to kitty pickup confirmation
      this.state.phase = GamePhase.KittyPickup;
    } else {
      // No bids - need random kitty selection
      this.state.phase = GamePhase.NoBidKittySelection;
    }
  }

  placeBid(playerId: string, cards: Card[]): { success: boolean; reason?: string } {
    if (this.state.phase !== GamePhase.Drawing && this.state.phase !== GamePhase.KittyPickup && this.state.phase !== GamePhase.NoBidKittySelection) {
      return { success: false, reason: 'Cannot bid now' };
    }

    // During kitty pickup, only non-leader can bid (leader already has kitty offer)
    if (this.state.phase === GamePhase.KittyPickup) {
      const leader = this.state.players[this.state.currentLeaderIdx];
      if (playerId === leader.id && this.state.kittyPickedUp) {
        return { success: false, reason: 'Leader cannot bid after picking up the kitty' };
      }
    }

    if (cards.length === 0) return { success: false, reason: 'Must bid at least one card' };

    for (let i = 1; i < cards.length; i++) {
      if (!sameCardFace(cards[0], cards[i])) {
        return { success: false, reason: 'All bid cards must be identical' };
      }
    }

    const card = cards[0];
    const isJoker = card.kind === 'joker';
    const isTrumpRank = card.kind === 'suited' && card.rank === this.state.trumpInfo.trumpRank;

    if (!isJoker && !isTrumpRank) {
      return { success: false, reason: 'Can only bid with trump-rank cards or jokers' };
    }

    if (isJoker && cards.length === 1) {
      return { success: false, reason: 'Single jokers cannot bid' };
    }

    const hand = this.state.hands[playerId];
    if (!hand) return { success: false, reason: 'Player not found' };

    for (const c of cards) {
      const idx = hand.findIndex(h =>
        h.kind === c.kind &&
        (h.kind === 'joker' && c.kind === 'joker' ? h.jokerType === c.jokerType && h.deckIndex === c.deckIndex :
         h.kind === 'suited' && c.kind === 'suited' ? h.suit === c.suit && h.rank === c.rank && h.deckIndex === c.deckIndex : false)
      );
      if (idx < 0) return { success: false, reason: 'Card not in hand' };
    }

    if (this.state.bids.length > 0) {
      const lastBid = this.state.bids[this.state.bids.length - 1];
      if (!this.bidBeats(cards, lastBid.cards, playerId, lastBid.playerId)) {
        return { success: false, reason: 'Bid must be stronger than current bid' };
      }
    }

    // If kitty was picked up by old leader, take it back
    if (this.state.kittyPickedUp) {
      const oldLeader = this.state.players[this.state.currentLeaderIdx];
      const oldHand = this.state.hands[oldLeader.id];
      for (const kittyCard of this.state.kitty) {
        const idx = oldHand.findIndex(h =>
          h.kind === kittyCard.kind &&
          (h.kind === 'joker' && kittyCard.kind === 'joker' ? h.jokerType === kittyCard.jokerType && h.deckIndex === kittyCard.deckIndex :
           h.kind === 'suited' && kittyCard.kind === 'suited' ? h.suit === kittyCard.suit && h.rank === kittyCard.rank && h.deckIndex === kittyCard.deckIndex : false)
        );
        if (idx >= 0) oldHand.splice(idx, 1);
      }
      this.state.kittyPickedUp = false;
    }

    this.state.bids.push({ playerId, cards });

    if (isJoker) {
      this.state.trumpInfo.trumpSuit = null;
    } else if (card.kind === 'suited') {
      this.state.trumpInfo.trumpSuit = card.suit;
    }

    // First round: only the FIRST bid determines who gets the kitty.
    // Subsequent bids still change the trump suit but not the leader.
    // Other rounds: follow the landlord selection policy setting.
    const isFirstRound = this.state.roundNumber === 1;
    const isFirstBid = this.state.bids.length === 1; // we just pushed this bid above

    if ((isFirstRound && isFirstBid) ||
        (!isFirstRound && this.state.settings.landlordSelectionPolicy === 'byWinningBid')) {
      const bidderIdx = this.state.players.findIndex(p => p.id === playerId);
      if (bidderIdx >= 0) {
        this.state.currentLeaderIdx = bidderIdx;
        this.updateTeams();
      }
    }

    // If we were in NoBidKittySelection, switch to KittyPickup since someone just bid
    if (this.state.phase === GamePhase.NoBidKittySelection) {
      this.state.phase = GamePhase.KittyPickup;
      this.state.noBidVotes.clear();
    }

    return { success: true };
  }

  private bidBeats(newCards: Card[], oldCards: Card[], newPlayerId: string, oldPlayerId: string): boolean {
    if (newCards.length > oldCards.length) return true;
    if (newCards.length < oldCards.length) return false;

    if (newPlayerId === oldPlayerId) return true;

    const { bidPolicy } = this.state.settings;
    const newCard = newCards[0];
    const oldCard = oldCards[0];

    if (bidPolicy === 'greaterLength') return newCards.length > oldCards.length;

    if (newCard.kind === 'joker' && oldCard.kind !== 'joker') return true;
    if (newCard.kind === 'joker' && oldCard.kind === 'joker') {
      if (newCard.jokerType === JokerType.Big && oldCard.jokerType === JokerType.Little) return true;
    }

    if (bidPolicy === 'jokerOrGreaterLength') return newCards.length > oldCards.length;

    return newCard.kind === 'suited' && oldCard.kind === 'suited' && newCard.suit !== oldCard.suit;
  }

  updateTeams(): void {
    const leader = this.state.players[this.state.currentLeaderIdx];
    this.state.defendingTeam.clear();
    this.state.defendingTeam.add(leader.id);

    if (this.state.settings.gameMode === 'tractor' && this.state.players.length === 4) {
      const partnerIdx = (this.state.currentLeaderIdx + 2) % 4;
      this.state.defendingTeam.add(this.state.players[partnerIdx].id);
    }

    for (const p of this.state.players) {
      p.team = this.state.defendingTeam.has(p.id) ? 'defending' : 'attacking';
    }
  }

  voteRandomKitty(playerId: string): { success: boolean; allVoted: boolean; selectedCard?: Card; leaderIdx?: number } {
    if (this.state.phase !== GamePhase.NoBidKittySelection) {
      return { success: false, allVoted: false };
    }

    if (this.state.noBidVotes.has(playerId)) {
      this.state.noBidVotes.delete(playerId);
      return { success: true, allVoted: false };
    }

    this.state.noBidVotes.add(playerId);

    if (this.state.noBidVotes.size >= this.state.players.length) {
      // All voted - draw random card from standard 52-card deck
      const suits: Suit[] = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];
      const ranks: Rank[] = [
        Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
        Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
      ];
      const randomSuit = suits[Math.floor(Math.random() * suits.length)];
      const randomRank = ranks[Math.floor(Math.random() * ranks.length)];
      const selectedCard: Card = { kind: 'suited', suit: randomSuit, rank: randomRank, deckIndex: 0 };
      this.state.noBidSelectionCard = selectedCard;

      // Rank value 2-14, player index = (rankValue - 2) % numPlayers
      // "if the card is a two, player 2 is the kitty" -> player index 1 (0-indexed)
      // So offset by 1: playerIdx = (rankValue - 2 + 1) % numPlayers = (rankValue - 1) % numPlayers
      const playerIdx = (randomRank - 1) % this.state.players.length;
      this.state.currentLeaderIdx = playerIdx;
      this.updateTeams();

      // Move to kitty pickup
      this.state.phase = GamePhase.KittyPickup;

      return { success: true, allVoted: true, selectedCard, leaderIdx: playerIdx };
    }

    return { success: true, allVoted: false };
  }

  pickupKitty(playerId: string): { success: boolean; reason?: string } {
    if (this.state.phase !== GamePhase.KittyPickup) {
      return { success: false, reason: 'Not in kitty pickup phase' };
    }

    const leader = this.state.players[this.state.currentLeaderIdx];
    if (playerId !== leader.id) {
      return { success: false, reason: 'Only the leader can pick up the kitty' };
    }

    if (this.state.kittyPickedUp) {
      return { success: false, reason: 'Kitty already picked up' };
    }

    this.state.hands[leader.id].push(...this.state.kitty);
    this.state.kittyPickedUp = true;
    this.state.phase = GamePhase.KittyExchange;

    return { success: true };
  }

  exchangeKitty(playerId: string, newKitty: Card[]): { success: boolean; reason?: string } {
    if (this.state.phase !== GamePhase.KittyExchange) {
      return { success: false, reason: 'Not in kitty exchange phase' };
    }

    const leader = this.state.players[this.state.currentLeaderIdx];
    if (playerId !== leader.id) {
      return { success: false, reason: 'Only the leader can exchange kitty' };
    }

    if (newKitty.length !== this.state.kitty.length) {
      return { success: false, reason: `Kitty must have exactly ${this.state.kitty.length} cards` };
    }

    const hand = [...this.state.hands[playerId]];
    for (const card of newKitty) {
      const idx = hand.findIndex(h =>
        h.kind === card.kind &&
        (h.kind === 'joker' && card.kind === 'joker' ? h.jokerType === card.jokerType && h.deckIndex === card.deckIndex :
         h.kind === 'suited' && card.kind === 'suited' ? h.suit === card.suit && h.rank === card.rank && h.deckIndex === card.deckIndex : false)
      );
      if (idx < 0) return { success: false, reason: 'Card not in hand' };
      hand.splice(idx, 1);
    }

    this.state.hands[playerId] = hand;
    this.state.kitty = newKitty;

    if (this.state.settings.gameMode === 'findingFriends') {
      this.state.phase = GamePhase.FriendDeclaration;
    } else {
      this.state.phase = GamePhase.ReadyToPlay;
    }

    return { success: true };
  }

  declareFriends(playerId: string, declarations: FriendDeclaration[]): { success: boolean; reason?: string } {
    if (this.state.phase !== GamePhase.FriendDeclaration) {
      return { success: false, reason: 'Not in friend declaration phase' };
    }

    const leader = this.state.players[this.state.currentLeaderIdx];
    if (playerId !== leader.id) {
      return { success: false, reason: 'Only the leader can declare friends' };
    }

    const expectedFriends = this.state.settings.numFriends ?? Math.floor(this.state.players.length / 2) - 1;
    if (declarations.length !== expectedFriends) {
      return { success: false, reason: `Must declare exactly ${expectedFriends} friend(s)` };
    }

    this.state.friendDeclarations = declarations.map(d => ({ ...d, found: false }));
    this.state.phase = GamePhase.ReadyToPlay;
    return { success: true };
  }

  confirmReady(playerId: string): { success: boolean; allReady: boolean } {
    if (this.state.phase !== GamePhase.ReadyToPlay) {
      return { success: false, allReady: false };
    }

    // Leader must have finished kitty exchange before being able to ready
    const leader = this.state.players[this.state.currentLeaderIdx];
    if (playerId === leader.id) {
      // Leader can always ready in this phase (they already exchanged kitty to get here)
    }

    if (this.state.readyPlayers.has(playerId)) {
      // Toggle off
      this.state.readyPlayers.delete(playerId);
      return { success: true, allReady: false };
    }

    this.state.readyPlayers.add(playerId);

    if (this.state.readyPlayers.size >= this.state.players.length) {
      this.startPlaying();
      return { success: true, allReady: true };
    }

    return { success: true, allReady: false };
  }

  private startPlaying(): void {
    this.state.phase = GamePhase.Playing;
    this.state.currentTurnIdx = this.state.currentLeaderIdx;
    this.state.currentTrick = {
      leadPlayerIdx: this.state.currentLeaderIdx,
      plays: [],
      points: 0,
    };
  }

  playCards(playerId: string, cards: Card[]): { success: boolean; reason?: string; trickComplete?: boolean } {
    if (this.state.phase !== GamePhase.Playing) {
      return { success: false, reason: 'Not in playing phase' };
    }

    const playerIdx = this.state.players.findIndex(p => p.id === playerId);
    if (playerIdx < 0) return { success: false, reason: 'Player not found' };
    if (playerIdx !== this.state.currentTurnIdx) {
      return { success: false, reason: 'Not your turn' };
    }

    const trick = this.state.currentTrick;
    if (!trick) return { success: false, reason: 'No current trick' };

    const hand = this.state.hands[playerId];
    const otherHands = this.state.players
      .filter(p => p.id !== playerId)
      .map(p => this.state.hands[p.id]);

    const validation = isValidPlay(cards, hand, trick, this.state.trumpInfo, this.state.settings, otherHands);
    if (!validation.valid) {
      if (validation.throwPenalty && validation.throwPenalty > 0) {
        const player = this.state.players[playerIdx];
        if (player.team === 'defending') {
          this.state.attackingPoints += validation.throwPenalty;
        } else {
          this.state.attackingPoints = Math.max(0, this.state.attackingPoints - validation.throwPenalty);
        }
      }
      return { success: false, reason: validation.reason };
    }

    for (const card of cards) {
      const idx = hand.findIndex(h =>
        h.kind === card.kind &&
        (h.kind === 'joker' && card.kind === 'joker' ? h.jokerType === card.jokerType && h.deckIndex === card.deckIndex :
         h.kind === 'suited' && card.kind === 'suited' ? h.suit === card.suit && h.rank === card.rank && h.deckIndex === card.deckIndex : false)
      );
      if (idx >= 0) hand.splice(idx, 1);
    }

    trick.plays.push({ playerIdx, cards });

    if (this.state.settings.gameMode === 'findingFriends') {
      this.checkFriendReveal(playerId, cards);
    }

    if (trick.plays.length === this.state.players.length) {
      return this.completeTrick();
    }

    this.state.currentTurnIdx = (this.state.currentTurnIdx + 1) % this.state.players.length;
    return { success: true, trickComplete: false };
  }

  private checkFriendReveal(playerId: string, cards: Card[]): void {
    for (const decl of this.state.friendDeclarations) {
      if (decl.found) continue;
      for (const card of cards) {
        if (card.kind === 'suited' && card.suit === decl.card.suit && card.rank === decl.card.rank) {
          let count = 0;
          for (const t of this.state.tricks) {
            for (const play of t.plays) {
              for (const c of play.cards) {
                if (c.kind === 'suited' && c.suit === decl.card.suit && c.rank === decl.card.rank) count++;
              }
            }
          }
          if (this.state.currentTrick) {
            for (const play of this.state.currentTrick.plays) {
              for (const c of play.cards) {
                if (c.kind === 'suited' && c.suit === decl.card.suit && c.rank === decl.card.rank) count++;
              }
            }
          }
          if (count >= decl.ordinal) {
            decl.found = true;
            decl.foundByPlayerId = playerId;
            this.state.defendingTeam.add(playerId);
            const player = this.state.players.find(p => p.id === playerId);
            if (player) player.team = 'defending';
          }
        }
      }
    }
  }

  private completeTrick(): { success: boolean; trickComplete: boolean } {
    const trick = this.state.currentTrick!;
    const winnerPlayIdx = determineTrickWinner(trick, this.state.trumpInfo, this.state.settings);
    trick.winner = trick.plays[winnerPlayIdx].playerIdx;

    const points = trick.plays.reduce((sum, play) => sum + countPoints(play.cards), 0);
    trick.points = points;

    const winnerPlayer = this.state.players[trick.winner];
    if (winnerPlayer.team === 'attacking') {
      this.state.attackingPoints += points;
    }

    this.state.tricks.push(trick);
    this.state.lastTrickWinner = trick.winner;

    const allEmpty = this.state.players.every(p => this.state.hands[p.id].length === 0);

    if (allEmpty) {
      this.finishRound();
      return { success: true, trickComplete: true };
    }

    this.state.currentTurnIdx = trick.winner;
    this.state.currentTrick = {
      leadPlayerIdx: trick.winner,
      plays: [],
      points: 0,
    };

    return { success: true, trickComplete: true };
  }

  private finishRound(): void {
    const lastTrick = this.state.tricks[this.state.tricks.length - 1];
    const lastWinner = this.state.players[lastTrick.winner!];
    const lastTrickWonByAttacking = lastWinner.team === 'attacking';

    const result = calculateRoundResult(
      this.state.attackingPoints,
      this.state.kitty,
      lastTrick,
      lastTrickWonByAttacking,
      this.state.trumpInfo,
      this.state.settings
    );

    if (result.defendingAdvance > 0) {
      for (const p of this.state.players) {
        if (p.team === 'defending') {
          p.rank = advanceRank(p.rank, result.defendingAdvance, this.state.settings.maxRank);
        }
      }
    }
    if (result.attackingAdvance > 0) {
      for (const p of this.state.players) {
        if (p.team === 'attacking') {
          p.rank = advanceRank(p.rank, result.attackingAdvance, this.state.settings.maxRank);
        }
      }
    }

    this.state.attackingPoints = result.attackingPoints;

    if (result.defendingAdvance > 0) {
      this.state.currentLeaderIdx = (this.state.currentLeaderIdx + 1) % this.state.players.length;
      while (this.state.players[this.state.currentLeaderIdx].team !== 'defending') {
        this.state.currentLeaderIdx = (this.state.currentLeaderIdx + 1) % this.state.players.length;
      }
    } else {
      this.state.currentLeaderIdx = (this.state.currentLeaderIdx + 1) % this.state.players.length;
      while (this.state.players[this.state.currentLeaderIdx].team !== 'attacking') {
        this.state.currentLeaderIdx = (this.state.currentLeaderIdx + 1) % this.state.players.length;
      }
    }

    const winner = this.state.players.find(p => hasWonGame(p.rank, this.state.settings.maxRank));
    this.state.phase = winner ? GamePhase.GameOver : GamePhase.Scoring;
  }

  getPlayerView(playerId: string): PlayerView {
    const playerIdx = this.state.players.findIndex(p => p.id === playerId);
    const hand = this.state.hands[playerId] || [];

    const handSizes: Record<string, number> = {};
    for (const p of this.state.players) {
      handSizes[p.id] = (this.state.hands[p.id] || []).length;
    }

    let kitty: Card[] | null = null;
    const leader = this.state.players[this.state.currentLeaderIdx];
    if (this.state.phase === GamePhase.KittyExchange && playerId === leader?.id) {
      kitty = this.state.kitty;
    }
    if (this.state.phase === GamePhase.Scoring && this.state.settings.revealKittyAtEnd) {
      kitty = this.state.kitty;
    }

    let canBid = false;
    const biddingOpen =
      this.state.phase === GamePhase.Drawing ||
      (this.state.phase === GamePhase.KittyPickup && !(playerId === leader?.id && this.state.kittyPickedUp)) ||
      this.state.phase === GamePhase.NoBidKittySelection;
    if (biddingOpen) {
      const handCards = this.state.hands[playerId] || [];
      canBid = handCards.some(c =>
        (c.kind === 'suited' && c.rank === this.state.trumpInfo.trumpRank) ||
        c.kind === 'joker'
      );
    }

    return {
      phase: this.state.phase,
      settings: this.state.settings,
      players: this.state.players.map(p => ({ ...p })),
      roundNumber: this.state.roundNumber,
      trumpInfo: this.state.trumpInfo,
      currentLeaderIdx: this.state.currentLeaderIdx,
      currentTurnIdx: this.state.currentTurnIdx,
      hand: sortHand(hand, this.state.trumpInfo),
      handSizes,
      kitty,
      kittySize: this.state.kitty.length,
      bids: this.state.bids,
      tricks: this.state.tricks,
      currentTrick: this.state.currentTrick,
      attackingPoints: this.state.attackingPoints,
      defendingPoints: (this.state.settings.numDecks * 100) - this.state.attackingPoints,
      friendDeclarations: this.state.friendDeclarations,
      myIndex: playerIdx,
      drawComplete: this.state.phase !== GamePhase.Drawing,
      canBid,
      drawPileSize: this.state.drawPile.length,
      lastTrickWinner: this.state.lastTrickWinner,
      noBidVotes: Array.from(this.state.noBidVotes),
      noBidSelectionCard: this.state.noBidSelectionCard,
      kittyPickedUp: this.state.kittyPickedUp,
      readyPlayers: Array.from(this.state.readyPlayers),
      chatMessages: this.chatMessages,
    };
  }
}
