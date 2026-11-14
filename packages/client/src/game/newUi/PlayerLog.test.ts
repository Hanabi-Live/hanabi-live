import type { CardState } from "@hanabi-live/game";
import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import type { ClueLogEntry } from "./ClueLog.tsx";
import { getPlayerActions, getPlayerLog } from "./PlayerLog.tsx";

describe("getPlayerLog", () => {
  const log = [
    {
      turn: 1,
      text: "Alice goes first",
    },
    {
      turn: 1,
      text: "Alice plays Red 1 from slot #1",
    },
    {
      turn: 2,
      text: "Al tells Alice about one red",
    },
    {
      turn: 3,
      text: "Bob discards Blue 4 from slot #5",
    },
    {
      turn: 4,
      text: "Alice discards Green 3 from slot #2",
    },
  ];
  const playerNames = ["Al", "Alice", "Bob"] as const;

  test("lists only the actions of the player", () => {
    expect(
      getPlayerLog(log, playerNames, 1).map((entry) => entry.turn),
    ).toEqual([1, 4]);
    expect(
      getPlayerLog(log, playerNames, 0).map((entry) => entry.turn),
    ).toEqual([2]);
    expect(
      getPlayerLog(log, playerNames, 2).map((entry) => entry.turn),
    ).toEqual([3]);
  });
});

describe("getPlayerActions", () => {
  const variant = getDefaultVariant();
  const deck = [
    {
      suitIndex: 0,
      rank: 1,
      segmentPlayed: 0,
      segmentDiscarded: undefined,
    },
    {
      suitIndex: 3,
      rank: 4,
      segmentPlayed: undefined,
      segmentDiscarded: 2,
    },
  ] as unknown as CardState[];
  const clue = {
    segment: 1,
    turn: 2,
    giverName: "Alice",
    targetName: "Bob",
    clueName: "Red",
    marker: {
      type: "color",
      name: "Red",
      fill: "red",
    },
    touchedCards: [],
    missedCards: [],
  } as const satisfies ClueLogEntry;

  test("reads the card or the clue that each line names", () => {
    const actions = getPlayerActions(
      [
        {
          turn: 1,
          text: "Alice plays Red 1 from slot #1 (blind)",
        },
        {
          turn: 2,
          text: "Alice tells Bob about one red",
        },
        {
          turn: 3,
          text: "Alice fails to play Blue 4 from the deck",
        },
        {
          turn: 4,
          text: "Alice discards a card from slot #2 (clued)",
        },
        {
          turn: 5,
          text: "Alice discards Green 2 from slot #3",
        },
        {
          turn: 6,
          text: "Alice ran out of time",
        },
      ],
      "Alice",
      deck,
      [clue],
      variant,
    );
    expect(actions.map((entry) => entry.action)).toEqual([
      {
        type: "play",
        card: {
          suitIndex: 0,
          rank: 1,
        },
        slot: 1,
        note: "blind",
      },
      {
        type: "clue",
        clue,
      },
      {
        type: "misplay",
        card: {
          suitIndex: 3,
          rank: 4,
        },
        slot: undefined,
        note: undefined,
      },
      {
        type: "discard",
        card: undefined,
        slot: 2,
        note: "clued",
      },
      // No card in the deck left a hand on that turn, so the line stays as text.
      {
        type: "other",
        text: "Discards Green 2 from slot #3",
      },
      {
        type: "other",
        text: "Ran out of time",
      },
    ]);
  });
});
