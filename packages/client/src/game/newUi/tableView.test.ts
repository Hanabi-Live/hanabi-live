import type {
  CardIdentity,
  CardNote,
  CardOrder,
  GameState,
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
import { parseNote } from "../reducers/notesReducer.ts";
import {
  BLANK_NOTE,
  getCardView,
  getHandDisplayOrder,
  getTouchedCards,
  getTurnWarning,
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
    expect(getView({}).noteMarks).toStrictEqual([]);
    expect(getView({ questionMark: true }).noteMarks).toStrictEqual([
      "questionMark",
    ]);
    expect(
      getView({
        needsFix: true,
        exclamationMark: true,
      }).noteMarks,
    ).toStrictEqual(["fix", "exclamationMark"]);
  });

  test("hides the marks of notes in a finished game", () => {
    expect(
      getView({ questionMark: true }, { finished: true }).noteMarks,
    ).toStrictEqual([]);
  });

  test("shows a card with a blank note as unknown", () => {
    const view = getView({ blank: true });
    expect(view.suitIndex).toBeUndefined();
    expect(view.rank).toBeUndefined();
  });

  /** The view of a card that its holder cannot see. */
  function getEmpathyView(
    state: Partial<typeof cardState>,
    options: Partial<Parameters<typeof getCardView>[0]> = {},
  ) {
    return getCardView({
      gameState,
      cardState: {
        ...cardState,
        ...state,
      },
      cardIdentity: red1,
      note: BLANK_NOTE,
      variant: VARIANT,
      empathy: true,
      finished: false,
      realLifeMode: false,
      ...options,
    });
  }

  // The clues say a red or yellow 3 or 4, but the holder sees all of them except a yellow 4.
  const learnedByElimination = {
    possibleCardsFromClues: [
      [0, 3],
      [0, 4],
      [1, 3],
      [1, 4],
    ],
    possibleCardsForEmpathy: [[1, 4]],
  } as const satisfies Partial<typeof cardState>;

  test("slashes the suits and ranks that seen cards rule out", () => {
    const view = getEmpathyView(learnedByElimination);
    expect(view).toMatchObject({
      suitIndex: undefined,
      rank: undefined,
      pips: {
        suits: [
          {
            suitIndex: 0,
            ruledOutBy: "seen",
          },
          {
            suitIndex: 1,
            ruledOutBy: undefined,
          },
        ],
        ranks: [
          {
            rank: 3,
            ruledOutBy: "seen",
          },
          {
            rank: 4,
            ruledOutBy: undefined,
          },
        ],
      },
    });
  });

  test("marks the suits and ranks that the note rules out", () => {
    // The clues say a red or yellow 3 or 4, and the note says a yellow 4 or a red 3.
    const { possibleCardsFromClues } = learnedByElimination;
    const view = getEmpathyView(
      {
        possibleCardsFromClues,
        possibleCardsForEmpathy: possibleCardsFromClues,
      },
      { note: parseNote(VARIANT, "y4, r3") },
    );
    expect(view.pips).toMatchObject({
      suits: [
        {
          suitIndex: 0,
          ruledOutBy: undefined,
        },
        {
          suitIndex: 1,
          ruledOutBy: undefined,
        },
      ],
      ranks: [
        {
          rank: 3,
          ruledOutBy: undefined,
        },
        {
          rank: 4,
          ruledOutBy: undefined,
        },
      ],
    });

    // The note says a yellow card, so the red pip is marked. It stays, so that the pips do not
    // move.
    expect(
      getEmpathyView(
        {
          possibleCardsFromClues,
          possibleCardsForEmpathy: possibleCardsFromClues,
        },
        { note: parseNote(VARIANT, "y") },
      ).pips?.suits,
    ).toMatchObject([
      {
        suitIndex: 0,
        ruledOutBy: "note",
      },
      {
        suitIndex: 1,
        ruledOutBy: undefined,
      },
    ]);

    // The holder sees every red 3, and the note rules out the red 4. The seen cards alone do not
    // rule out red, so the red pip has the note's mark.
    expect(
      getEmpathyView(
        {
          possibleCardsFromClues,
          possibleCardsForEmpathy: [
            [0, 4],
            [1, 3],
            [1, 4],
          ],
        },
        { note: parseNote(VARIANT, "y") },
      ).pips?.suits,
    ).toMatchObject([
      {
        suitIndex: 0,
        ruledOutBy: "note",
      },
      {
        suitIndex: 1,
        ruledOutBy: undefined,
      },
    ]);
  });

  test("marks the suits and ranks that a clue touched", () => {
    const view = getEmpathyView({
      possibleCardsFromClues: [
        [0, 3],
        [1, 3],
      ],
      possibleCardsForEmpathy: [
        [0, 3],
        [1, 3],
      ],
      positiveRankClues: [3],
    });
    expect(view.pips).toMatchObject({
      suits: [
        {
          suitIndex: 0,
          positive: false,
        },
        {
          suitIndex: 1,
          positive: false,
        },
      ],
      // The clue says the rank, so the face shows it.
      ranks: [],
    });
  });

  test("shows a bubble when the clues give the suit", () => {
    // Any red card. The holder sees every red 2.
    const possibleCardsFromClues = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
    ] as const;
    const view = getEmpathyView({
      possibleCardsFromClues,
      possibleCardsForEmpathy: possibleCardsFromClues.filter(
        ([, rank]) => rank !== 2,
      ),
      suitIndex: 0,
      suitDetermined: true,
    });
    expect(view.suitIndex).toBe(0);
    expect(view.pips?.bubble).toStrictEqual({
      suits: [
        {
          suitIndex: 0,
          ruledOutBy: undefined,
          positive: false,
          ranks: [1, 3, 4, 5],
          removed: [
            {
              rank: 2,
              by: "seen",
            },
          ],
        },
      ],
    });
  });

  test("shows the cards that separate suits and ranks cannot show in a bubble", () => {
    // Any red card, or a yellow 1. The holder sees every red 2.
    const possibleCardsFromClues = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 1],
    ] as const;
    const bubble = getEmpathyView({
      possibleCardsFromClues,
      possibleCardsForEmpathy: possibleCardsFromClues.filter(
        ([suitIndex, rank]) => !(suitIndex === 0 && rank === 2),
      ),
    }).pips?.bubble;
    expect(bubble).toStrictEqual({
      suits: [
        {
          suitIndex: 0,
          ruledOutBy: undefined,
          positive: false,
          ranks: [1, 3, 4, 5],
          removed: [
            {
              rank: 2,
              by: "seen",
            },
          ],
        },
        {
          suitIndex: 1,
          ruledOutBy: undefined,
          positive: false,
          ranks: [1],
          removed: [],
        },
      ],
    });
  });

  test("narrows the bubble to the identity in the note", () => {
    // Any red card, or a yellow 1. The holder sees every red 2.
    const possibleCardsFromClues = [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 1],
    ] as const;
    function getBubble(noteText: string) {
      return getEmpathyView(
        {
          possibleCardsFromClues,
          possibleCardsForEmpathy: possibleCardsFromClues.filter(
            ([suitIndex, rank]) => !(suitIndex === 0 && rank === 2),
          ),
        },
        { note: parseNote(VARIANT, noteText) },
      ).pips?.bubble;
    }

    // The yellow 1 keeps its row, so that the bubble shows that the note rules it out.
    expect(getBubble("r1, r3")).toMatchObject({
      suits: [
        {
          suitIndex: 0,
          ruledOutBy: undefined,
          ranks: [1, 3],
          removed: [
            {
              rank: 2,
              by: "seen",
            },
            {
              rank: 4,
              by: "note",
            },
            {
              rank: 5,
              by: "note",
            },
          ],
        },
        {
          suitIndex: 1,
          ruledOutBy: "note",
          ranks: [],
          removed: [
            {
              rank: 1,
              by: "note",
            },
          ],
        },
      ],
    });

    // The holder sees every red 2, so a note that says so is left out.
    expect(getBubble("r2")).toMatchObject({
      suits: [
        {
          suitIndex: 0,
          ranks: [1, 3, 4, 5],
          removed: [
            {
              rank: 2,
              by: "seen",
            },
          ],
        },
        {
          suitIndex: 1,
          ranks: [1],
          removed: [],
        },
      ],
    });
  });

  test("shows the revealed identity of a card in the viewer's own hand", () => {
    // The clues do not tell the holder what the card is, but the game later reveals it.
    expect(getEmpathyView({})).toMatchObject({
      suitIndex: undefined,
      rank: undefined,
    });
    expect(
      getEmpathyView(
        {},
        {
          empathyIncludesNotes: true,
          showsRevealedIdentity: true,
        },
      ),
    ).toMatchObject(red1);
  });

  test("hides what the holder knows in real life mode and on a blank card", () => {
    expect(
      getEmpathyView(learnedByElimination, { realLifeMode: true }).pips,
    ).toBeUndefined();

    const blank = getEmpathyView(learnedByElimination, {
      note: {
        ...BLANK_NOTE,
        blank: true,
      },
      empathyIncludesNotes: true,
    });
    expect(blank).toMatchObject({
      blank: true,
      pips: undefined,
    });
  });

  test("shows the card back in real life mode until the whole card is known", () => {
    const suitKnown = {
      suitIndex: 0 as SuitIndex,
      suitDetermined: true,
    };
    expect(getEmpathyView(suitKnown).suitIndex).toBe(0);
    expect(getEmpathyView(suitKnown, { realLifeMode: true })).toMatchObject({
      suitIndex: undefined,
      rank: undefined,
    });

    const red1Known = {
      ...suitKnown,
      rank: 1 as const,
      rankDetermined: true,
    };
    expect(getEmpathyView(red1Known, { realLifeMode: true })).toMatchObject({
      suitIndex: 0,
      rank: 1,
    });
  });

  test("shows the double discard mark only with the H-Group conventions", () => {
    const inDoubleDiscard = { inDoubleDiscard: true };
    expect(getEmpathyView(inDoubleDiscard).doubleDiscard).toBe(false);
    expect(
      getEmpathyView(inDoubleDiscard, { hGroupConventions: true })
        .doubleDiscard,
    ).toBe(true);
    expect(
      getEmpathyView(
        {
          ...inDoubleDiscard,
          numPositiveClues: 1,
        },
        { hGroupConventions: true },
      ).doubleDiscard,
    ).toBe(false);
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
    expect(view.pips).toBeUndefined();
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
    markedFix: false,
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

  test("never fades a card that shows the wrench", () => {
    expect(
      shouldFadeTrash({
        ...plain,
        markedFix: true,
      }),
    ).toBe(false);
    expect(
      shouldFadeTrash({
        ...plain,
        trash: false,
        markedTrash: true,
        markedFix: true,
      }),
    ).toBe(false);
  });
});

describe("getTurnWarning", () => {
  const initial = getInitialGameState(getDefaultMetadata(2));
  const card = getInitialCardState(0 as CardOrder, VARIANT, 2);

  /** The current player holds two cards, and the team has some clues. */
  function withHand(
    numClued: number,
    changes: Partial<GameState> = {},
  ): GameState {
    return {
      ...initial,
      clueTokens: 4,
      hands: [[0, 1], []] as unknown as GameState["hands"],
      deck: [0, 1].map((order) => ({
        ...card,
        order: order as CardOrder,
        numPositiveClues: order < numClued ? 1 : 0,
      })),
      ...changes,
    };
  }

  test("warns when every card in the hand is clued", () => {
    expect(getTurnWarning(withHand(2), VARIANT)).toBe("locked");
    expect(getTurnWarning(withHand(1), VARIANT)).toBeUndefined();
  });

  test("warns of a double discard", () => {
    const state = withHand(1);
    expect(
      getTurnWarning(
        {
          ...state,
          stats: {
            ...state.stats,
            doubleDiscardCard: 5 as CardOrder,
          },
        },
        VARIANT,
      ),
    ).toBe("doubleDiscard");
  });

  test("leaves the warning to the clue tokens when the team cannot clue or discard", () => {
    expect(
      getTurnWarning(withHand(2, { clueTokens: 0 }), VARIANT),
    ).toBeUndefined();
    expect(
      getTurnWarning(withHand(2, { clueTokens: initial.clueTokens }), VARIANT),
    ).toBeUndefined();
  });
});
