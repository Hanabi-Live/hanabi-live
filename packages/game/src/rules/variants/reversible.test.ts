import { START_CARD_RANK } from "../../constants";
import { StackDirection } from "../../enums/StackDirection";
import { getVariant } from "../../gameData";
import type { Rank } from "../../types/Rank";
import { reversibleIsCardDead } from "./reversible";

describe("upOrDownDeadCardsDirectionUndecided", () => {
  test("Handles discarded 2 and 4", () => {
    const variant = getVariant("Up or Down (5 Suits)");
    const allDiscardedSet: Set<Rank> = new Set<Rank>([2, 4]);
    // eslint-disable-next-line func-style
    const isDead = (rank: number) =>
      reversibleIsCardDead(
        rank as Rank,
        variant,
        allDiscardedSet,
        StackDirection.Undecided,
      );
    expect(isDead(3)).toBe(true);
    expect(isDead(1)).toBe(false);
    expect(isDead(5)).toBe(false);
    expect(isDead(START_CARD_RANK)).toBe(false);
  });

  test("Handles discarded 3 and 5", () => {
    const variant = getVariant("Up or Down (5 Suits)");
    const allDiscardedSet: Set<Rank> = new Set<Rank>([START_CARD_RANK, 3, 5]);
    // eslint-disable-next-line func-style
    const isDead = (rank: number) =>
      reversibleIsCardDead(
        rank as Rank,
        variant,
        allDiscardedSet,
        StackDirection.Undecided,
      );
    expect(isDead(4)).toBe(true);
    expect(isDead(1)).toBe(false);
    expect(isDead(2)).toBe(false);
  });
});
