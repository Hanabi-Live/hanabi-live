import type { CardIdentity, CardOrder, CardState } from "@hanabi-live/game";
import {
  getDefaultVariant,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { State } from "../types/State.ts";
import type { CardClick, CardClickContext } from "./cardClicks.ts";
import { getCardClickCommand, getSpeedrunCommand } from "./cardClicks.ts";

const VARIANT = getDefaultVariant();

const LEFT = 0;
const MIDDLE = 1;
const RIGHT = 2;

function click(button: number, keys: Partial<CardClick> = {}): CardClick {
  return {
    button,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...keys,
  };
}

const OUR_CARD = 0 as CardOrder;
const TEAMMATE_CARD = 1 as CardOrder;
const PLAYED_CARD = 2 as CardOrder;

function card(
  location: CardState["location"],
  segments: Partial<CardState> = {},
): CardState {
  return {
    location,
    segmentDrawn: undefined,
    segmentFirstClued: undefined,
    segmentPlayed: undefined,
    segmentDiscarded: undefined,
    ...segments,
  } as CardState;
}

const DECK = [
  card(0, {
    segmentDrawn: 4,
    segmentFirstClued: 6,
  }),
  card(1),
  card("playStack", { segmentPlayed: 8 }),
] as const;

function context({
  finished = false,
  hypothetical = false,
  clueTokens = 8,
}: {
  finished?: boolean;
  hypothetical?: boolean;
  clueTokens?: number;
} = {}): CardClickContext {
  const gameState = {
    deck: DECK,
    clueTokens,
  };
  return {
    state: {
      finished,
      playing: !finished,
      metadata: {
        ourPlayerIndex: 0,
        options: {
          speedrun: true,
        },
      },
      ongoingGame: gameState,
      visibleState: gameState,
      replay: {
        segment: undefined,
        hypothetical: hypothetical
          ? {
              ongoing: gameState,
              states: [],
            }
          : undefined,
        ownHypothetical: hypothetical ? {} : undefined,
        shared: undefined,
      },
    } as unknown as State,
    variant: VARIANT,
    identities: [
      {
        suitIndex: undefined,
        rank: undefined,
      },
      {
        suitIndex: 0,
        rank: 3,
      },
      {
        suitIndex: 0,
        rank: 1,
      },
    ] as CardIdentity[],
  };
}

describe("getCardClickCommand", () => {
  test("Ctrl + click edits the note in a game", () => {
    expect(
      getCardClickCommand(
        click(LEFT, { ctrlKey: true }),
        OUR_CARD,
        context(),
        false,
      ),
    ).toStrictEqual({ type: "editNote" });
    expect(
      getCardClickCommand(
        click(LEFT, { ctrlKey: true }),
        OUR_CARD,
        context({ finished: true }),
        false,
      ),
    ).toBeUndefined();
  });

  test("a click on a played card shows the turn it was played", () => {
    expect(
      getCardClickCommand(click(LEFT), PLAYED_CARD, context(), false),
    ).toStrictEqual({
      type: "showCard",
      segment: 8,
    });
  });

  test("Alt + click shows the card being drawn", () => {
    expect(
      getCardClickCommand(
        click(LEFT, { altKey: true }),
        OUR_CARD,
        context(),
        false,
      ),
    ).toStrictEqual({
      type: "showDraw",
      segment: 4,
    });
    expect(
      getCardClickCommand(
        click(LEFT, { altKey: true }),
        TEAMMATE_CARD,
        context(),
        false,
      ),
    ).toStrictEqual({
      type: "showCard",
      segment: 0,
    });
  });

  test("a middle click shows the turn after the card was first clued", () => {
    expect(
      getCardClickCommand(click(MIDDLE), OUR_CARD, context(), false),
    ).toStrictEqual({
      type: "showSegment",
      segment: 7,
    });
  });

  test("no click goes to another turn in a hypothetical", () => {
    expect(
      getCardClickCommand(
        click(LEFT),
        PLAYED_CARD,
        context({ hypothetical: true }),
        false,
      ),
    ).toBeUndefined();
  });

  test("Alt + right-click changes a card in our hypothetical", () => {
    expect(
      getCardClickCommand(
        click(RIGHT, { altKey: true }),
        TEAMMATE_CARD,
        context({
          finished: true,
          hypothetical: true,
        }),
        false,
      ),
    ).toStrictEqual({ type: "morph" });
    expect(
      getCardClickCommand(
        click(RIGHT, { altKey: true }),
        TEAMMATE_CARD,
        context({ finished: true }),
        false,
      ),
    ).toBeUndefined();
  });

  test("speedrun clicks replace the clicks that show turns", () => {
    expect(
      getCardClickCommand(click(LEFT), PLAYED_CARD, context(), true),
    ).toBeUndefined();
  });
});

describe("getSpeedrunCommand", () => {
  test("plays our card with a left-click and discards it with a right-click", () => {
    expect(getSpeedrunCommand(click(LEFT), OUR_CARD, context())).toStrictEqual({
      type: "play",
    });
    expect(
      getSpeedrunCommand(click(RIGHT), OUR_CARD, context({ clueTokens: 4 })),
    ).toStrictEqual({ type: "discard" });
  });

  test("does not discard at the maximum number of clues", () => {
    expect(getSpeedrunCommand(click(RIGHT), OUR_CARD, context())).toStrictEqual(
      { type: "refuse" },
    );
  });

  test("gives a teammate a color clue or a rank clue", () => {
    expect(
      getSpeedrunCommand(click(LEFT), TEAMMATE_CARD, context()),
    ).toStrictEqual({
      type: "clue",
      receiverIndex: 1,
      clue: newColorClue(VARIANT.clueColors[0]!),
    });
    expect(
      getSpeedrunCommand(click(RIGHT), TEAMMATE_CARD, context()),
    ).toStrictEqual({
      type: "clue",
      receiverIndex: 1,
      clue: newRankClue(3),
    });
  });

  test("does not clue without a clue token", () => {
    expect(
      getSpeedrunCommand(
        click(LEFT),
        TEAMMATE_CARD,
        context({ clueTokens: 0 }),
      ),
    ).toStrictEqual({ type: "refuse" });
  });

  test("leaves clicks with a key held down to the notes", () => {
    expect(
      getSpeedrunCommand(
        click(RIGHT, { ctrlKey: true }),
        TEAMMATE_CARD,
        context(),
      ),
    ).toBeUndefined();
  });
});
