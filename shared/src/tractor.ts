import { Card, TrumpInfo, GameSettings } from './types.js';
import { cardOrder, getEffectiveSuit, EffectiveSuit, sameCardFace, groupByFace } from './card.js';

export interface TrickComponent {
  cards: Card[];
  groupSize: number;  // 1=single, 2=pair, 3=triple, etc.
  length: number;     // consecutive groups (1=just a group, 2+=tractor)
}

/**
 * Check if a set of pairs/triples forms a tractor (consecutive sequence).
 * Groups must all be the same size and in the same effective suit.
 * Returns the tractor if valid, null otherwise.
 */
export function detectTractor(
  groups: Card[][],
  trump: TrumpInfo,
  settings: GameSettings
): TrickComponent | null {
  if (groups.length < settings.tractorMinLength) return null;
  if (groups[0].length < settings.tractorMinWidth) return null;

  const groupSize = groups[0].length;
  if (!groups.every(g => g.length === groupSize)) return null;

  // All must be same effective suit
  const suit = getEffectiveSuit(groups[0][0], trump);
  if (!groups.every(g => g.every(c => getEffectiveSuit(c, trump) === suit))) return null;

  // Each group must be identical cards
  if (!groups.every(g => {
    for (let i = 1; i < g.length; i++) {
      if (!sameCardFace(g[0], g[i])) return false;
    }
    return true;
  })) return null;

  // No two groups should be the same card face (pairs of equal cards don't make tractors)
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (sameCardFace(groups[i][0], groups[j][0])) return null;
    }
  }

  // Sort groups by card order
  const sorted = [...groups].sort(
    (a, b) => cardOrder(a[0], trump) - cardOrder(b[0], trump)
  );

  // Check consecutive ordering
  if (!areConsecutive(sorted, trump)) return null;

  const allCards = sorted.flat();
  return { cards: allCards, groupSize, length: sorted.length };
}

function areConsecutive(sortedGroups: Card[][], trump: TrumpInfo): boolean {
  const suit = getEffectiveSuit(sortedGroups[0][0], trump);

  // Get the ordered list of card strengths in this suit
  const orderValues = sortedGroups.map(g => cardOrder(g[0], trump));

  // Build the full ordering for this suit to check adjacency
  const fullOrdering = getFullSuitOrdering(suit, trump);

  for (let i = 0; i < orderValues.length - 1; i++) {
    const idxA = fullOrdering.indexOf(orderValues[i]);
    const idxB = fullOrdering.indexOf(orderValues[i + 1]);
    if (idxA === -1 || idxB === -1) return false;
    if (idxB - idxA !== 1) return false;
  }

  return true;
}

function getFullSuitOrdering(suit: EffectiveSuit, trump: TrumpInfo): number[] {
  if (suit === 'trump') {
    return getTrumpSuitFullOrdering(trump);
  }

  // Non-trump suit: ranks in order, skipping trump rank
  const orders: number[] = [];
  for (let r = 2; r <= 14; r++) {
    if (r === trump.trumpRank) continue;
    orders.push(r);
  }
  return orders;
}

function getTrumpSuitFullOrdering(trump: TrumpInfo): number[] {
  const orders: number[] = [];

  if (trump.trumpSuit !== null) {
    // Trump suit cards (non-trump-rank) in order
    for (let r = 2; r <= 14; r++) {
      if (r === trump.trumpRank) continue;
      orders.push(r);
    }
    // Trump rank of other suits (700)
    orders.push(700);
    // Trump rank of trump suit (800)
    orders.push(800);
    // Little joker (900)
    orders.push(900);
    // Big joker (1000)
    orders.push(1000);
  } else {
    // No-trump: Little joker, Big joker, then trump-rank cards
    orders.push(400); // LJ
    orders.push(500); // BJ
    orders.push(600); // trump rank cards
  }

  return orders;
}

/**
 * Decompose a set of cards (all same suit) into trick components.
 * Prefers the longest/largest components first.
 * Returns the list of components that make up the play.
 */
export function decomposePlay(
  cards: Card[],
  trump: TrumpInfo,
  settings: GameSettings
): TrickComponent[] {
  if (cards.length === 0) return [];
  if (cards.length === 1) {
    return [{ cards: [...cards], groupSize: 1, length: 1 }];
  }

  const groups = groupByFace(cards);
  const components: TrickComponent[] = [];
  const usedGroups = new Set<number>();

  // Sort groups by order value for tractor detection
  const sortedGroupIdxs = groups
    .map((g, i) => ({ group: g, idx: i }))
    .sort((a, b) => cardOrder(a.group[0], trump) - cardOrder(b.group[0], trump));

  // Try to find tractors first (longest ones first)
  for (let len = sortedGroupIdxs.length; len >= settings.tractorMinLength; len--) {
    for (let start = 0; start <= sortedGroupIdxs.length - len; start++) {
      const candidateIdxs = sortedGroupIdxs.slice(start, start + len);
      if (candidateIdxs.some(c => usedGroups.has(c.idx))) continue;

      const candidateGroups = candidateIdxs.map(c => c.group);
      // Try with the minimum group size across candidates
      const minSize = Math.min(...candidateGroups.map(g => g.length));

      for (let gs = minSize; gs >= settings.tractorMinWidth; gs--) {
        const trimmedGroups = candidateGroups.map(g => g.slice(0, gs));
        const tractor = detectTractor(trimmedGroups, trump, settings);
        if (tractor) {
          components.push(tractor);
          candidateIdxs.forEach(c => {
            // Mark partial usage - remove used cards from group
            const group = groups[c.idx];
            for (let k = 0; k < gs; k++) {
              group.shift();
            }
            if (group.length === 0) usedGroups.add(c.idx);
          });
          break;
        }
      }
    }
  }

  // Remaining groups become tuples (pairs, triples, singles)
  for (let i = 0; i < groups.length; i++) {
    if (usedGroups.has(i)) continue;
    const remaining = groups[i];
    if (remaining.length === 0) continue;
    components.push({
      cards: [...remaining],
      groupSize: remaining.length,
      length: 1,
    });
  }

  return components;
}

/**
 * Compare two trick components of the same format.
 * Returns positive if a beats b, negative if b beats a, 0 if tied.
 */
export function compareComponents(
  a: TrickComponent,
  b: TrickComponent,
  trump: TrumpInfo
): number {
  // Must be same format to compare
  if (a.groupSize !== b.groupSize || a.length !== b.length) return 0;

  // Compare by highest card in each
  const maxA = Math.max(...a.cards.map(c => cardOrder(c, trump)));
  const maxB = Math.max(...b.cards.map(c => cardOrder(c, trump)));
  return maxA - maxB;
}
