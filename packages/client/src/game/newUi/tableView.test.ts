import type {
  CardIdentity,
  CardNote,
  CardOrder,
  SuitIndex,
} from "@hanabi-live/game";
import {
  getDefaultMetadata,
  getDefaultVariant,
  getInitialCardState,
  getInitialGameState,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  BLANK_NOTE,
  getCardView,
  getHandDisplayOrder,
  getTouchedCards,
  isClueAllowed,
  shouldFadeTrash,
} from "./tableView.ts";

const VARIANT = getDefaultVariant();

describe("getHandDisplayOrder", () => {
  const hand = [3, 7, 9] as CardOrder[];

  test("puts the newest card on the left", () => {
    expect(getHandDisplayOrder(hand, false)).toStrictEqual([9, 7, 3]);
  });

  test("keeps the stored order when the player reversed their hands", () => {
    expect(getHandDisplayOrder(hand, true)).toStrictEqual([3, 7, 9]);
  });
});

describe("getTouchedCards", () => {
  const hand = [0, 1, 2] as CardOrder[];
  const identities = [
    {
      suitIndex: 0,
      rank: 1,
    },
    {
      suitIndex: 1,
      rank: 1,
    },
    {
      suitIndex: 0,
      rank: 3,
    },
  ] as CardIdentity[];

  test("finds the cards of a rank", () => {
    expect(
      getTouchedCards(VARIANT, hand, identities, newRankClue(1)),
    ).toStrictEqual([0, 1]);
  });

  test("finds the cards of a color", () => {
    const red = VARIANT.clueColors[0]!;
    expect(
      getTouchedCards(VARIANT, hand, identities, newColorClue(red)),
    ).toStrictEqual([0, 2]);
  });

  test("skips cards that the viewer cannot see", () => {
    const unknown = [
      {
        suitIndex: undefined,
        rank: undefined,
      },
      ...identities.slice(1),
    ] as CardIdentity[];
    expect(
      getTouchedCards(VARIANT, hand, unknown, newRankClue(1)),
    ).toStrictEqual([1]);
  });
});

describe("isClueAllowed", () => {
  const options = { emptyClues: false } as Parameters<typeof isClueAllowed>[3];

  test("needs a clue to touch a card", () => {
    expect(isClueAllowed(newRankClue(1), 0, VARIANT, options)).toBe(false);
    expect(isClueAllowed(newRankClue(1), 2, VARIANT, options)).toBe(true);
  });

  test("allows a clue that touches nothing when the table allows empty clues", () => {
    expect(
      isClueAllowed(newRankClue(1), 0, VARIANT, {
        ...options,
        emptyClues: true,
      }),
    ).toBe(true);
  });
});

describe("getCardView", () => {
  const gameState = getInitialGameState(getDefaultMetadata(2));
  const cardState = getInitialCardState(0 as CardOrder, VARIANT, 2);
  const red1 = {
    suitIndex: 0 as SuitIndex,
    rank: 1,
  } as const;

  function getView(note: Partial<CardNote>, { finished = false } = {}) {
    return getCardView({
      gameState,
      cardState,
      cardIdentity: red1,
      note: {
        ...BLANK_NOTE,
        ...note,
      },
      variant: VARIANT,
      empathy: false,
      finished,
      realLifeMode: false,
    });
  }

  test("shows the mark of a note keyword", () => {
    expect(getView({}).noteMark).toBeUndefined();
    expect(getView({ questionMark: true }).noteMark).toBe("questionMark");
    expect(
      getView({
        knownTrash: true,
        questionMark: true,
      }).noteMark,
    ).toBe("trash");
  });

  test("hides the marks of notes in a finished game", () => {
    expect(
      getView({ questionMark: true }, { finished: true }).noteMark,
    ).toBeUndefined();
  });

  test("shows a card with a blank note as unknown", () => {
    const view = getView({ blank: true });
    expect(view.suitIndex).toBeUndefined();
    expect(view.rank).toBeUndefined();
  });

  test("shows the one suit and rank that the holder learned by elimination", () => {
    const view = getCardView({
      gameState,
      cardState: {
        ...cardState,
        // The clues say a red or yellow 3 or 4, but the holder sees all of them except a yellow 4.
        possibleCardsFromClues: [
          [0, 3],
          [0, 4],
          [1, 3],
          [1, 4],
        ],
        possibleCardsForEmpathy: [[1, 4]],
      },
      cardIdentity: red1,
      note: BLANK_NOTE,
      variant: VARIANT,
      empathy: true,
      finished: false,
      realLifeMode: false,
    });
    expect(view).toMatchObject({
      suitIndex: undefined,
      rank: undefined,
      possibleSuitIndexes: [1],
      possibleRanks: [4],
    });
  });

  test("leaves out the one suit and rank that the clues say", () => {
    const view = getCardView({
      gameState,
      cardState: {
        ...cardState,
        possibleCardsFromClues: [[1, 4]],
        possibleCardsForEmpathy: [[1, 4]],
      },
      cardIdentity: red1,
      note: BLANK_NOTE,
      variant: VARIANT,
      empathy: true,
      finished: false,
      realLifeMode: false,
    });
    expect(view).toMatchObject({
      possibleSuitIndexes: [],
      possibleRanks: [],
    });
  });

  test("shows the trash badge outside of the empathy view", () => {
    const view = getCardView({
      gameState,
      cardState: {
        ...cardState,
        isKnownTrashFromEmpathy: true,
      },
      cardIdentity: red1,
      note: BLANK_NOTE,
      variant: VARIANT,
      empathy: false,
      finished: false,
      realLifeMode: false,
    });
    expect(view.trashIcon).toBe(true);
  });

  test("gives a border from a note to a card that does not show as clued", () => {
    expect(getView({ finessed: true }).noteBorder).toBe("finessed");
    expect(
      getView({
        clued: true,
        finessed: true,
      }),
    ).toMatchObject({
      clued: true,
      noteBorder: undefined,
    });
  });
});

describe("shouldFadeTrash", () => {
  const plain = {
    trash: true,
    markedTrash: false,
    clued: false,
    positivelyClued: false,
    note: {
      blank: false,
      chopMoved: false,
    },
    throwItInAHole: false,
  };

  test("fades trash that no clue touched", () => {
    expect(shouldFadeTrash(plain)).toBe(true);
  });

  test("keeps clued trash at full strength", () => {
    expect(
      shouldFadeTrash({
        ...plain,
        clued: true,
        positivelyClued: true,
      }),
    ).toBe(false);
  });

  test("fades a card marked as trash unless a clue touched it", () => {
    const marked = {
      ...plain,
      trash: false,
      markedTrash: true,
      clued: true,
    };
    expect(shouldFadeTrash(marked)).toBe(true);
    expect(
      shouldFadeTrash({
        ...marked,
        positivelyClued: true,
      }),
    ).toBe(false);
  });
});
