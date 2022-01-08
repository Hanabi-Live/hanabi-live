import { discard, play } from "../../../test/testActions";
import { getVariant } from "../data/gameData";
import { DEFAULT_VARIANT_NAME, MAX_CLUE_NUM } from "../types/constants";
import { gain } from "./clueTokens";

const discardAction = discard(0, 0, 0, 1, false);
const defaultVariant = getVariant(DEFAULT_VARIANT_NAME);
const throwItInAHoleVariant = getVariant("Throw It in a Hole (6 Suits)");

describe("gain", () => {
  test.each([...Array(8).keys()])(
    "adds a clue when there are %i clues",
    (n) => {
      const clueTokens = gain(discardAction, n, defaultVariant);
      expect(clueTokens).toBe(n + 1);
    },
  );

  test("does not add clues when maxed out", () => {
    const clueTokens = gain(discardAction, MAX_CLUE_NUM, defaultVariant);
    expect(clueTokens).toBe(MAX_CLUE_NUM);
  });

  test("does not add a clue when a stack is not finished", () => {
    const playAction = play(0, 0, 0, 5);
    const clueTokens = gain(playAction, 0, defaultVariant, false);
    expect(clueTokens).toBe(0);
  });

  test("adds a clue when a stack is finished", () => {
    const playAction = play(0, 0, 0, 5);
    const startingClueTokens = 0;
    const clueTokens = gain(playAction, 0, defaultVariant, true);
    expect(clueTokens).toBe(startingClueTokens + 1);
  });

  test("does not add a clue when a stack is finished in Throw It in a Hole variants", () => {
    const playAction = play(0, 0, 0, 5);
    const startingClueTokens = 0;
    const clueTokens = gain(
      playAction,
      startingClueTokens,
      throwItInAHoleVariant,
      true,
    );
    expect(clueTokens).toBe(startingClueTokens);
  });
});
