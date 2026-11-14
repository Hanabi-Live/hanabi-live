import type { CardOrder, CardState, GameState } from "@hanabi-live/game";
import {
  draw,
  gameReducer,
  getDefaultMetadata,
  getDefaultVariant,
  getInitialGameStateTest,
  newColorClue,
} from "@hanabi-live/game";
import { describe, expect, test, vi } from "vitest";

vi.mock("./UiGlobals.ts", () => ({
  globals: {},
}));
const { globals } = await import("./UiGlobals.ts");
const cluePreview = await import("./cluePreview.ts");

const RED_ONE = 0 as CardOrder;
const BLUE_TWO = 1 as CardOrder;

describe("clue preview", () => {
  test("shows the target's hand after the selected clue while the button is on", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    let gameState: GameState = getInitialGameStateTest(metadata);
    for (const action of [draw(1, RED_ONE, 0, 1), draw(1, BLUE_TWO, 3, 2)]) {
      gameState = gameReducer(gameState, action, "seat", metadata);
    }
    gameState = {
      ...gameState,
      turn: {
        ...gameState.turn,
        currentPlayerIndex: 0,
      },
    };

    const postClueEmpathyCheckbox = {
      setChecked: vi.fn<(checked: boolean) => void>(),
    };
    const cards = [RED_ONE, BLUE_TWO].map((order) => ({
      order,
      setCluePreview: vi.fn<(state: CardState | undefined) => void>(),
    }));
    Object.assign(globals, {
      metadata,
      variant,
      state: {
        visibleState: gameState,
      },
      elements: {
        postClueEmpathyCheckbox,
        playerHands: [
          { children: [] },
          { children: cards.map((card) => ({ card })) },
        ],
      },
      layers: {
        card: {
          batchDraw: vi.fn(),
        },
      },
    });

    // Selecting a clue does not change the hand while the button is off.
    cluePreview.setPotentialClue({
      target: 1,
      clue: newColorClue(variant.clueColors[0]!),
      touchedCards: [RED_ONE],
    });
    expect(cluePreview.isShown()).toBe(false);

    cluePreview.toggle();

    expect(postClueEmpathyCheckbox.setChecked).toHaveBeenLastCalledWith(true);
    const [redOne, blueTwo] = cards.map(
      (card) => card.setCluePreview.mock.lastCall?.[0],
    );
    expect(redOne?.numPositiveClues).toBe(1);
    expect(redOne?.possibleCardsFromClues.every(([suit]) => suit === 0)).toBe(
      true,
    );
    expect(blueTwo?.numPositiveClues).toBe(0);
    expect(blueTwo?.possibleCardsFromClues.some(([suit]) => suit === 0)).toBe(
      false,
    );
    expect(cluePreview.isShown()).toBe(true);

    // Deselecting the clue restores the hand, but leaves the button on.
    cluePreview.setPotentialClue(undefined);
    for (const card of cards) {
      expect(card.setCluePreview).toHaveBeenLastCalledWith(undefined);
    }
    expect(cluePreview.isShown()).toBe(false);

    // While the button is on, selecting a clue shows it at once.
    cluePreview.setPotentialClue({
      target: 1,
      clue: newColorClue(variant.clueColors[0]!),
      touchedCards: [RED_ONE],
    });
    expect(cluePreview.isShown()).toBe(true);

    // A new turn turns the button off and restores the hand.
    cluePreview.reset();
    expect(postClueEmpathyCheckbox.setChecked).toHaveBeenLastCalledWith(false);
    for (const card of cards) {
      expect(card.setCluePreview).toHaveBeenLastCalledWith(undefined);
    }
    expect(cluePreview.isShown()).toBe(false);
  });
});
