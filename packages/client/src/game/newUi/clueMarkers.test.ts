import type {
  CardOrder,
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

const game = vi.hoisted<{ variant: unknown }>(() => ({
  variant: undefined,
}));
vi.mock("../gameSession.ts", () => ({
  currentVariant: () => game.variant,
}));
const {
  getPreviewMarker,
  getClueMarker,
  getClueMarkers,
  QUACK_EMOJI,
  MOO_EMOJI,
  OINK_EMOJI,
} = await import("./clueMarkers.ts");

function setGame(variant: Variant) {
  game.variant = variant;
}

const DUCK = {
  type: "sound",
  emoji: QUACK_EMOJI,
} as const;

/** A clue as spectators and replays receive it, with its real value. */
function colorClue(): StateClue {
  return {
    type: "color",
    color: 0 as ColorIndex,
    giver: 1 as PlayerIndex,
    target: 2 as PlayerIndex,
    segment: 0,
    list: [],
    negativeList: [],
  };
}

describe("getClueMarker", () => {
  test("hides a Duck clue, even when the clue's value is known", () => {
    setGame(getVariant("Duck (6 Suits)"));
    expect(getClueMarker(colorClue(), false)).toEqual(DUCK);
  });

  test("shows only the clue's type in Cow & Pig", () => {
    setGame(getVariant("Cow & Pig (6 Suits)"));
    expect(getClueMarker(colorClue(), false)).toMatchObject({
      type: "sound",
      emoji: MOO_EMOJI,
      badge: {
        type: "fill",
      },
    });

    const hiddenRankClue: StateClue = {
      ...colorClue(),
      type: undefined,
      value: undefined,
      visibleType: "rank",
    };
    expect(getClueMarker(hiddenRankClue, false)).toEqual({
      type: "sound",
      emoji: OINK_EMOJI,
      badge: {
        type: "mark",
        mark: "#",
      },
    });
  });
});

describe("getPreviewMarker", () => {
  test("labels Odds and Evens clues with a letter", () => {
    setGame(getVariant("Odds and Evens (6 Suits)"));
    expect(getPreviewMarker(newRankClue(EVEN_RANK_CLUE), false)).toEqual({
      type: "rank",
      label: "E",
    });
  });
});

/** A rank clue on a segment that touches the cards. */
function rankClue(segment: number, list: readonly number[]): StateClue {
  return {
    type: "rank",
    rank: 3,
    giver: 0 as PlayerIndex,
    target: 1 as PlayerIndex,
    segment,
    list: list as CardOrder[],
    negativeList: [],
  };
}

describe("getClueMarkers", () => {
  test("marks the cards that an earlier clue touched", () => {
    setGame(getDefaultVariant());
    const earlier = rankClue(0, [1, 2]);
    const clue = rankClue(2, [2, 3]);
    // A later clue, as in a replay that shows an earlier turn.
    const later = rankClue(4, [3]);
    const markers = getClueMarkers(clue, [earlier, clue, later], false);
    expect(markers.get(2 as CardOrder)?.touchedBefore).toBe(true);
    expect(markers.get(3 as CardOrder)?.touchedBefore).toBe(false);
    expect(markers.has(1 as CardOrder)).toBe(false);
  });
});
