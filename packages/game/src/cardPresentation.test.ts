import { describe, expect, test } from "bun:test";
import {
  PipState,
  getCardBorderPresentation,
  getCardIdentityToShow,
  getCardPipPresentation,
  isCardIdentityFromNote,
} from "./cardPresentation.ts";
import { getDefaultVariant } from "./gameData.ts";
import type { CardIdentity } from "./interfaces/CardIdentity.ts";
import type { CardNote } from "./interfaces/CardNote.ts";
import type { CardState } from "./interfaces/CardState.ts";
import { getInitialCardState } from "./reducers/initialStates/initialCardState.ts";
import type { CardOrder } from "./types/CardOrder.ts";
import type { SuitIndex } from "./types/SuitIndex.ts";
import type { SuitRankTuple } from "./types/SuitRankTuple.ts";

const variant = getDefaultVariant();
const baseCard = getInitialCardState(0 as CardOrder, variant, 2);
const unknownIdentity: CardIdentity = { suitIndex: undefined, rank: undefined };
const emptyNote: CardNote = {
  possibilities: [],
  knownTrash: false,
  needsFix: false,
  questionMark: false,
  exclamationMark: false,
  spook: false,
  chopMoved: false,
  finessed: false,
  discardPermission: false,
  blank: false,
  unclued: false,
  clued: false,
  text: "",
};

function getIdentity(
  note: CardNote = emptyNote,
  cardIdentity: CardIdentity = unknownIdentity,
) {
  return getCardIdentityToShow({
    cardIdentity,
    state: baseCard,
    note,
    empathy: false,
    isStackBase: false,
    finished: false,
  });
}

describe("card presentation", () => {
  describe("visible identity", () => {
    test("shows a known suit while leaving an unknown rank hidden", () => {
      expect(getIdentity(emptyNote, { suitIndex: 1, rank: undefined })).toEqual(
        {
          suitIndex: 1,
          rank: undefined,
        },
      );
    });

    test("uses note possibilities when they determine a suit or rank", () => {
      const suitNote: CardNote = {
        ...emptyNote,
        possibilities: [
          [2, 1],
          [2, 2],
        ],
      };
      expect(getIdentity(suitNote)).toEqual({
        suitIndex: 2,
        rank: undefined,
      });

      const rankNote: CardNote = {
        ...emptyNote,
        possibilities: [
          [0, 3],
          [1, 3],
        ],
      };
      expect(getIdentity(rankNote)).toEqual({
        suitIndex: undefined,
        rank: 3,
      });
    });

    test("uses determined state in empathy mode", () => {
      const state: CardState = {
        ...baseCard,
        suitIndex: 3,
        rank: 4,
        suitDetermined: true,
        rankDetermined: true,
      };

      expect(
        getCardIdentityToShow({
          cardIdentity: unknownIdentity,
          state,
          note: emptyNote,
          empathy: true,
          isStackBase: false,
          finished: false,
        }),
      ).toEqual({ suitIndex: 3, rank: 4 });
    });

    describe("identity from a note", () => {
      const options = {
        cardIdentity: unknownIdentity,
        state: baseCard,
        empathy: false,
        isStackBase: false,
        finished: false,
      };
      const red3Note: CardNote = { ...emptyNote, possibilities: [[0, 3]] };

      test("is set when the note fills in an unknown suit or rank", () => {
        expect(isCardIdentityFromNote({ ...options, note: red3Note })).toBe(
          true,
        );
      });

      test("is not set when the note does not change the card face", () => {
        expect(isCardIdentityFromNote({ ...options, note: emptyNote })).toBe(
          false,
        );
        expect(
          isCardIdentityFromNote({
            ...options,
            cardIdentity: { suitIndex: 0, rank: 3 },
            note: red3Note,
          }),
        ).toBe(false);
        expect(
          isCardIdentityFromNote({ ...options, empathy: true, note: red3Note }),
        ).toBe(false);

        // The clues already show the rank that the note names.
        const cluedThree: CardState = {
          ...baseCard,
          possibleCardsFromClues: [
            [0, 3],
            [1, 3],
          ],
        };
        const threeNote: CardNote = {
          ...emptyNote,
          possibilities: [
            [0, 3],
            [1, 3],
          ],
        };
        expect(
          isCardIdentityFromNote({
            ...options,
            state: cluedThree,
            note: threeNote,
          }),
        ).toBe(false);
      });
    });
  });

  describe("borders", () => {
    test("does not treat a negative clue application as a clued card", () => {
      const state: CardState = {
        ...baseCard,
        hasClueApplied: true,
        numPositiveClues: 0,
      };

      expect(getCardBorderPresentation(state, emptyNote, false).clued).toBe(
        false,
      );
    });

    test("shows the clue border for a positive clue", () => {
      const state: CardState = {
        ...baseCard,
        hasClueApplied: true,
        numPositiveClues: 1,
      };

      expect(getCardBorderPresentation(state, emptyNote, false).clued).toBe(
        true,
      );
    });

    test("preserves clue, finesse, discard permission, and chop-move precedence", () => {
      const finessed = { ...emptyNote, finessed: true };
      expect(getCardBorderPresentation(baseCard, finessed, false)).toEqual({
        clued: false,
        chopMoved: false,
        finessed: true,
        discardPermission: false,
      });

      const discardAndChop = {
        ...emptyNote,
        discardPermission: true,
        chopMoved: true,
      };
      expect(
        getCardBorderPresentation(baseCard, discardAndChop, false),
      ).toEqual({
        clued: false,
        chopMoved: false,
        finessed: false,
        discardPermission: true,
      });

      const cluedAndFinessed = {
        ...emptyNote,
        clued: true,
        finessed: true,
      };
      expect(
        getCardBorderPresentation(baseCard, cluedAndFinessed, false),
      ).toEqual({
        clued: true,
        chopMoved: false,
        finessed: false,
        discardPermission: false,
      });
    });

    test("hides convention borders after the game finishes", () => {
      const note = {
        ...emptyNote,
        finessed: true,
        discardPermission: true,
        chopMoved: true,
      };

      expect(getCardBorderPresentation(baseCard, note, true)).toEqual({
        clued: false,
        chopMoved: false,
        finessed: false,
        discardPermission: false,
      });
    });
  });

  describe("knowledge pips", () => {
    test("distinguishes visible, eliminated, hidden, and positive pips", () => {
      const positiveColor = variant.clueColors[1];
      expect(positiveColor).toBeDefined();
      if (positiveColor === undefined) {
        return;
      }

      const state: CardState = {
        ...baseCard,
        possibleCardsFromClues: [
          [0, 1],
          [1, 1],
        ],
        possibleCards: [[1, 1]],
        positiveColorClues: [positiveColor],
        positiveRankClues: [1],
      };
      const presentation = getCardPipPresentation(
        variant,
        state,
        emptyNote,
        false,
      );

      expect(presentation.suitPips[0]).toMatchObject({
        state: PipState.Eliminated,
        positive: false,
      });
      expect(presentation.suitPips[1]).toMatchObject({
        state: PipState.Visible,
        positive: true,
      });
      expect(presentation.suitPips[2]).toMatchObject({
        state: PipState.Hidden,
        positive: false,
      });
      expect(presentation.rankPips.find((pip) => pip.rank === 1)).toMatchObject(
        {
          state: PipState.Visible,
          positive: true,
        },
      );
      expect(presentation.possibilityRows).toBeUndefined();
    });

    test("groups suits into rows when the pips cannot show the possible cards", () => {
      // A red or blue 3, or any green card (other than the green 5, which is visible elsewhere).
      const greenCards: SuitRankTuple[] = [
        [2, 1],
        [2, 2],
        [2, 3],
        [2, 4],
        [2, 5],
      ];
      const state: CardState = {
        ...baseCard,
        possibleCardsFromClues: [[0, 3], [1, 3], ...greenCards],
        possibleCards: [[0, 3], [1, 3], ...greenCards.slice(0, -1)],
        positiveRankClues: [3],
      };
      const presentation = getCardPipPresentation(
        variant,
        state,
        emptyNote,
        false,
      );

      const rows = presentation.possibilityRows?.map((row) => ({
        suits: row.suitPips.map((suitPip) => suitPip.suitIndex),
        ranks: row.rankPips.map((rankPip) => rankPip.state),
      }));
      const { Hidden, Eliminated, Visible } = PipState;
      expect(rows).toEqual([
        { suits: [0, 1], ranks: [Hidden, Hidden, Visible, Hidden, Hidden] },
        {
          suits: [2],
          ranks: [Visible, Visible, Visible, Visible, Eliminated],
        },
      ]);
      expect(
        presentation.possibilityRows?.[0]?.rankPips[2]?.positive,
      ).toBeTrue();
    });

    test("shows only the ranks that a note allows in each row", () => {
      // The note "2,b" allows any 2 or any blue card. Both green 2s are visible elsewhere.
      const allCards: SuitRankTuple[] = variant.suits.flatMap((_, suitIndex) =>
        variant.ranks.map((rank): SuitRankTuple => [
          suitIndex as SuitIndex,
          rank,
        ]),
      );
      const note: CardNote = {
        ...emptyNote,
        possibilities: allCards.filter(
          ([suitIndex, rank]) => suitIndex === 3 || rank === 2,
        ),
      };
      const state: CardState = {
        ...baseCard,
        possibleCardsFromClues: allCards,
        possibleCards: allCards.filter(
          ([suitIndex, rank]) => suitIndex !== 2 || rank !== 2,
        ),
      };
      const presentation = getCardPipPresentation(variant, state, note, false);

      const rows = presentation.possibilityRows?.map((row) => ({
        suits: row.suitPips.map((suitPip) => [
          suitPip.suitIndex,
          suitPip.state,
        ]),
        ranks: row.rankPips.map((rankPip) => rankPip.state),
      }));
      const { Hidden, Eliminated, Visible } = PipState;
      expect(rows).toEqual([
        {
          suits: [
            [0, Visible],
            [1, Visible],
            [2, Eliminated],
            [4, Visible],
          ],
          ranks: [Hidden, Visible, Hidden, Hidden, Hidden],
        },
        {
          suits: [[3, Visible]],
          ranks: [Visible, Visible, Visible, Visible, Visible],
        },
      ]);
    });

    test("puts a ruled-out suit in the row of suits that the clues allowed the same ranks", () => {
      // A red, yellow, green, or purple 5, or a blue 1 or 5. The red 5 and the yellow 5 are visible
      // elsewhere.
      const state: CardState = {
        ...baseCard,
        possibleCardsFromClues: [
          [0, 5],
          [1, 5],
          [2, 5],
          [3, 1],
          [3, 5],
          [4, 5],
        ],
        possibleCards: [
          [2, 5],
          [3, 1],
          [3, 5],
          [4, 5],
        ],
      };
      const presentation = getCardPipPresentation(
        variant,
        state,
        emptyNote,
        false,
      );

      const rows = presentation.possibilityRows?.map((row) => ({
        suits: row.suitPips.map((suitPip) => [
          suitPip.suitIndex,
          suitPip.state,
        ]),
        ranks: row.rankPips.map((rankPip) => rankPip.state),
      }));
      const { Hidden, Eliminated, Visible } = PipState;
      expect(rows).toEqual([
        {
          suits: [
            [0, Eliminated],
            [1, Eliminated],
            [2, Visible],
            [4, Visible],
          ],
          ranks: [Hidden, Hidden, Hidden, Hidden, Visible],
        },
        {
          suits: [[3, Visible]],
          ranks: [Visible, Hidden, Hidden, Hidden, Visible],
        },
      ]);
    });
  });
});
