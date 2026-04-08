import { Card, Suit, Rank, JokerType, TrumpInfo, SuitedCard } from './types.js';
import { ALL_RANKS } from './constants.js';

const ALL_SUITS: Suit[] = [Suit.Spades, Suit.Hearts, Suit.Diamonds, Suit.Clubs];

export type EffectiveSuit = Suit | 'trump';

export function getEffectiveSuit(card: Card, trump: TrumpInfo): EffectiveSuit {
  if (card.kind === 'joker') return 'trump';
  if (card.rank === trump.trumpRank) return 'trump';
  if (trump.trumpSuit && card.suit === trump.trumpSuit) return 'trump';
  return card.suit;
}

export function isTrump(card: Card, trump: TrumpInfo): boolean {
  return getEffectiveSuit(card, trump) === 'trump';
}

/**
 * Returns the ordering value for a card within its effective suit.
 * Higher value = stronger card.
 *
 * Trump ordering (with trump suit specified):
 *   Big Joker > Little Joker > trump-rank of trump suit > trump-rank of other suits > remaining trump suit cards
 *
 * No-trump ordering:
 *   trump-rank cards (all equal) > Big Joker > Little Joker
 */
export function cardOrder(card: Card, trump: TrumpInfo): number {
  if (card.kind === 'joker') {
    if (trump.trumpSuit === null) {
      // No-trump: jokers are below trump-rank cards
      return card.jokerType === JokerType.Big ? 500 : 400;
    }
    return card.jokerType === JokerType.Big ? 1000 : 900;
  }

  const suited = card as SuitedCard;

  if (suited.rank === trump.trumpRank) {
    if (trump.trumpSuit === null) {
      // No-trump: all trump-rank cards are equal and highest
      return 600;
    }
    // Trump rank of trump suit is highest non-joker
    if (suited.suit === trump.trumpSuit) return 800;
    // Trump rank of other suits are equal, below trump-suit trump-rank
    return 700;
  }

  // Non-trump-rank cards: just their rank value
  // Adjusted to skip over the trump rank in ordering
  return suited.rank;
}

/**
 * Compare two cards within the same effective suit.
 * Returns positive if a > b, negative if a < b, 0 if equal strength.
 */
export function compareCards(a: Card, b: Card, trump: TrumpInfo): number {
  return cardOrder(a, trump) - cardOrder(b, trump);
}

/**
 * Get the adjacent ranks in a suit, accounting for trump rank removal.
 * For non-trump suits, the trump rank is removed, so 3 and 5 become adjacent if trump rank is 4.
 * For trump suit, normal ordering applies to the non-trump-rank cards.
 */
export function getAdjacentRanks(effectiveSuit: EffectiveSuit, trump: TrumpInfo): Rank[][] {
  if (effectiveSuit === 'trump') {
    return getTrumpAdjacentRanks(trump);
  }

  // Non-trump suit: remove trump rank from the sequence
  const ranks = ALL_RANKS.filter(r => r !== trump.trumpRank && r >= (Rank.Two as number));
  const pairs: Rank[][] = [];
  for (let i = 0; i < ranks.length - 1; i++) {
    pairs.push([ranks[i], ranks[i + 1]]);
  }
  return pairs;
}

function getTrumpAdjacentRanks(trump: TrumpInfo): Rank[][] {
  if (trump.trumpSuit === null) {
    // No-trump: no adjacency within trump cards (they're all individual)
    return [];
  }

  // Trump suit ordering for tractors:
  // non-trump-rank cards in trump suit (in rank order) then trump-rank cards then jokers
  // But trump-rank of other suits are equal (can't form tractors with each other)
  // and trump-rank of trump suit is above them

  const trumpSuitRanks = ALL_RANKS.filter(r => r !== trump.trumpRank);
  const pairs: Rank[][] = [];

  for (let i = 0; i < trumpSuitRanks.length - 1; i++) {
    pairs.push([trumpSuitRanks[i], trumpSuitRanks[i + 1]]);
  }

  return pairs;
}

/**
 * Sort cards for display: group by effective suit, then by order within suit.
 * Trump cards first, then each suit.
 */
export function sortHand(cards: Card[], trump: TrumpInfo): Card[] {
  return [...cards].sort((a, b) => {
    const suitA = getEffectiveSuit(a, trump);
    const suitB = getEffectiveSuit(b, trump);

    // Trump first
    if (suitA === 'trump' && suitB !== 'trump') return -1;
    if (suitA !== 'trump' && suitB === 'trump') return 1;

    // Same suit: sort by order descending (strongest first)
    if (suitA === suitB) {
      return cardOrder(b, trump) - cardOrder(a, trump);
    }

    // Different non-trump suits: spades, hearts, clubs, diamonds
    const suitOrder: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
    return (suitOrder[suitA] || 0) - (suitOrder[suitB] || 0);
  });
}

/**
 * Get all cards in a hand that belong to a specific effective suit.
 */
export function getCardsInSuit(hand: Card[], suit: EffectiveSuit, trump: TrumpInfo): Card[] {
  return hand.filter(c => getEffectiveSuit(c, trump) === suit);
}

/**
 * Check if two cards have the same face (same suit+rank or same joker type).
 * Different deck indices are allowed.
 */
export function sameCardFace(a: Card, b: Card): boolean {
  if (a.kind === 'joker' && b.kind === 'joker') return a.jokerType === b.jokerType;
  if (a.kind === 'suited' && b.kind === 'suited') return a.suit === b.suit && a.rank === b.rank;
  return false;
}

/**
 * Group cards by identical face.
 */
export function groupByFace(cards: Card[]): Card[][] {
  const groups: Card[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < cards.length; i++) {
    if (used.has(i)) continue;
    const group = [cards[i]];
    used.add(i);
    for (let j = i + 1; j < cards.length; j++) {
      if (used.has(j)) continue;
      if (sameCardFace(cards[i], cards[j])) {
        group.push(cards[j]);
        used.add(j);
      }
    }
    groups.push(group);
  }

  return groups;
}

/**
 * Get available non-trump suits.
 */
export function getNonTrumpSuits(trump: TrumpInfo): Suit[] {
  return ALL_SUITS.filter(s => s !== trump.trumpSuit);
}
