import { Card, Rank, TrumpInfo, GameSettings, RoundResult, Trick } from './types.js';
import { countPoints } from './deck.js';
import { getScoreThresholds } from './constants.js';
import { decomposePlay } from './tractor.js';

/**
 * Calculate the kitty multiplier based on the largest component of the last trick.
 */
export function getKittyMultiplier(lastTrick: Trick, trump: TrumpInfo, settings: GameSettings): number {
  if (!lastTrick || lastTrick.plays.length === 0) return 2;

  const winnerPlay = lastTrick.plays.find(p => p.playerIdx === lastTrick.winner);
  if (!winnerPlay) return 2;

  const components = decomposePlay(winnerPlay.cards, trump, settings);
  let maxSize = 1;
  for (const comp of components) {
    const size = comp.groupSize * comp.length;
    if (size > maxSize) maxSize = size;
  }

  if (settings.kittyPenalty === 'power') {
    return Math.pow(2, maxSize);
  }

  // 'times' mode
  return 2 * maxSize;
}

/**
 * Calculate the round result based on points collected and kitty.
 */
export function calculateRoundResult(
  attackingPoints: number,
  kitty: Card[],
  lastTrick: Trick,
  lastTrickWonByAttacking: boolean,
  trump: TrumpInfo,
  settings: GameSettings
): RoundResult {
  let kittyPoints = 0;
  let kittyMultiplier = 1;

  // If attacking team wins the last trick, kitty points are multiplied
  if (lastTrickWonByAttacking) {
    kittyPoints = countPoints(kitty);
    kittyMultiplier = getKittyMultiplier(lastTrick, trump, settings);
    attackingPoints += kittyPoints * kittyMultiplier;
  }

  const thresholds = getScoreThresholds(settings.numDecks);
  let defendingAdvance = 0;
  let attackingAdvance = 0;

  // Find the applicable threshold
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (attackingPoints >= thresholds[i].threshold) {
      defendingAdvance = thresholds[i].defendingAdvance;
      attackingAdvance = thresholds[i].attackingAdvance;
      break;
    }
  }

  const totalPoints = settings.numDecks * 100;

  return {
    attackingPoints,
    defendingPoints: totalPoints - attackingPoints,
    kittyPoints,
    kittyMultiplier,
    levelChange: attackingAdvance - defendingAdvance,
    defendingAdvance,
    attackingAdvance,
  };
}

/**
 * Advance a player's rank by the given number of levels.
 */
export function advanceRank(currentRank: Rank, levels: number, maxRank: 'A' | 'NT'): Rank {
  if (levels <= 0) return currentRank;

  const allRanks = [
    Rank.Two, Rank.Three, Rank.Four, Rank.Five,
    Rank.Six, Rank.Seven, Rank.Eight, Rank.Nine, Rank.Ten,
    Rank.Jack, Rank.Queen, Rank.King, Rank.Ace,
  ];

  const maxIdx = maxRank === 'A' ? allRanks.length - 1 : allRanks.length - 1; // NT handled differently
  const currentIdx = allRanks.indexOf(currentRank);
  if (currentIdx === -1) return currentRank;

  const newIdx = Math.min(currentIdx + levels, maxIdx);
  return allRanks[newIdx];
}

/**
 * Check if a player has won the game (reached max rank and defended).
 */
export function hasWonGame(rank: Rank, maxRank: 'A' | 'NT'): boolean {
  if (maxRank === 'A') return rank >= Rank.Ace;
  return rank >= Rank.Ace; // NT variant would need additional logic
}
