import { describe, expect, test } from "vitest";
import {
  canToggleDrawnCards,
  getDrawnCardsLockTurn,
} from "./controlsHypothetical.ts";
import type { State } from "./types/State.ts";

/**
 * A hypothetical that started on turn 4 (counted from 1). Card 5 was drawn on that turn into the
 * first player's hand. On turn 5, it may have been played or clued.
 */
function hypotheticalState({
  shared,
  inHand,
  clued,
}: {
  shared: boolean;
  inHand: boolean;
  clued: boolean;
}): State {
  const drawn = {
    turn: {
      turnNum: 4,
    },
    hands: [[5], []],
    deck: {
      5: {
        numPositiveClues: 0,
      },
    },
  };
  const ongoing = {
    turn: {
      turnNum: 5,
    },
    hands: [inHand ? [5] : [], []],
    deck: {
      5: {
        numPositiveClues: clued ? 1 : 0,
      },
    },
  };
  const hypothetical = {
    drawnCardsInHypothetical: [5],
    ongoing,
    states: [
      {
        turn: {
          turnNum: 3,
        },
        hands: [[], []],
        deck: {},
      },
      drawn,
      ongoing,
    ],
  };
  return {
    replay: shared
      ? {
          hypothetical,
          ownHypothetical: undefined,
          shared: {
            amLeader: true,
            hypothetical,
          },
        }
      : {
          hypothetical,
          ownHypothetical: hypothetical,
          shared: undefined,
        },
  } as unknown as State;
}

describe("showing the drawn cards of a hypothetical", () => {
  test("can be toggled while the drawn cards are in a hand and not clued", () => {
    expect(
      canToggleDrawnCards(
        hypotheticalState({
          shared: true,
          inHand: true,
          clued: false,
        }),
      ),
    ).toBe(true);
  });

  test("is locked in a shared hypothetical once a drawn card is played or clued", () => {
    for (const state of [
      hypotheticalState({
        shared: true,
        inHand: false,
        clued: false,
      }),
      hypotheticalState({
        shared: true,
        inHand: true,
        clued: true,
      }),
    ]) {
      expect(canToggleDrawnCards(state)).toBe(false);
      expect(getDrawnCardsLockTurn(state)).toBe(5);
    }
  });

  test("can always be toggled in our own hypothetical", () => {
    expect(
      canToggleDrawnCards(
        hypotheticalState({
          shared: false,
          inHand: false,
          clued: true,
        }),
      ),
    ).toBe(true);
  });
});
