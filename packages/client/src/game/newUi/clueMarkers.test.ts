import type {
  ColorIndex,
  PlayerIndex,
  StateClue,
  Variant,
} from "@hanabi-live/game";
import {
  EVEN_RANK_CLUE,
  getDefaultVariant,
  getVariant,
  newRankClue,
} from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

const game = vi.hoisted<{ variant: unknown; state: unknown }>(() => ({
  variant: undefined,
  state: undefined,
}));
vi.mock("../gameSession.ts", () => ({
  currentVariant: () => game.variant,
  currentState: () => game.state,
}));
const { getPreviewMarker, getClueMarker } = await import("./clueMarkers.ts");

/** Character ID 34 is Quacker; player 1 has no character. */
const QUACKER_ASSIGNMENTS = [34, undefined] as const;

function setGame(variant: Variant, finished = false) {
  game.variant = variant;
  game.state = {
    finished,
    metadata: {
      characterAssignments: QUACKER_ASSIGNMENTS,
    },
  };
}

/** A clue as spectators and replays receive it, with its real value. */
function colorClue(giver: number): StateClue {
  return {
    type: "color",
    color: 0 as ColorIndex,
    giver: giver as PlayerIndex,
    target: 2 as PlayerIndex,
    segment: 0,
    list: [],
    negativeList: [],
  };
}

describe("getClueMarker", () => {
  test("hides a Duck clue, even when the clue's value is known", () => {
    setGame(getVariant("Duck (6 Suits)"));
    expect(getClueMarker(colorClue(1), false)).toEqual({ type: "hidden" });
  });

  test("hides a Quacker's clue until the game ends", () => {
    setGame(getDefaultVariant());
    expect(getClueMarker(colorClue(0), false)).toEqual({ type: "hidden" });

    setGame(getDefaultVariant(), true);
    expect(getClueMarker(colorClue(0), false).type).toBe("color");
  });

  test("shows only the clue's type in Cow & Pig", () => {
    setGame(getVariant("Cow & Pig (6 Suits)"));
    expect(getClueMarker(colorClue(1), false)).toMatchObject({
      type: "color",
      fill: "white",
    });

    const hiddenRankClue: StateClue = {
      ...colorClue(1),
      type: undefined,
      value: undefined,
      visibleType: "rank",
    };
    expect(getClueMarker(hiddenRankClue, false)).toEqual({
      type: "rank",
      label: "#",
    });
  });
});

describe("getPreviewMarker", () => {
  test("labels Odds and Evens clues with a letter", () => {
    setGame(getVariant("Odds and Evens (6 Suits)"));
    expect(getPreviewMarker(newRankClue(EVEN_RANK_CLUE), 1, false)).toEqual({
      type: "rank",
      label: "E",
    });
  });
});
