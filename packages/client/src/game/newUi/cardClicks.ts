// What a click on a card does on the redesigned game screen, as on the classic screen (see
// "ui/HanabiCardClick.ts" and "ui/HanabiCardClickSpeedrun.ts"). These functions only decide; the
// game screen carries out the result.

import type {
  CardIdentity,
  CardOrder,
  Clue,
  PlayerIndex,
  Variant,
} from "@hanabi-live/game";
import {
  START_CARD_RANK,
  getClueCost,
  getTotalCardsInDeck,
  isAtMaxClueTokens,
  isCardDiscarded,
  isCardPlayed,
  newColorClue,
  newRankClue,
} from "@hanabi-live/game";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import { isClueTypeAllowed } from "../isClueAllowed.ts";
import {
  getColorForSpeedrunClue,
  getRankForSpeedrunClue,
} from "../speedrunClue.ts";
import type { State } from "../types/State.ts";
import {
  LEFT_MOUSE_BUTTON,
  MIDDLE_MOUSE_BUTTON,
  RIGHT_MOUSE_BUTTON,
} from "../ui/constants.ts";

/** The button and the keys of a mouse click. */
export interface CardClick {
  readonly button: number;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}

export type CardCommand =
  /** Opens the box to type our note on the card in. */
  | { readonly type: "editNote" }
  /** Changes the card into another, in a hypothetical. */
  | { readonly type: "morph" }
  /** Shows a turn in the replay. */
  | { readonly type: "showSegment"; readonly segment: number }
  /** Shows a turn in the replay, and points the arrow at the card, so that it is easy to find. */
  | { readonly type: "showCard"; readonly segment: number }
  /**
   * Shows the turn on which a card was drawn, and then the next turn, so that the card moves into
   * its hand. The arrow points at the card.
   */
  | { readonly type: "showDraw"; readonly segment: number }
  | { readonly type: "play" | "discard" }
  | {
      readonly type: "clue";
      readonly receiverIndex: PlayerIndex;
      readonly clue: Clue;
    }
  /** The clue tokens do not allow the move. */
  | { readonly type: "refuse" };

export interface CardClickContext {
  readonly state: State;
  readonly variant: Variant;

  /** The identity of each card, as the screen shows it. */
  readonly identities: readonly CardIdentity[];

  /**
   * The clue chosen in the open clue menu, if any. A speedrun click gives it when it touches the
   * card, as the classic screen does with its pressed clue button.
   */
  readonly chosenClue?: Clue;
}

function hasModifier(click: CardClick): boolean {
  return click.ctrlKey || click.shiftKey || click.altKey || click.metaKey;
}

function isOnlyCtrl(click: CardClick): boolean {
  return click.ctrlKey && !click.shiftKey && !click.altKey && !click.metaKey;
}

function isOnlyAlt(click: CardClick): boolean {
  return click.altKey && !click.ctrlKey && !click.shiftKey && !click.metaKey;
}

/**
 * Whether clicks on cards make moves at once, as in speedruns: a left-click plays our card or gives
 * a teammate a color clue, and a right-click discards our card or gives a teammate a rank clue. It
 * applies only to the players of a game.
 */
export function usesSpeedrunClicks(
  state: State,
  speedrunFeatures: boolean,
): boolean {
  return (state.metadata.options.speedrun || speedrunFeatures) && state.playing;
}

/** Stack bases use the orders after the final card in the deck. */
function isStackBase(order: CardOrder, variant: Variant): boolean {
  return order >= getTotalCardsInDeck(variant);
}

/**
 * The move that a speedrun click makes when the mouse button goes down, if any (see
 * `usesSpeedrunClicks`). It applies to the cards in the hands of the game as it stands.
 */
export function getSpeedrunCommand(
  click: CardClick,
  order: CardOrder,
  { state, variant, identities, chosenClue }: CardClickContext,
): CardCommand | undefined {
  const { ongoingGame, metadata } = state;
  if (
    hasModifier(click)
    || state.replay.segment !== undefined
    || state.replay.hypothetical !== undefined
  ) {
    return undefined;
  }

  const location = ongoingGame.deck[order]?.location;
  if (typeof location !== "number") {
    return undefined;
  }

  if (location === metadata.ourPlayerIndex) {
    if (click.button === LEFT_MOUSE_BUTTON) {
      return { type: "play" };
    }
    if (click.button === RIGHT_MOUSE_BUTTON) {
      return isAtMaxClueTokens(ongoingGame.clueTokens, variant)
        ? { type: "refuse" }
        : { type: "discard" };
    }
    return undefined;
  }

  const clueAvailable = ongoingGame.clueTokens >= getClueCost(variant);
  const lastClueType = ongoingGame.clues.at(-1)?.type;
  const identity = identities[order];
  if (click.button === LEFT_MOUSE_BUTTON) {
    if (!clueAvailable || !isClueTypeAllowed("color", lastClueType, variant)) {
      return { type: "refuse" };
    }
    const color = getColorForSpeedrunClue(
      variant,
      identity?.suitIndex,
      identity?.rank,
      chosenClue?.type === "color" ? chosenClue.value : undefined,
    );
    return color === undefined
      ? undefined
      : {
          type: "clue",
          receiverIndex: location,
          clue: newColorClue(color),
        };
  }

  // It is not possible to clue a START card with a rank clue. A card of unknown rank gets no clue,
  // so that a right-click edits its note instead.
  if (
    click.button !== RIGHT_MOUSE_BUTTON
    || identity?.rank === undefined
    || identity.rank === START_CARD_RANK
  ) {
    return undefined;
  }
  if (!clueAvailable || !isClueTypeAllowed("rank", lastClueType, variant)) {
    return { type: "refuse" };
  }
  const rank = getRankForSpeedrunClue(
    variant,
    identity.suitIndex,
    identity.rank,
    chosenClue?.type === "rank" ? chosenClue.value : undefined,
  );
  return rank === undefined
    ? undefined
    : {
        type: "clue",
        receiverIndex: location,
        clue: newRankClue(rank),
      };
}

/**
 * What a click on a card does, after the mouse button comes up: a left-click (or a tap), a middle
 * click, or a right-click. A right-click that this does not handle edits the card's note (see
 * "CardNote.tsx").
 */
export function getCardClickCommand(
  click: CardClick,
  order: CardOrder,
  { state, variant }: CardClickContext,
  speedrunClicks: boolean,
): CardCommand | undefined {
  const stackBase = isStackBase(order, variant);

  // Ctrl + left-click also edits the note, since some Mac computers have no right-click. Only the
  // stack bases of "Throw It in a Hole" variants take notes.
  if (
    click.button === LEFT_MOUSE_BUTTON
    && isOnlyCtrl(click)
    && !state.finished
    && (!stackBase || variant.throwItInAHole)
  ) {
    return { type: "editNote" };
  }

  // Speedrun clicks replace the other clicks.
  if (speedrunClicks) {
    return undefined;
  }

  if (click.button === RIGHT_MOUSE_BUTTON) {
    return isOnlyAlt(click) && controlsHypothetical(state)
      ? { type: "morph" }
      : undefined;
  }

  // No replay moves happen in a hypothetical.
  const cardState = state.visibleState?.deck[order];
  if (
    stackBase
    || cardState === undefined
    || state.replay.hypothetical !== undefined
  ) {
    return undefined;
  }

  // A middle click shows the turn on which the card was first clued. The turn after the clue shows
  // it.
  if (click.button === MIDDLE_MOUSE_BUTTON) {
    return hasModifier(click) || cardState.segmentFirstClued === undefined
      ? undefined
      : {
          type: "showSegment",
          segment: cardState.segmentFirstClued + 1,
        };
  }

  if (
    click.button !== LEFT_MOUSE_BUTTON
    || click.ctrlKey
    || click.shiftKey
    || click.metaKey
  ) {
    return undefined;
  }

  // Alt + click shows the card being drawn into its hand. A card of the first deal was drawn before
  // the first turn.
  if (click.altKey) {
    return cardState.segmentDrawn === undefined
      ? {
          type: "showCard",
          segment: 0,
        }
      : {
          type: "showDraw",
          segment: cardState.segmentDrawn,
        };
  }

  // A click on a played or discarded card shows the turn on which it left its hand.
  if (isCardPlayed(cardState) && cardState.segmentPlayed !== undefined) {
    return {
      type: "showCard",
      segment: cardState.segmentPlayed,
    };
  }
  if (isCardDiscarded(cardState) && cardState.segmentDiscarded !== undefined) {
    return {
      type: "showCard",
      segment: cardState.segmentDiscarded,
    };
  }

  return undefined;
}

/**
 * Whether a pointer drags a card that the player can move. The mouse always drags it. A touch or a
 * pen drags it too, except in the phone layout, where the play stacks and the discard pile can be
 * off the screen, so a tap opens the card's menu instead.
 */
export function isDragPointer(
  pointerType: string,
  phoneLayout: boolean,
): boolean {
  return (
    pointerType === "mouse"
    || (!phoneLayout && (pointerType === "touch" || pointerType === "pen"))
  );
}

/** The pointer of a click, or an empty string for a key. */
function getPointerType(event: React.MouseEvent): string {
  const { nativeEvent } = event;
  return "pointerType" in nativeEvent
    && typeof nativeEvent.pointerType === "string"
    ? nativeEvent.pointerType
    : "";
}

/**
 * Whether a click came from a pointer that drags the card (see `isDragPointer`), and not from a key
 * or, in the phone layout, a tap. Any other click opens the card's menu.
 */
export function isDragClick(
  event: React.MouseEvent,
  phoneLayout: boolean,
): boolean {
  return isDragPointer(getPointerType(event), phoneLayout);
}

/**
 * Stops the menu that a long touch opens on a card that a touch drags. The browser's menu, or the
 * card's note box, would stop the drag. A double tap edits the note instead (see
 * "useCardInput.ts").
 */
export function stopLongTouchMenu(
  event: React.MouseEvent,
  phoneLayout: boolean,
): void {
  const pointerType = getPointerType(event);
  if (pointerType === "mouse" || !isDragPointer(pointerType, phoneLayout)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
}
