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

vi.mock("./UIGlobals", () => ({ globals: {} }));
const { globals } = await import("./UIGlobals");
const cluePreview = await import("./cluePreview");

const RED_ONE = 0 as CardOrder;
const BLUE_TWO = 1 as CardOrder;

describe("clue preview", () => {
  test("shows the target's hand with the clue applied, then restores it", () => {
    const metadata = getDefaultMetadata(2);
    const variant = getDefaultVariant();
    let gameState: GameState = getInitialGameStateTest(metadata);
    for (const action of [draw(1, RED_ONE, 0, 1), draw(1, BLUE_TWO, 3, 2)]) {
      gameState = gameReducer(
        gameState,
        action,
        true,
        false,
        false,
        false,
        metadata,
      );
    }
    gameState = {
      ...gameState,
      turn: { ...gameState.turn, currentPlayerIndex: 0 },
    };

    const cards = [RED_ONE, BLUE_TWO].map((order) => ({
      order,
      setCluePreview: vi.fn<(state: CardState | null) => void>(),
    }));
    Object.assign(globals, {
      metadata,
      variant,
      state: { visibleState: gameState },
      elements: {
        playerHands: [
          { children: [] },
          { children: cards.map((card) => ({ card })) },
        ],
      },
      layers: { card: { batchDraw: vi.fn() } },
    });

    cluePreview.show(1, newColorClue(variant.clueColors[0]!), [RED_ONE]);

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

    cluePreview.hide();

    for (const card of cards) {
      expect(card.setCluePreview).toHaveBeenLastCalledWith(null);
    }
    expect(cluePreview.isShown()).toBe(false);
  });
});
