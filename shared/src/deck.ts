import { Card, Suit, Rank, JokerType, GameSettings, SuitedCard } from './types.js';
import { ALL_RANKS } from './constants.js';

const ALL_SUITS: Suit[] = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];

export function createDeck(settings: GameSettings): Card[] {
  const cards: Card[] = [];
  const validRanks = ALL_RANKS.filter(r => r >= settings.minimumCard);

  for (let d = 0; d < settings.numDecks; d++) {
    for (const suit of ALL_SUITS) {
      for (const rank of validRanks) {
        cards.push({ kind: 'suited', suit, rank, deckIndex: d });
      }
    }
    if (settings.includeLittleJoker) {
      cards.push({ kind: 'joker', jokerType: JokerType.Little, deckIndex: d });
    }
    if (settings.includeBigJoker) {
      cards.push({ kind: 'joker', jokerType: JokerType.Big, deckIndex: d });
    }
  }

  return cards;
}

export function shuffleDeck(cards: Card[]): Card[] {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function computeKittySize(settings: GameSettings): number {
  const totalCards = createDeck(settings).length;
  const remainder = totalCards % settings.numPlayers;
  if (settings.kittySize > 0) return settings.kittySize;
  return remainder === 0 ? settings.numPlayers : remainder;
}

export function dealCards(
  deck: Card[],
  numPlayers: number,
  kittySize: number
): { hands: Card[][]; kitty: Card[]; drawPile: Card[] } {
  const kitty = deck.slice(deck.length - kittySize);
  const drawPile = deck.slice(0, deck.length - kittySize);
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  return { hands, kitty, drawPile };
}

export function getCardPoints(card: Card): number {
  if (card.kind === 'joker') return 0;
  if (card.rank === Rank.Five) return 5;
  if (card.rank === Rank.Ten || card.rank === Rank.King) return 10;
  return 0;
}

export function countPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + getCardPoints(c), 0);
}

export function isSuitedCard(card: Card): card is SuitedCard {
  return card.kind === 'suited';
}
