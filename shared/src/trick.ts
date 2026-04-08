import {
  Card, TrumpInfo, GameSettings, Trick, TrickPlay,
} from './types.js';
import {
  getEffectiveSuit, EffectiveSuit, cardOrder,
  getCardsInSuit, groupByFace, sameCardFace,
} from './card.js';
import { decomposePlay, TrickComponent, compareComponents, detectTractor } from './tractor.js';

/**
 * Determine the effective suit of a leading play.
 */
export function getLeadSuit(cards: Card[], trump: TrumpInfo): EffectiveSuit {
  // All cards in a lead should be same effective suit
  return getEffectiveSuit(cards[0], trump);
}

/**
 * Decompose the leading play into its format components.
 */
export function getLeadFormat(
  cards: Card[],
  trump: TrumpInfo,
  settings: GameSettings
): TrickComponent[] {
  return decomposePlay(cards, trump, settings);
}

/**
 * Check if a throw (multi-component lead) is valid.
 * A throw is valid if no single opponent can beat any component using cards in the same suit.
 */
export function isValidThrow(
  cards: Card[],
  leadSuit: EffectiveSuit,
  otherHands: Card[][],
  trump: TrumpInfo,
  settings: GameSettings
): { valid: boolean; failedComponent?: TrickComponent; beatableCards: number } {
  const components = decomposePlay(cards, trump, settings);
  if (components.length <= 1) return { valid: true, beatableCards: 0 };

  // Check that all cards are same suit
  if (!cards.every(c => getEffectiveSuit(c, trump) === leadSuit)) {
    return { valid: false, beatableCards: cards.length };
  }

  let beatableCards = 0;
  for (const component of components) {
    for (const hand of otherHands) {
      const suitCards = getCardsInSuit(hand, leadSuit, trump);
      if (canBeatComponent(component, suitCards, trump, settings)) {
        beatableCards += component.cards.length;
        break; // only count once per component
      }
    }
  }

  return {
    valid: beatableCards === 0,
    failedComponent: beatableCards > 0 ? components.find(comp => {
      for (const hand of otherHands) {
        const suitCards = getCardsInSuit(hand, leadSuit, trump);
        if (canBeatComponent(comp, suitCards, trump, settings)) return true;
      }
      return false;
    }) : undefined,
    beatableCards,
  };
}

function canBeatComponent(
  component: TrickComponent,
  availableCards: Card[],
  trump: TrumpInfo,
  settings: GameSettings
): boolean {
  const groups = groupByFace(availableCards);

  if (component.length === 1) {
    // Single group - find a same-size group that beats it
    for (const g of groups) {
      if (g.length >= component.groupSize) {
        const candidate: TrickComponent = {
          cards: g.slice(0, component.groupSize),
          groupSize: component.groupSize,
          length: 1,
        };
        if (compareComponents(candidate, component, trump) > 0) return true;
      }
    }
    return false;
  }

  // Tractor - find a tractor of same format that beats it
  const eligibleGroups = groups.filter(g => g.length >= component.groupSize);
  const trimmed = eligibleGroups.map(g => g.slice(0, component.groupSize));

  // Try all combinations of the right length
  for (const combo of combinations(trimmed, component.length)) {
    const tractor = detectTractor(combo, trump, settings);
    if (tractor && compareComponents(tractor, component, trump) > 0) {
      return true;
    }
  }

  return false;
}

function* combinations<T>(arr: T[], k: number): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = 0; i <= arr.length - k; i++) {
    for (const rest of combinations(arr.slice(i + 1), k - 1)) {
      yield [arr[i], ...rest];
    }
  }
}

/**
 * Determine what cards a player is obligated to play given the lead format.
 * Returns the set of cards that must be played (the obligation).
 * The player must match the format as best they can from the led suit.
 */
export function getObligatedCards(
  hand: Card[],
  leadFormat: TrickComponent[],
  leadSuit: EffectiveSuit,
  trump: TrumpInfo,
  settings: GameSettings
): { required: Card[]; remaining: number } {
  const suitCards = getCardsInSuit(hand, leadSuit, trump);
  const totalNeeded = leadFormat.reduce((sum, c) => sum + c.cards.length, 0);

  if (suitCards.length === 0) {
    // Void in suit - can play anything
    return { required: [], remaining: totalNeeded };
  }

  if (suitCards.length <= totalNeeded) {
    // Must play all cards of that suit
    return { required: [...suitCards], remaining: totalNeeded - suitCards.length };
  }

  // Has enough cards in suit - must try to match format
  const required: Card[] = [];
  const available = [...suitCards];

  // Sort format components by size (largest first) to match obligations
  const sortedFormat = [...leadFormat].sort(
    (a, b) => (b.groupSize * b.length) - (a.groupSize * a.length)
  );

  for (const component of sortedFormat) {
    const matched = matchObligation(available, component, trump, settings);
    for (const card of matched) {
      required.push(card);
      const idx = available.findIndex(c =>
        c.kind === card.kind &&
        (c.kind === 'joker' && card.kind === 'joker' ? c.jokerType === card.jokerType && c.deckIndex === card.deckIndex :
         c.kind === 'suited' && card.kind === 'suited' ? c.suit === card.suit && c.rank === card.rank && c.deckIndex === card.deckIndex : false)
      );
      if (idx >= 0) available.splice(idx, 1);
    }
  }

  return { required, remaining: totalNeeded - required.length };
}

function matchObligation(
  available: Card[],
  component: TrickComponent,
  trump: TrumpInfo,
  settings: GameSettings
): Card[] {
  const groups = groupByFace(available);

  if (component.length > 1) {
    // Tractor - try to find matching tractor first
    const eligibleGroups = groups.filter(g => g.length >= component.groupSize);
    for (const combo of combinations(eligibleGroups.map(g => g.slice(0, component.groupSize)), component.length)) {
      const tractor = detectTractor(combo, trump, settings);
      if (tractor) return tractor.cards;
    }

    // Can't match tractor - try to match pairs/groups
    const matched: Card[] = [];
    let remaining = component.length;
    const sortedGroups = groups
      .filter(g => g.length >= component.groupSize)
      .sort((a, b) => b.length - a.length);

    for (const g of sortedGroups) {
      if (remaining <= 0) break;
      matched.push(...g.slice(0, component.groupSize));
      remaining--;
    }

    // Only return the format-matched cards (pairs/groups) as obligated.
    // Remaining slots can be filled with any cards from the led suit.
    return matched;
  }

  // Single group (pair, triple, single)
  if (component.groupSize === 1) {
    return []; // Singles have no format obligation beyond suit
  }

  // Find groups of matching size
  for (const g of groups) {
    if (g.length >= component.groupSize) {
      return g.slice(0, component.groupSize);
    }
  }

  return [];
}

/**
 * Validate that a player's play is legal given the current trick state.
 */
export function isValidPlay(
  cards: Card[],
  hand: Card[],
  trick: Trick,
  trump: TrumpInfo,
  settings: GameSettings,
  otherHands?: Card[][]
): { valid: boolean; reason?: string; throwPenalty?: number; forcedCard?: Card } {
  if (cards.length === 0) return { valid: false, reason: 'Must play at least one card' };

  // Check cards are in hand
  const handCopy = [...hand];
  for (const card of cards) {
    const idx = handCopy.findIndex(h =>
      h.kind === card.kind &&
      (h.kind === 'joker' && card.kind === 'joker' ? h.jokerType === card.jokerType && h.deckIndex === card.deckIndex :
       h.kind === 'suited' && card.kind === 'suited' ? h.suit === card.suit && h.rank === card.rank && h.deckIndex === card.deckIndex : false)
    );
    if (idx < 0) return { valid: false, reason: 'Card not in hand' };
    handCopy.splice(idx, 1);
  }

  // If leading
  if (trick.plays.length === 0) {
    // Single card always valid
    if (cards.length === 1) return { valid: true };

    // Must all be same suit
    const suit = getEffectiveSuit(cards[0], trump);
    if (!cards.every(c => getEffectiveSuit(c, trump) === suit)) {
      return { valid: false, reason: 'All cards in a lead must be the same suit' };
    }

    // Multi-card: check if it's a valid throw
    const components = decomposePlay(cards, trump, settings);
    if (components.length > 1 && otherHands) {
      const throwCheck = isValidThrow(cards, suit, otherHands, trump, settings);
      if (!throwCheck.valid) {
        // Invalid throw: incur penalty of 10 * beatable cards, force lead with the failed component
        const penalty = 10 * throwCheck.beatableCards;
        const forced = throwCheck.failedComponent?.cards[0];
        return {
          valid: false,
          reason: `Invalid throw: ${throwCheck.beatableCards} beatable card(s), -${penalty} point penalty`,
          throwPenalty: penalty,
          forcedCard: forced,
        };
      }
    }

    return { valid: true };
  }

  // Following - must match card count
  const leadPlay = trick.plays[0];
  if (cards.length !== leadPlay.cards.length) {
    return { valid: false, reason: `Must play exactly ${leadPlay.cards.length} card(s)` };
  }

  // Check suit obligations
  const leadSuit = getLeadSuit(leadPlay.cards, trump);
  const leadFormat = getLeadFormat(leadPlay.cards, trump, settings);
  const suitCards = getCardsInSuit(hand, leadSuit, trump);

  if (suitCards.length === 0) {
    // Void - can play anything
    return { valid: true };
  }

  // Must play cards from the led suit as much as possible
  const playedInSuit = cards.filter(c => getEffectiveSuit(c, trump) === leadSuit);

  if (suitCards.length >= cards.length) {
    // Has enough cards in suit - must play all from that suit
    if (playedInSuit.length < cards.length) {
      return { valid: false, reason: 'Must play cards from the led suit' };
    }

    // Must also match format obligations (pairs before singles, tractors before pairs, etc.)
    const { required } = getObligatedCards(hand, leadFormat, leadSuit, trump, settings);
    if (required.length > 0) {
      // Check that all obligated cards are present in the played cards
      const playedCopy = [...cards];
      for (const req of required) {
        const idx = playedCopy.findIndex(c =>
          c.kind === req.kind &&
          (c.kind === 'joker' && req.kind === 'joker' ? c.jokerType === req.jokerType && c.deckIndex === req.deckIndex :
           c.kind === 'suited' && req.kind === 'suited' ? c.suit === req.suit && c.rank === req.rank && c.deckIndex === req.deckIndex : false)
        );
        if (idx < 0) {
          return { valid: false, reason: 'Must match the lead format with your available cards (e.g. play pairs before singles)' };
        }
        playedCopy.splice(idx, 1);
      }
    }
  } else {
    // Not enough - must play all suit cards
    if (playedInSuit.length < suitCards.length) {
      return { valid: false, reason: 'Must play all cards from the led suit first' };
    }
  }

  return { valid: true };
}

/**
 * Determine the winner of a completed trick.
 * Returns the index into trick.plays of the winning play.
 */
export function determineTrickWinner(
  trick: Trick,
  trump: TrumpInfo,
  settings: GameSettings
): number {
  if (trick.plays.length === 0) return 0;

  const leadPlay = trick.plays[0];
  const leadSuit = getLeadSuit(leadPlay.cards, trump);
  const leadFormat = decomposePlay(leadPlay.cards, trump, settings);

  let winnerIdx = 0;
  let winnerComponents = leadFormat;

  for (let i = 1; i < trick.plays.length; i++) {
    const play = trick.plays[i];
    const playSuit = getEffectiveSuit(play.cards[0], trump);

    // Can only win if playing in the led suit or trumping
    if (playSuit !== leadSuit && playSuit !== 'trump') continue;
    // Can't trump if led suit was trump
    if (leadSuit === 'trump' && playSuit !== 'trump') continue;

    const playComponents = decomposePlay(play.cards, trump, settings);

    // Must match the format to win
    if (!formatMatches(playComponents, winnerComponents)) {
      // Trumping: only wins if it's all trump and matches format
      if (playSuit === 'trump' && leadSuit !== 'trump') {
        if (formatMatches(playComponents, leadFormat)) {
          // Check if this trump play beats current winner
          if (getEffectiveSuit(trick.plays[winnerIdx].cards[0], trump) !== 'trump' ||
              beatsAll(playComponents, winnerComponents, trump)) {
            winnerIdx = i;
            winnerComponents = playComponents;
          }
        }
      }
      continue;
    }

    // Same format - compare
    if (beatsAll(playComponents, winnerComponents, trump)) {
      winnerIdx = i;
      winnerComponents = playComponents;
    }
  }

  return winnerIdx;
}

function formatMatches(a: TrickComponent[], b: TrickComponent[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => (y.groupSize * y.length) - (x.groupSize * x.length));
  const sortedB = [...b].sort((x, y) => (y.groupSize * y.length) - (x.groupSize * x.length));
  return sortedA.every((comp, i) =>
    comp.groupSize === sortedB[i].groupSize && comp.length === sortedB[i].length
  );
}

function beatsAll(
  challenger: TrickComponent[],
  current: TrickComponent[],
  trump: TrumpInfo
): boolean {
  const sortedC = [...challenger].sort((a, b) => (b.groupSize * b.length) - (a.groupSize * a.length));
  const sortedW = [...current].sort((a, b) => (b.groupSize * b.length) - (a.groupSize * a.length));

  for (let i = 0; i < sortedC.length; i++) {
    if (compareComponents(sortedC[i], sortedW[i], trump) <= 0) return false;
  }
  return true;
}
