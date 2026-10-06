/* eslint-disable unicorn/no-null */

import { describe, expect, test } from "@jest/globals";
import {
  PipState,
  getCardBorderPresentation,
  getCardIdentityToShow,
  getCardPipPresentation,
} from "./cardPresentation";
import { getDefaultVariant } from "./gameData";
import type { CardIdentity } from "./interfaces/CardIdentity";
import type { CardNote } from "./interfaces/CardNote";
import type { CardState } from "./interfaces/CardState";
import { getInitialCardState } from "./reducers/initialStates/initialCardState";
import type { CardOrder } from "./types/CardOrder";

const variant = getDefaultVariant();
const baseCard = getInitialCardState(0 as CardOrder, variant, 2);
const unknownIdentity: CardIdentity = { suitIndex: null, rank: null };
const emptyNote: CardNote = {
  possibilities: [],
  knownTrash: false,
  needsFix: false,
  questionMark: false,
  exclamationMark: false,
  chopMoved: false,
  finessed: false,
  discardPermission: false,
  blank: false,
  unclued: false,
  clued: false,
  text: "",
};

function getIdentity(
  state: CardState,
  note: CardNote = emptyNote,
  cardIdentity: CardIdentity = unknownIdentity,
) {
  return getCardIdentityToShow({
    cardIdentity,
    state,
    note,
    empathy: false,
    isStackBase: false,
    finished: false,
  });
}

describe("card presentation", () => {
  describe("visible identity", () => {
    test("shows a known suit while leaving an unknown rank hidden", () => {
      expect(
        getIdentity(baseCard, emptyNote, { suitIndex: 1, rank: null }),
      ).toEqual({ suitIndex: 1, rank: null });
    });

    test("uses note possibilities when they determine a suit or rank", () => {
      const suitNote: CardNote = {
        ...emptyNote,
        possibilities: [
          [2, 1],
          [2, 2],
        ],
      };
      expect(getIdentity(baseCard, suitNote)).toEqual({
        suitIndex: 2,
        rank: null,
      });

      const rankNote: CardNote = {
        ...emptyNote,
        possibilities: [
          [0, 3],
          [1, 3],
        ],
      };
      expect(getIdentity(baseCard, rankNote)).toEqual({
        suitIndex: null,
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
    });
  });
});
