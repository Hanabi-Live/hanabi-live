// While the post-clue empathy checkbox is checked, shows how the target's hand would look to them
// after the clue that the player has selected.

import type {
  ActionClue,
  CardOrder,
  Clue,
  MsgClue,
  PlayerIndex,
} from "@hanabi-live/game";
import { cardsReducer } from "@hanabi-live/game";
import type { HanabiCard } from "./HanabiCard.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";
import { colorToColorIndex } from "./convert.ts";

interface PotentialClue {
  target: PlayerIndex;
  clue: Clue;
  touchedCards: readonly CardOrder[];
}

let enabled = false;
let potentialClue: PotentialClue | undefined;
let previewedCards: readonly HanabiCard[] = [];

/** Records the clue that the player selected, or undefined when there is none. */
export function setPotentialClue(clue: PotentialClue | undefined): void {
  hide();
  potentialClue = clue;
  if (enabled) {
    show();
  }
}

/** Checks or unchecks the post-clue empathy checkbox. */
export function toggle(): void {
  setEnabled(!enabled);
}

/** Unchecks the post-clue empathy checkbox at the start of each turn. */
export function reset(): void {
  setEnabled(false);
}

function setEnabled(newEnabled: boolean) {
  enabled = newEnabled;
  globals.elements.postClueEmpathyCheckbox?.setChecked(enabled);
  if (enabled) {
    show();
  } else {
    hide();
  }
}

function show() {
  hide();
  if (potentialClue === undefined) {
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
    playerIndex: visibleState.turn.currentPlayerIndex,
    orders: touchedCards,
    receiverIndex: target,
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
    card.setCluePreview(deck[card.order]);
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
    card.setCluePreview(undefined);
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
        : {
            type: "color",
            color: colorIndex,
          };
    }

    case "rank": {
      return {
        type: "rank",
        rank: clue.value,
      };
    }
  }
}
