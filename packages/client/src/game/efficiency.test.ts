import type { StatsState } from "@hanabi-live/game";
import { getDefaultMetadata, getInitialGameState } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { getEfficiencyStats, getMaxTurns } from "./efficiency.ts";

const NUM_PLAYERS = 3;

function getStats(stats: Partial<StatsState>): StatsState {
  const metadata = getDefaultMetadata(NUM_PLAYERS);
  return {
    ...getInitialGameState(metadata).stats,
    maxScore: 25,
    ...stats,
  };
}

describe("getEfficiencyStats", () => {
  const stats = getStats({
    cardsGotten: 6,
    cardsGottenByNotes: 2,
    potentialCluesLost: 5,
    cluesStillUsableNotRounded: 12.5,
  });

  test("counts the notes and the modifier in the game as it stands", () => {
    const efficiency = getEfficiencyStats(stats, 1, true);
    // 25 - (6 + 2 + 1) cards left for 12 clues.
    expect(efficiency.cardsNotGotten).toBe(16);
    expect(efficiency.futureEfficiency).toBeCloseTo(16 / 12);
    expect(efficiency.currentEfficiency).toBeCloseTo(9 / 5);
    expect(efficiency.spareClues).toBe(-4);
    expect(efficiency.modified).toBe(true);
  });

  test("leaves out the notes and the modifier in a replay", () => {
    const efficiency = getEfficiencyStats(stats, 1, false);
    expect(efficiency.cardsNotGotten).toBe(19);
    expect(efficiency.futureEfficiency).toBeCloseTo(19 / 12);
    expect(efficiency.cardsGottenByNotes).toBeUndefined();
    expect(efficiency.modifier).toBeUndefined();
    expect(efficiency.modified).toBe(false);
  });

  test("has no future efficiency when no clues are left", () => {
    const efficiency = getEfficiencyStats(
      getStats({ cluesStillUsableNotRounded: undefined }),
      0,
      true,
    );
    expect(efficiency.futureEfficiency).toBeUndefined();
    expect(efficiency.spareClues).toBeUndefined();
  });
});

describe("getMaxTurns", () => {
  test("counts the cards to play, the discards, and the clues", () => {
    const maxTurns = getMaxTurns(
      getStats({
        pace: 4,
        cluesStillUsable: 10,
      }),
      5,
      12,
      undefined,
      NUM_PLAYERS,
    );
    // 20 cards to play, 4 discards, and 10 clues.
    expect(maxTurns).toStrictEqual({
      roundsLeft: 12,
      turnsLeft: 34,
      totalTurns: 46,
    });
  });

  test("leaves out the cards that negative pace makes unplayable", () => {
    const maxTurns = getMaxTurns(
      getStats({
        pace: -2,
        cluesStillUsable: 3,
      }),
      20,
      40,
      undefined,
      NUM_PLAYERS,
    );
    expect(maxTurns.turnsLeft).toBe(3 + 3);
  });

  test("ends on the last turn once the deck is empty", () => {
    const maxTurns = getMaxTurns(
      getStats({ pace: undefined }),
      20,
      40,
      42,
      NUM_PLAYERS,
    );
    expect(maxTurns).toStrictEqual({
      roundsLeft: 1,
      turnsLeft: 2,
      totalTurns: 42,
    });
  });
});
