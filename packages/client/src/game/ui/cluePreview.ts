// While the "Show Post-Clue Empathy" button is on, shows how the target's hand would look to them
// after the clue that the player has selected.

import type {
  ActionClue,
  CardOrder,
  Clue,
  MsgClue,
  PlayerIndex,
} from "@hanabi-live/game";
import { cardsReducer } from "@hanabi-live/game";
import type { HanabiCard } from "./HanabiCard";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import { colorToColorIndex } from "./convert";

interface PotentialClue {
  target: PlayerIndex;
  clue: Clue;
  touchedCards: readonly CardOrder[];
}

let enabled = false;
let potentialClue: PotentialClue | null = null;
let previewedCards: readonly HanabiCard[] = [];

/** Records the clue that the player selected, or null when there is none. */
export function setPotentialClue(clue: PotentialClue | null): void {
  hide();
  potentialClue = clue;
  if (enabled) {
    show();
  }
}

/** Turns the "Show Post-Clue Empathy" button on or off. */
export function toggle(): void {
  setEnabled(!enabled);
}

/** Turns the "Show Post-Clue Empathy" button off at the start of each turn. */
export function reset(): void {
  setEnabled(false);
}

function setEnabled(newEnabled: boolean) {
  enabled = newEnabled;
  globals.elements.postClueEmpathyButton?.setPressed(enabled);
  if (enabled) {
    show();
  } else {
    hide();
  }
}

function show() {
  hide();
  if (potentialClue === null) {
    return;
  }
  const { target, clue, touchedCards } = potentialClue;

  const { visibleState } = globals.state;
  const cardLayout = globals.elements.playerHands[target];
  const msgClue = clueToMsgClue(clue);
  if (
    visibleState === undefined
    || visibleState.turn.currentPlayerIndex === undefined
    || cardLayout === undefined
    || msgClue === undefined
  ) {
    return;
  }

  const action: ActionClue = {
    type: "clue",
    clue: msgClue,
    giver: visibleState.turn.currentPlayerIndex,
    orders: touchedCards,
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

/** Restores the normal view of the hand, but leaves the button on. */
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
    case "color": {
      const colorIndex = colorToColorIndex(clue.value, globals.variant);
      return colorIndex === undefined
        ? undefined
        : { type: "color", value: colorIndex };
    }

    case "rank": {
      return { type: "rank", value: clue.value };
    }
  }
}
