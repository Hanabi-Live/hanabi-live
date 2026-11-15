// The numbers about efficiency and the length of the game that both game screens show, and the HTML
// of their tooltips.

import type { NumPlayers, StatsState } from "@hanabi-live/game";
import { getEfficiency } from "@hanabi-live/game";
import type { State } from "./types/State.ts";
import { EFFICIENCY_DECIMAL_PLACES } from "./ui/constants.ts";

/** The H-Group's "Low Score Phase" lasts until the score reaches this many cards for each suit. */
const LOW_SCORE_PHASE_CARDS_PER_SUIT = 2;

/** Whether the score is in the H-Group's "Low Score Phase". */
export function isLowScorePhase(score: number, numSuits: number): boolean {
  return score < numSuits * LOW_SCORE_PHASE_CARDS_PER_SUIT;
}

/**
 * Whether the efficiency counts the cards that notes mark as gotten and the efficiency modifier. In
 * a finished game, only the shared replay's turns use them, since the leader sets the modifier for
 * their turn. In an ongoing game, the in-game replay does not use them.
 */
export function shouldModifyEfficiency(state: State): boolean {
  return state.finished
    ? state.replay.shared !== undefined && state.replay.shared.useSharedSegments
    : state.visibleState === state.ongoingGame;
}

export interface EfficiencyStats {
  /** The cards gotten, as the game counts them, without notes or the modifier. */
  readonly cardsGotten: number;

  /** The cards that notes mark as gotten, or `undefined` when they do not count. */
  readonly cardsGottenByNotes: number | undefined;

  /** The efficiency modifier, or `undefined` when it does not count. */
  readonly modifier: number | undefined;

  /** Whether a modifier other than 0 changes the efficiency. */
  readonly modified: boolean;
  readonly potentialCluesLost: number;

  /** The efficiency so far, or `undefined` once the final round has effectively started. */
  readonly currentEfficiency: number | undefined;
  readonly cardsNotGotten: number;
  readonly cluesStillUsableNotRounded: number | undefined;

  /** The efficiency that the rest of the game needs, or `undefined` when no clues are left. */
  readonly futureEfficiency: number | undefined;
  readonly spareClues: number | undefined;
}

export function getEfficiencyStats(
  stats: StatsState,
  efficiencyModifier: number,
  modify: boolean,
): EfficiencyStats {
  const cardsGottenByNotes = modify ? stats.cardsGottenByNotes : undefined;
  const modifier = modify ? efficiencyModifier : undefined;
  const cardsGotten =
    stats.cardsGotten + (modifier ?? 0) + (cardsGottenByNotes ?? 0);
  const cardsNotGotten = Math.max(stats.maxScore - cardsGotten, 0);
  const cluesStillUsable =
    stats.cluesStillUsableNotRounded === undefined
      ? undefined
      : Math.floor(stats.cluesStillUsableNotRounded);

  return {
    cardsGotten: stats.cardsGotten,
    cardsGottenByNotes,
    modifier,
    modified: modifier !== undefined && modifier !== 0,
    potentialCluesLost: stats.potentialCluesLost,
    currentEfficiency: stats.finalRoundEffectivelyStarted
      ? undefined
      : getEfficiency(cardsGotten, stats.potentialCluesLost),
    cardsNotGotten,
    cluesStillUsableNotRounded: stats.cluesStillUsableNotRounded,
    futureEfficiency:
      cluesStillUsable === undefined
        ? undefined
        : getEfficiency(cardsNotGotten, cluesStillUsable),
    spareClues:
      cluesStillUsable === undefined
        ? undefined
        : cluesStillUsable - cardsNotGotten,
  };
}

/** Returns an efficiency with its decimal places, or "-" when there is none. */
export function formatEfficiency(efficiency: number | undefined): string {
  return efficiency === undefined
    ? "-"
    : efficiency.toFixed(EFFICIENCY_DECIMAL_PLACES);
}

/**
 * The HTML of the tooltip on the future efficiency, which breaks it down. The hint says how to add
 * a modifier.
 */
export function getEfficiencyTooltip(
  stats: EfficiencyStats,
  hint: string,
): string {
  return `
    ${efficiencyLine("Current cards gotten", stats.cardsGotten)}
    ${efficiencyLine("Current cards noted as gotten", stats.cardsGottenByNotes ?? "-")}
    ${efficiencyLine("Current cards gotten modifier", stats.modifier ?? "-")}
    ${efficiencyLine("Potential clues lost", stats.potentialCluesLost)}
    ${efficiencyLine("Current efficiency", formatEfficiency(stats.currentEfficiency))}
    <br />
    ${efficiencyLine("Cards remaining to get", stats.cardsNotGotten)}
    ${efficiencyLine("Remaining possible clues", stats.cluesStillUsableNotRounded ?? "-")}
    ${efficiencyLine("Future required efficiency", formatEfficiency(stats.futureEfficiency))}
    ${efficiencyLine("Spare clues", stats.spareClues ?? "-")}
    <br />
    ${hint}
  `;
}

function efficiencyLine(left: string, right: number | string) {
  return `<span class="efficiency-description">${left}:</span> <strong>${right}</strong><br />`;
}

export interface MaxTurns {
  /** The most rounds left for the current player. */
  readonly roundsLeft: number;
  readonly turnsLeft: number;

  /** The most turns that the whole game can have. */
  readonly totalTurns: number;
}

/**
 * The most turns that the game can last: each card left to play, each discard that pace allows, and
 * each clue that can still be given takes one turn. Once the deck runs out, the game ends on its
 * last turn.
 */
export function getMaxTurns(
  stats: StatsState,
  score: number,
  turnNum: number,
  endTurnNum: number | undefined,
  numPlayers: NumPlayers,
): MaxTurns {
  const { pace } = stats;
  let turnsLeft: number;
  if (pace === undefined) {
    turnsLeft = endTurnNum === undefined ? 0 : endTurnNum - turnNum;
  } else {
    // With negative pace, the team cannot play all of the cards.
    const cardsToBePlayed = stats.maxScore - score + Math.min(pace, 0);
    const discards = Math.max(pace, 0);
    const clues = stats.cluesStillUsable ?? 0;
    turnsLeft = discards + clues + cardsToBePlayed;
  }

  return {
    roundsLeft: Math.ceil(turnsLeft / numPlayers),
    turnsLeft,
    totalTurns: turnNum + turnsLeft,
  };
}

/** The HTML of the tooltip on the turn. `turnNum` counts the turns so far, from 0. */
export function getMaxTurnsTooltip(
  maxTurns: MaxTurns,
  turnNum: number,
): string {
  return `<span class="turns-description">Rounds left (max):</span> <strong>${maxTurns.roundsLeft}</strong><br />
<span class="turns-description">Turns left (max):</span> <strong>${maxTurns.turnsLeft}</strong><br />
<span class="turns-description">Total turns:</span> <strong>${turnNum}</strong>/<strong>${maxTurns.totalTurns}</strong>`;
}
