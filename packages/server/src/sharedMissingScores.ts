import type { Variant } from "@hanabi-live/game";
import {
  getTotalCardsInDeck,
  getVariant,
  MAX_CLUE_NUM,
  VARIANT_NAMES,
} from "@hanabi-live/game";
import type { BestScore } from "./interfaces/BestScore";
import type { UserStatsRow } from "./interfaces/UserStatsRow";
import { normalizeString } from "./utils";

/** The number of cards in each player's hand, indexed by the number of players. */
const CARDS_PER_HAND: ReadonlyMap<number, number> = new Map([
  [2, 5],
  [3, 5],
  [4, 4],
  [5, 4],
  [6, 3],
]);

const FLOAT_REGEX = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

/** The efficiency thresholds that determine the color of the efficiency on the page. */
const NORMAL_EFFICIENCY_THRESHOLD = 1.33;
const HARD_EFFICIENCY_THRESHOLD = 1.5;

interface SharedMissingScoresFilters {
  /** Normalized. */
  readonly excludedVariants: readonly string[];
  readonly minEfficiency: number | undefined;
  readonly maxEfficiency: number | undefined;
}

export interface SharedMissingScoresRow {
  readonly name: string;
  readonly numPlayers: number;
  readonly score: number;
  readonly maxScore: number;
  readonly modifier: number;

  /** Formatted to 2 decimal places. */
  readonly efficiency: string;
  readonly efficiencyClass: "normal" | "hard" | "very-hard";
}

/**
 * Returns the normalized, non-empty values of a comma-separated query parameter, e.g. "Up or Down,
 * Duck" --> ["up or down", "duck"].
 */
export function parseCommaSeparated(
  value: string | undefined,
): readonly string[] {
  if (value === undefined) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "")
    .map((entry) => normalizeString(entry));
}

/**
 * @param variantName The name of the variant, which does not need to be normalized.
 * @param terms The search terms, which must already be normalized.
 * @returns Whether the variant name contains any of the terms.
 */
export function variantNameMatchesAny(
  variantName: string,
  terms: readonly string[],
): boolean {
  const normalizedVariantName = normalizeString(variantName);
  return terms.some((term) => normalizedVariantName.includes(term));
}

/** @returns `undefined` if the string is not a number. */
export function parseFloatStrict(string: string): number | undefined {
  const trimmedString = string.trim();
  return FLOAT_REGEX.test(trimmedString) ? Number(trimmedString) : undefined;
}

/**
 * The minimum efficiency that is needed in order to get the max score in a variant.
 *
 * This is a port of the `CalculateEfficiency` function in the Golang server, so that the numbers
 * shown on the page are identical.
 *
 * @see https://github.com/hanabi/hanabi.github.io/blob/main/misc/efficiency.md
 */
export function calculateEfficiency(
  numPlayers: number,
  variant: Variant,
): number {
  const cardsInDeck = getTotalCardsInDeck(variant);
  const cardsPerHand = CARDS_PER_HAND.get(numPlayers) ?? 4;
  const cardsDealt = (cardsPerHand - 1) * numPlayers;

  // We have to play numPlayers + 1 many consecutive cards in the endgame (if at pace 0). Thus, 1 +
  // numPlayers/stackSize (this rounds down) many stacks cannot be finished before the endgame
  // starts.
  const maxNumStacksFinishedBeforeEndgame =
    variant.suits.length - Math.trunc(numPlayers / variant.stackSize) - 1;

  const startingPace = cardsInDeck - cardsDealt - variant.maxScore;

  // In "Clue Starved" variants, each discard only grants 0.5 clue tokens. This is represented by
  // discards granting 1 clue token and clues costing 2 tokens (to avoid floating point numbers).
  const clueTokenMultiplier = variant.clueStarved ? 2 : 1;
  const startingClues = MAX_CLUE_NUM * clueTokenMultiplier;
  const numCluesGainedByFinishingStacks = variant.throwItInAHole
    ? 0
    : maxNumStacksFinishedBeforeEndgame;
  const numCluesGainedByDiscards = startingPace;
  const totalAvailableClueTokens =
    startingClues + numCluesGainedByFinishingStacks + numCluesGainedByDiscards;

  // Integer division, like in the Golang server.
  const totalAvailableClues = Math.trunc(
    totalAvailableClueTokens / clueTokenMultiplier,
  );

  return variant.maxScore / totalAvailableClues;
}

/**
 * A best score is better when it has a higher score, or when it has an equal score but fewer
 * modifiers (by comparing the bitflags numerically). For example, a modifier of 1 (bottom-deck
 * blind-plays) is better than a modifier of 4 (one extra card).
 */
export function isBetterThan(
  bestScoreA: BestScore,
  bestScoreB: BestScore,
): boolean {
  return (
    bestScoreA.score > bestScoreB.score
    || (bestScoreA.score === bestScoreB.score
      && bestScoreA.modifier < bestScoreB.modifier)
  );
}

/**
 * Combines the stats of multiple players for a variant, always using the best score from any
 * player.
 */
function getCombinedBestScore(
  statsPerPlayer: ReadonlyArray<ReadonlyMap<number, UserStatsRow>>,
  variantID: number,
  numPlayers: number,
): BestScore {
  let bestScore: BestScore = { numPlayers, score: 0, modifier: 0 };

  for (const [i, stats] of statsPerPlayer.entries()) {
    const candidate = stats.get(variantID)?.bestScores[numPlayers - 2];
    if (candidate === undefined) {
      continue;
    }

    // The first player is the baseline that the others are compared against.
    if (i === 0 || isBetterThan(candidate, bestScore)) {
      bestScore = candidate;
    }
  }

  return bestScore;
}

/**
 * @returns The variants that none of the players have a perfect score in (for a given number of
 *          players), after applying the filters.
 */
export function getSharedMissingScoresRows(
  numPlayers: number,
  statsPerPlayer: ReadonlyArray<ReadonlyMap<number, UserStatsRow>>,
  filters: SharedMissingScoresFilters,
): readonly SharedMissingScoresRow[] {
  const rows: SharedMissingScoresRow[] = [];

  for (const variantName of VARIANT_NAMES) {
    if (variantNameMatchesAny(variantName, filters.excludedVariants)) {
      continue;
    }

    const variant = getVariant(variantName);
    const efficiency = calculateEfficiency(numPlayers, variant);

    // Compare against the rounded value, since that is what is shown on the page.
    const roundedEfficiency = Math.round(efficiency * 100) / 100;
    if (
      filters.minEfficiency !== undefined
      && roundedEfficiency < filters.minEfficiency
    ) {
      continue;
    }
    if (
      filters.maxEfficiency !== undefined
      && roundedEfficiency > filters.maxEfficiency
    ) {
      continue;
    }

    const bestScore = getCombinedBestScore(
      statsPerPlayer,
      variant.id,
      numPlayers,
    );
    if (bestScore.score === variant.maxScore && bestScore.modifier === 0) {
      continue;
    }

    let efficiencyClass: SharedMissingScoresRow["efficiencyClass"] =
      "very-hard";
    if (efficiency < NORMAL_EFFICIENCY_THRESHOLD) {
      efficiencyClass = "normal";
    } else if (efficiency < HARD_EFFICIENCY_THRESHOLD) {
      efficiencyClass = "hard";
    }

    rows.push({
      name: variantName,
      numPlayers,
      score: bestScore.score,
      maxScore: variant.maxScore,
      modifier: bestScore.modifier,
      efficiency: efficiency.toFixed(2),
      efficiencyClass,
    });
  }

  return rows;
}
