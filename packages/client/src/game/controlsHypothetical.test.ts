import { describe, expect, test } from "vitest";
import { canToggleDrawnCards } from "./controlsHypothetical.ts";
import type { State } from "./types/State.ts";

/** A hypothetical where card 5 was drawn, which the first player may still hold. */
function hypotheticalState({
  shared,
  inHand,
  clued,
}: {
  shared: boolean;
  inHand: boolean;
  clued: boolean;
}): State {
  const hypothetical = {
    drawnCardsInHypothetical: [5],
    ongoing: {
      hands: [inHand ? [5] : [], []],
      deck: {
        5: {
          numPositiveClues: clued ? 1 : 0,
        },
      },
    },
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

  test("stays on in a shared hypothetical once a drawn card is played or clued", () => {
    expect(
      canToggleDrawnCards(
        hypotheticalState({
          shared: true,
          inHand: false,
          clued: false,
        }),
      ),
    ).toBe(false);
    expect(
      canToggleDrawnCards(
        hypotheticalState({
          shared: true,
          inHand: true,
          clued: true,
        }),
      ),
    ).toBe(false);
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
