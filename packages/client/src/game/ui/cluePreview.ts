// Shows how a hand would look to its holder after a clue that the player is considering giving,
// while the pointer is on the "Give Clue" button.

import type {
  ActionClue,
  CardOrder,
  Clue,
  MsgClue,
  PlayerIndex,
} from "@hanabi-live/game";
import { ClueType, cardsReducer } from "@hanabi-live/game";
import type { HanabiCard } from "./HanabiCard";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import { colorToColorIndex } from "./convert";

interface PotentialClue {
  target: PlayerIndex;
  clue: Clue;
  touchedCards: readonly CardOrder[];
}

let potentialClue: PotentialClue | null = null;
let previewedCards: readonly HanabiCard[] = [];

/** Records the clue that the player selected, or null when there is none. */
export function setPotentialClue(clue: PotentialClue | null): void {
  hide();
  potentialClue = clue;
}

/** Shows the hand of the selected clue's target as they would see it after the clue. */
export function show(): void {
  hide();
  if (potentialClue === null) {
    return;
  }
  const { target, clue, touchedCards } = potentialClue;

  const { visibleState } = globals.state;
  const cardLayout = globals.elements.playerHands[target];
  const msgClue = clueToMsgClue(clue);
  if (
    visibleState === null
    || visibleState.turn.currentPlayerIndex === null
    || cardLayout === undefined
    || msgClue === undefined
  ) {
    return;
  }

  const action: ActionClue = {
    type: "clue",
    clue: msgClue,
    giver: visibleState.turn.currentPlayerIndex,
    list: touchedCards,
    target,
    ignoreNegative: false,
  };
  const deck = cardsReducer(
    visibleState.deck,
    action,
    visibleState,
    globals.metadata,
  );

  previewedCards = cardLayout.children.map(
    (child) => (child as unknown as LayoutChild).card,
  );
  for (const card of previewedCards) {
    card.setCluePreview(deck[card.order] ?? null);
  }

  globals.layers.card.batchDraw();
}

export function isShown(): boolean {
  return previewedCards.length > 0;
}

export function hide(): void {
  if (previewedCards.length === 0) {
    return;
  }

  for (const card of previewedCards) {
    card.setCluePreview(null);
  }
  previewedCards = [];

  globals.layers.card.batchDraw();
}

function clueToMsgClue(clue: Clue): MsgClue | undefined {
  switch (clue.type) {
    case ClueType.Color: {
      const colorIndex = colorToColorIndex(clue.value, globals.variant);
      return colorIndex === undefined
        ? undefined
        : { type: ClueType.Color, value: colorIndex };
    }

    case ClueType.Rank: {
      return { type: ClueType.Rank, value: clue.value };
    }
  }
}
