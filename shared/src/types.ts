export enum Suit {
  Spades = 'S',
  Hearts = 'H',
  Diamonds = 'D',
  Clubs = 'C',
}

export enum Rank {
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Jack = 11,
  Queen = 12,
  King = 13,
  Ace = 14,
}

export enum JokerType {
  Little = 'LJ',
  Big = 'BJ',
}

export interface SuitedCard {
  kind: 'suited';
  suit: Suit;
  rank: Rank;
  deckIndex: number;
}

export interface JokerCard {
  kind: 'joker';
  jokerType: JokerType;
  deckIndex: number;
}

export type Card = SuitedCard | JokerCard;

export function cardId(card: Card): string {
  if (card.kind === 'joker') {
    return `${card.jokerType}_${card.deckIndex}`;
  }
  return `${card.suit}${card.rank}_${card.deckIndex}`;
}

export function cardEquals(a: Card, b: Card): boolean {
  return cardId(a) === cardId(b);
}

export function cardFaceEquals(a: Card, b: Card): boolean {
  if (a.kind === 'joker' && b.kind === 'joker') return a.jokerType === b.jokerType;
  if (a.kind === 'suited' && b.kind === 'suited') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

export enum GamePhase {
  Lobby = 'lobby',
  Drawing = 'drawing',
  NoBidKittySelection = 'noBidKittySelection', // no one bid, random kitty selection
  KittyPickup = 'kittyPickup',                 // leader confirms picking up kitty
  KittyExchange = 'kittyExchange',
  FriendDeclaration = 'friendDeclaration',
  ReadyToPlay = 'readyToPlay',                 // all players confirm ready
  Playing = 'playing',
  Scoring = 'scoring',
  GameOver = 'gameOver',
}

export type GameMode = 'tractor' | 'findingFriends';

export type BidPolicy = 'jokerOrHigherSuit' | 'jokerOrGreaterLength' | 'greaterLength';
export type BidReinforcementPolicy = 'reinforceWhileWinning' | 'reinforceWhileEquivalent' | 'overturnOrReinforce';
export type JokerBidPolicy = 'bothTwoOrMore' | 'bothNumDecks' | 'disabled';
export type KittyTheftPolicy = 'allow' | 'noTheft';
export type KittyBidPolicy = 'firstCard' | 'firstCardOfLevelOrHighest';
export type KittyPenalty = 'times' | 'power';
export type CardProtectionPolicy =
  | 'noProtections'
  | 'longerTuplesProtected'
  | 'onlyDrawTractorOnTractor'
  | 'longerAndTractor'
  | 'noFormatBasedDraw';
export type ThrowEvaluationPolicy = 'all' | 'highest' | 'trickUnitLength';
export type ThrowPenalty = 'none' | 'tenPoints';
export type FriendSelectionRestriction =
  | 'unrestricted'
  | 'trumpsIncluded'
  | 'highestCardNotAllowed'
  | 'pointCardNotAllowed';
export type AdvancementPolicy = 'unrestricted' | 'fullyUnrestricted' | 'defendPoints';
export type BombPolicy = 'noBombs' | 'allowBombs' | 'allowBombsSuitFollowing';
export type PointVisibility = 'all' | 'hideDefending';
export type LandlordSelectionPolicy = 'byWinningBid' | 'byFirstBid';
export type MaxRank = 'A' | 'NT';

export interface GameSettings {
  gameMode: GameMode;
  numDecks: number;
  numPlayers: number;
  kittySize: number;
  includeBigJoker: boolean;
  includeLittleJoker: boolean;
  minimumCard: Rank;
  bidPolicy: BidPolicy;
  bidReinforcementPolicy: BidReinforcementPolicy;
  jokerBidPolicy: JokerBidPolicy;
  landlordSelectionPolicy: LandlordSelectionPolicy;
  kittyTheftPolicy: KittyTheftPolicy;
  kittyBidPolicy: KittyBidPolicy;
  kittyPenalty: KittyPenalty;
  revealKittyAtEnd: boolean;
  cardProtectionPolicy: CardProtectionPolicy;
  throwEvaluationPolicy: ThrowEvaluationPolicy;
  throwPenalty: ThrowPenalty;
  hideThrowHaltingPlayer: boolean;
  friendSelectionRestriction: FriendSelectionRestriction;
  numFriends: number | null;
  advancementPolicy: AdvancementPolicy;
  maxRank: MaxRank;
  tractorMinWidth: number;
  tractorMinLength: number;
  bombPolicy: BombPolicy;
  pointVisibility: PointVisibility;
  playTakeback: boolean;
  bidTakeback: boolean;
  soundEnabled: boolean;
}

export function defaultSettings(numPlayers: number = 4): GameSettings {
  const numDecks = Math.ceil(numPlayers / 2);
  return {
    gameMode: 'tractor',
    numDecks,
    numPlayers,
    kittySize: 8,
    includeBigJoker: true,
    includeLittleJoker: true,
    minimumCard: Rank.Two,
    bidPolicy: 'jokerOrHigherSuit',
    bidReinforcementPolicy: 'reinforceWhileWinning',
    jokerBidPolicy: 'bothTwoOrMore',
    landlordSelectionPolicy: 'byWinningBid',
    kittyTheftPolicy: 'allow',
    kittyBidPolicy: 'firstCard',
    kittyPenalty: 'power',
    revealKittyAtEnd: true,
    cardProtectionPolicy: 'noProtections',
    throwEvaluationPolicy: 'all',
    throwPenalty: 'none',
    hideThrowHaltingPlayer: false,
    friendSelectionRestriction: 'unrestricted',
    numFriends: null,
    advancementPolicy: 'unrestricted',
    maxRank: 'A',
    tractorMinWidth: 2,
    tractorMinLength: 2,
    bombPolicy: 'noBombs',
    pointVisibility: 'all',
    playTakeback: false,
    bidTakeback: false,
    soundEnabled: true,
  };
}

export interface Bid {
  playerId: string;
  cards: Card[];
}

export interface FriendDeclaration {
  card: { suit: Suit; rank: Rank };
  ordinal: number;
  found: boolean;
  foundByPlayerId?: string;
}

export interface TrickUnit {
  cards: Card[];
  size: number;
  length: number;
}

export interface Trick {
  leadPlayerIdx: number;
  plays: TrickPlay[];
  winner?: number;
  points: number;
}

export interface TrickPlay {
  playerIdx: number;
  cards: Card[];
}

export interface Player {
  id: string;
  name: string;
  ready: boolean;
  rank: Rank;
  team?: 'defending' | 'attacking';
}

export interface TrumpInfo {
  trumpRank: Rank;
  trumpSuit: Suit | null;
}

export interface RoundResult {
  attackingPoints: number;
  defendingPoints: number;
  kittyPoints: number;
  kittyMultiplier: number;
  levelChange: number;
  defendingAdvance: number;
  attackingAdvance: number;
}

export interface ChatMessage {
  playerName: string;
  message: string;
  timestamp: number;
}

export interface GameState {
  phase: GamePhase;
  settings: GameSettings;
  players: Player[];
  roundNumber: number;
  trumpInfo: TrumpInfo;
  currentLeaderIdx: number;
  currentTurnIdx: number;
  drawPile: Card[];
  hands: Record<string, Card[]>;
  kitty: Card[];
  bids: Bid[];
  tricks: Trick[];
  currentTrick: Trick | null;
  attackingPoints: number;
  defendingPoints: number;
  friendDeclarations: FriendDeclaration[];
  defendingTeam: Set<string>;
  lastTrickWinner?: number;
  // New fields
  noBidVotes: Set<string>;         // players who voted for random kitty selection
  noBidSelectionCard: Card | null;  // the random card drawn for selection
  kittyPickedUp: boolean;           // whether leader has picked up kitty
  readyPlayers: Set<string>;        // players who confirmed ready to play
}

export type ClientMessage =
  | { type: 'authenticate'; payload: { token: string } }
  | { type: 'create_room'; payload: { playerName: string } }
  | { type: 'join_room'; payload: { roomId: string; playerName: string } }
  | { type: 'rejoin_room'; payload: { roomId: string; playerName: string } }
  | { type: 'update_settings'; payload: { settings: Partial<GameSettings> } }
  | { type: 'swap_position'; payload: { targetPlayerId: string } }
  | { type: 'ready'; payload: Record<string, never> }
  | { type: 'start_game'; payload: Record<string, never> }
  | { type: 'bid'; payload: { cards: Card[] } }
  | { type: 'skip_bid'; payload: Record<string, never> }
  | { type: 'vote_random_kitty'; payload: Record<string, never> }
  | { type: 'pickup_kitty'; payload: Record<string, never> }
  | { type: 'exchange_kitty'; payload: { kitty: Card[] } }
  | { type: 'declare_friends'; payload: { declarations: FriendDeclaration[] } }
  | { type: 'confirm_ready'; payload: Record<string, never> }
  | { type: 'play_cards'; payload: { cards: Card[] } }
  | { type: 'takeback'; payload: Record<string, never> }
  | { type: 'next_round'; payload: Record<string, never> }
  | { type: 'chat'; payload: { message: string } }
  | { type: 'lock_room'; payload: { locked: boolean } }
  | { type: 'spectate_as'; payload: { playerId: string } };

export interface PlayerView {
  phase: GamePhase;
  settings: GameSettings;
  players: Player[];
  roundNumber: number;
  trumpInfo: TrumpInfo;
  currentLeaderIdx: number;
  currentTurnIdx: number;
  hand: Card[];
  handSizes: Record<string, number>;
  kitty: Card[] | null;
  kittySize: number;
  bids: Bid[];
  tricks: Trick[];
  currentTrick: Trick | null;
  attackingPoints: number;
  defendingPoints: number;
  friendDeclarations: FriendDeclaration[];
  myIndex: number;
  drawComplete: boolean;
  canBid: boolean;
  drawPileSize: number;
  lastTrickWinner?: number;
  // New fields
  noBidVotes: string[];             // player IDs who voted
  noBidSelectionCard: Card | null;
  kittyPickedUp: boolean;
  readyPlayers: string[];           // player IDs who are ready
  chatMessages: ChatMessage[];
  connectedPlayers?: string[];        // player IDs currently connected
  devMode?: boolean;
  devPlayerIds?: { id: string; name: string }[];
  devPlayingAs?: string;
  isSpectator?: boolean;
  spectatorOf?: string | null;
}

export type ServerMessage =
  | { type: 'room_created'; payload: { roomId: string } }
  | { type: 'room_joined'; payload: { roomId: string; playerId: string } }
  | { type: 'game_state'; payload: PlayerView }
  | { type: 'card_drawn'; payload: { playerIdx: number; card?: Card } }
  | { type: 'bid_made'; payload: { playerIdx: number; cards: Card[] } }
  | { type: 'trick_completed'; payload: { trick: Trick; winnerIdx: number } }
  | { type: 'round_result'; payload: RoundResult }
  | { type: 'chat'; payload: ChatMessage }
  | { type: 'error'; payload: { message: string } }
  | { type: 'room_update'; payload: any }
  | { type: 'room_list'; payload: any }
  | { type: 'sound'; payload: { sound: string } };
