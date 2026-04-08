import { Rank } from './types.js';

export const POINT_VALUES: Record<number, number> = {
  [Rank.Five]: 5,
  [Rank.Ten]: 10,
  [Rank.King]: 10,
};

export const POINTS_PER_DECK = 100;

export const ALL_RANKS = [
  Rank.Two, Rank.Three, Rank.Four, Rank.Five, Rank.Six, Rank.Seven,
  Rank.Eight, Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
];

export const RANK_NAMES: Record<number, string> = {
  [Rank.Two]: '2',
  [Rank.Three]: '3',
  [Rank.Four]: '4',
  [Rank.Five]: '5',
  [Rank.Six]: '6',
  [Rank.Seven]: '7',
  [Rank.Eight]: '8',
  [Rank.Nine]: '9',
  [Rank.Ten]: '10',
  [Rank.Jack]: 'J',
  [Rank.Queen]: 'Q',
  [Rank.King]: 'K',
  [Rank.Ace]: 'A',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  S: '\u2660',
  H: '\u2665',
  D: '\u2666',
  C: '\u2663',
};

export const SUIT_NAMES: Record<string, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
};

export function getScoreThresholds(numDecks: number): { threshold: number; defendingAdvance: number; attackingAdvance: number }[] {
  const base = numDecks * 20;
  return [
    { threshold: 0, defendingAdvance: 3, attackingAdvance: 0 },
    { threshold: 5, defendingAdvance: 2, attackingAdvance: 0 },
    { threshold: base * 1, defendingAdvance: 1, attackingAdvance: 0 },
    { threshold: base * 2, defendingAdvance: 0, attackingAdvance: 0 },
    { threshold: base * 3, defendingAdvance: 0, attackingAdvance: 1 },
    { threshold: base * 4, defendingAdvance: 0, attackingAdvance: 2 },
    { threshold: base * 5, defendingAdvance: 0, attackingAdvance: 3 },
  ];
}

export function cardDisplayName(rank: Rank): string {
  return RANK_NAMES[rank] || String(rank);
}
