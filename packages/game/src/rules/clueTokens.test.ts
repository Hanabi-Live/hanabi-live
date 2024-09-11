import { eRange } from "complete-common";
import { MAX_CLUE_NUM } from "../constants";
import { getDefaultVariant, getVariant } from "../gameData";
import { discard, play } from "../testActions";
import { getNewClueTokensAfterAction } from "./clueTokens";

const DISCARD_ACTION = discard(0, 0, 0, 1, false);
const DEFAULT_VARIANT = getDefaultVariant();
const THROW_IT_IN_A_HOLE_VARIANT = getVariant("Throw It in a Hole (6 Suits)");

describe("gain", () => {
  test.each([...eRange(MAX_CLUE_NUM)])(
    "adds a clue when there are %i clues",
    (n) => {
      const clueTokens = getNewClueTokensAfterAction(
        DISCARD_ACTION,
        n,
        DEFAULT_VARIANT,
      );
      expect(clueTokens).toBe(n + 1);
    },
  );

  test("does not add clues when maxed out", () => {
    const clueTokens = getNewClueTokensAfterAction(
      DISCARD_ACTION,
      MAX_CLUE_NUM,
      DEFAULT_VARIANT,
    );
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });

  test("does not add a clue when a stack is not finished", () => {
    const playAction = play(0, 0, 0, 5);
    const clueTokens = getNewClueTokensAfterAction(
      playAction,
      0,
      DEFAULT_VARIANT,
      false,
    );
    expect(clueTokens).toBe(0);
  });

  test("adds a clue when a stack is finished", () => {
    const playAction = play(0, 0, 0, 5);
    const startingClueTokens = 0;
    const clueTokens = getNewClueTokensAfterAction(
      playAction,
      0,
      DEFAULT_VARIANT,
      true,
    );
    expect(clueTokens).toBe(startingClueTokens + 1);
  });

  test("does not add a clue when a stack is finished in Throw It in a Hole variants", () => {
    const playAction = play(0, 0, 0, 5);
    const startingClueTokens = 0;
    const clueTokens = getNewClueTokensAfterAction(
      playAction,
      startingClueTokens,
      THROW_IT_IN_A_HOLE_VARIANT,
      true,
    );
    expect(clueTokens).toBe(startingClueTokens);
  });
});
