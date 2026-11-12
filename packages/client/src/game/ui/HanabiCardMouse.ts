import { isCardDiscarded, isCardPlayed } from "@hanabi-live/game";
import type Konva from "konva";
import * as tooltips from "../../tooltips.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import { HanabiCardClick } from "./HanabiCardClick.ts";
import { mouseDownSpeedrun } from "./HanabiCardClickSpeedrun.ts";
import { HanabiCardDblTap, HanabiCardTap } from "./HanabiCardTouchActions.ts";
import type { LayoutChild } from "./LayoutChild.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { showClueMatches } from "./clueLog/mountClueLog.tsx";
import {
  DOUBLE_TAP_DELAY_MILLISECONDS,
  LEFT_MOUSE_BUTTON_HELD,
} from "./constants.ts";
import * as cursor from "./cursor.ts";
import * as konvaTooltips from "./konvaTooltips.ts";
import * as notes from "./notes.ts";

export function registerMouseHandlers(this: HanabiCard): void {
  // https://konvajs.org/docs/events/Binding_Events.html
  this.on("mouseenter", mouseEnter);
  this.on("mouseleave", mouseLeave);
  this.on("touchstart", touchStart);
  this.on("click", HanabiCardClick);
  this.on("tap", HanabiCardTap);
  this.on("dbltap", HanabiCardDblTap);
  this.on("mousedown", mouseDown);
  this.on("mouseup", mouseUp);
}

// --------------------
// Mouse event handlers
// --------------------

function mouseEnter(this: HanabiCard) {
  // Keep track of which element we are hovering over
  konvaTooltips.setActiveHover(this);

  // When we hover over a card, show a tooltip that contains the note.
  checkShowNoteTooltip(this);

  // When we hover over a card, the relevant positive and negative clues will be highlighted in the
  // clue log.
  showClueMatches(this.order);

  // When we hover over a card, the cursor can change.
  this.setCursor();
}

function mouseLeave(this: HanabiCard) {
  konvaTooltips.resetActiveHover(this);

  // When we stop hovering over a card, close any open tooltips.
  checkHideNoteTooltip(this);

  // When we stop hovering over a card, the clue log will return to normal.
  showClueMatches(undefined);

  // When we stop hovering over a card, the cursor should change back to normal.
  cursor.set("default");

  // During replay hypo, skip the starting player.
  if (checkForHypoEmpathy(this)) {
    return;
  }

  // When we stop hovering over a card, disable Empathy (if it is enabled).
  if (!globals.globalEmpathyEnabled) {
    setEmpathyOnHand(this, false);
  }
}

function touchStart(
  this: HanabiCard,
  event: Konva.KonvaEventObject<TouchEvent>,
) {
  // Make sure to not register this as a single tap if the user long presses the card.
  this.touchstartTimeout = setTimeout(() => {
    // A tap will trigger when the "touchend" event occurs. The next tap action will not run because
    // it will appear like the second tap of a double tap. Do not worry about this if we actually
    // double-tapped.
    this.wasRecentlyTapped = true;
    if (globals.editingNote !== undefined) {
      tooltips.close(globals.editingNote);
      tooltips.close(this.tooltipName);
    }
  }, DOUBLE_TAP_DELAY_MILLISECONDS);

  // Do all of the same things that would occur if we hovered over the card.
  mouseEnter.call(this);

  // Konva sends "touchend" to the shape under the finger when it lifts, so a touch that slides off
  // the card would otherwise leave its note tooltip and Empathy on. Konva also ignores
  // "touchcancel".
  const touchEnd = () => {
    globalThis.removeEventListener("touchend", touchEnd);
    globalThis.removeEventListener("touchcancel", touchEnd);
    mouseLeave.call(this);
  };
  globalThis.addEventListener("touchend", touchEnd);
  globalThis.addEventListener("touchcancel", touchEnd);

  // During replay hypo, skip the starting player.
  if (checkForHypoEmpathy(this)) {
    return;
  }

  // Empathy
  if (shouldShowEmpathy(this, event)) {
    setEmpathyOnHand(this, true);
  }
}

function mouseDown(
  this: HanabiCard,
  event: Konva.KonvaEventObject<MouseEvent>,
) {
  // Speedrunning overrides the normal card clicking behavior.
  if (useSpeedrunClickHandlers()) {
    mouseDownSpeedrun(this, event.evt);
    return;
  }

  const editMode =
    globals.elements.editCardsCheckbox !== undefined
    && globals.elements.editCardsCheckbox.checked
    && globals.state.replay.hypothetical !== undefined;
  // Empathy
  if (
    event.evt.buttons === LEFT_MOUSE_BUTTON_HELD // Only enable Empathy for left-clicks
    && shouldShowEmpathy(this, event)
    && !editMode
    && !checkForHypoEmpathy(this)
  ) {
    setEmpathyOnHand(this, true);
  }

  // Dragging
  if (event.evt.buttons === LEFT_MOUSE_BUTTON_HELD) {
    // Only enable dragging for left-clicks.
    dragStart(this);
  }
}

function mouseUp(this: HanabiCard) {
  // Speedrunning overrides the normal card clicking behavior.
  if (useSpeedrunClickHandlers()) {
    return;
  }

  // During replay hypo, skip the starting player.
  if (!checkForHypoEmpathy(this) && !globals.globalEmpathyEnabled) {
    setEmpathyOnHand(this, false);
  }

  dragEnd(this);
}

// -----------
// Subroutines
// -----------

function checkShowNoteTooltip(card: HanabiCard) {
  if (globals.editingNote !== undefined) {
    // Do not open any more note tooltips if the user is currently editing a note
    return;
  }

  if (
    card.noteIndicator.isVisible() === false
    && card.state.location !== "playStack"
  ) {
    // Do not do anything if there is not a note on this card in hand.
    return;
  }

  // If we are spectating and there is a new note, mark it as seen.
  if (card.noteIndicator.tilted) {
    card.noteIndicator.setTilted(false);
    globals.layers.card.batchDraw();
  }

  notes.show(card);
}

export function setCursor(this: HanabiCard): void {
  const cursorType = getCursorType(this);
  cursor.set(cursorType);
}

function getCursorType(card: HanabiCard) {
  if (card.dragging) {
    return "dragging";
  }

  if (
    globals.elements.editCardsCheckbox !== undefined
    && globals.elements.editCardsCheckbox.checked
    && globals.state.replay.hypothetical !== undefined
  ) {
    return "edit";
  }

  if (card.layout.draggable() && card.layout.isListening() === true) {
    return "hand";
  }

  if (shouldShowLookCursor(card)) {
    return "look";
  }

  return "default";
}

// The look cursor should show if Empathy can be used on the card.
function shouldShowLookCursor(card: HanabiCard) {
  if (
    // It is not possible to use Empathy on a stack base.
    card.isStackBase
    // If the card wouldn't be possible to click anyway, don't show the cursor.
    || card.layout.isListening() === false
  ) {
    return false;
  }

  // If we are in an in-game replay or we are not a player in an ongoing game, always show the
  // cursor.
  if (globals.state.replay.segment !== undefined || !globals.state.playing) {
    return true;
  }

  // For ongoing games, always show the cursor for other people's hands.
  if (
    typeof card.state.location === "number"
    && card.state.location !== globals.metadata.ourPlayerIndex
  ) {
    return true;
  }

  // For ongoing games, only show the cursor for our hand if it has a custom card identity.

  // Check if there exists a possibility from clues that the note declares impossible.
  const noteNarrowsPossibilities =
    card.note.possibilities.length > 0
    && card.state.possibleCardsFromClues.some(([suitIndexA, rankA]) =>
      card.note.possibilities.every(
        ([suitIndexB, rankB]) =>
          !(suitIndexA === suitIndexB && rankA === rankB),
      ),
    );
  return noteNarrowsPossibilities || card.note.blank || card.note.unclued;
}

function checkHideNoteTooltip(card: HanabiCard) {
  const tooltip = card.tooltipName;

  // Do not close the tooltip if we are currently editing a note.
  if (globals.editingNote === tooltip) {
    return;
  }

  tooltips.close(tooltip);
}

function useSpeedrunClickHandlers() {
  return (
    (globals.options.speedrun || globals.lobby.settings.speedrunFeatures)
    && globals.state.playing
  );
}

function shouldShowEmpathy(
  card: HanabiCard,
  event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
) {
  return (
    // Disable Empathy if a modifier key is pressed.
    !event.evt.shiftKey
    && !event.evt.altKey
    && !event.evt.metaKey
    // Disable Empathy if the card is tweening (e.g. moving)
    && !card.tweening
    // Disable empathy for the stack bases.
    && !card.isStackBase
    // Clicking on a played card goes to the turn that it was played.
    && !isCardPlayed(card.state)
    // Clicking on a discarded card goes to the turn that it was discarded.
    && !isCardDiscarded(card.state)
  );
}

// In a game, click and hold the left mouse button on a teammate's hand to show the cards as they
// appear to that teammate. Or show your own hand as it should appear without any identity notes on
// it. Or, in a replay, show the hand as it appeared at that moment in time.
export function setEmpathyOnHand(card: HanabiCard, enabled: boolean): void {
  // Disable Empathy for cards that are not in a player's hand.
  if (typeof card.state.location !== "number") {
    return;
  }

  // Only enable empathy when the card's UI parent is its actual hand.
  const hand = globals.elements.playerHands[card.state.location];
  if (
    hand === undefined
    || (card.layout.parent as unknown) !== hand
    || hand.children.length === 0
  ) {
    return;
  }

  hand.setEmpathy(enabled);
}

// Handle things relating to dragging a card. We cannot use the "dragstart" mouse event since that
// will only fire after the element has moved at least one pixel. Ideally, we would have a check to
// only make a card draggable with a left click. However, checking for `LEFT_MOUSE_BUTTON_HELD` will
// break iPads.
function dragStart(card: HanabiCard) {
  if (!card.layout.draggable() || card.layout.isListening() === false) {
    return;
  }

  card.dragging = true;
  globals.store!.dispatch({ type: "dragStart", card });

  // The note tooltip would cover the card and the place that it is dragged to.
  checkHideNoteTooltip(card);

  raiseCardLayer();

  // Enable the dragging raise effect.
  card.setRaiseAndShadowOffset();

  // We need to change the cursor from the hand to the grabbing icon.
  card.setCursor();

  // In a hypothetical, dragging a rotated card from another person's hand is frustrating, so
  // temporarily remove all rotation (for the duration of the drag). The rotation will be
  // automatically reset if the card tweens back to the hand.
  if (
    globals.state.replay.hypothetical !== undefined
    && card.layout.parent !== null
    && globals.lobby.settings.keldonMode
  ) {
    const { parent } = card.layout;
    const rotation = card.layout.rotation();
    const { x, y } = card.layout.position();
    card.layout.rotation(-parent.rotation());

    // Releasing the card without moving it fires no "dragend", so nothing lays out the hand again.
    // (The straightened card also leaves the pointer, so the card does not get the release either.)
    globalThis.addEventListener(
      "pointerup",
      () => {
        const position = card.layout.position();
        if (
          card.layout.parent === parent
          && position.x === x
          && position.y === y
        ) {
          card.layout.rotation(rotation);
          globals.layers.card.batchDraw();
        }
      },
      { capture: true, once: true },
    );
  }

  // Hide any visible arrows on the rest of a hand when the card begins to be dragged.
  const hand = card.layout.parent;
  if (hand === null) {
    return;
  }
  let hideArrows = false;
  for (const layoutChild of [...hand.children] as LayoutChild[]) {
    for (const arrow of globals.elements.arrows) {
      if (arrow.pointingTo === layoutChild.card) {
        hideArrows = true;
        break;
      }
    }
    if (hideArrows) {
      break;
    }
  }
  if (hideArrows) {
    arrows.hideAll();
  }

  // Move this hand to the top. (Otherwise, the card can appear under the play stacks / discard
  // stacks.)
  hand.moveToTop();
}

// Draw the cards above everything else for the duration of the drag: the other layers (such as the
// dialogs and the arrows), whose canvases have no z-index. The card is not always under the pointer
// when it is released (see the rotation above), so restore the order on any release.
function raiseCardLayer() {
  const canvas = globals.layers.card.getNativeCanvasElement();
  canvas.style.zIndex = "1";
  globalThis.addEventListener(
    "pointerup",
    () => {
      canvas.style.zIndex = "";
    },
    { capture: true, once: true },
  );
}

// Handle things relating to dragging a card. We cannot use the "dragend" mouse event since that
// will only fire after the element has moved at least one pixel.
function dragEnd(card: HanabiCard) {
  if (!card.layout.draggable()) {
    return;
  }

  card.dragging = false;

  // Disable the dragging raise effect.
  card.setRaiseAndShadowOffset();

  // We need to change the cursor from the grabbing icon back to the default.
  card.setCursor();
}

function checkForHypoEmpathy(card: HanabiCard): boolean {
  if (globals.state.replay.hypothetical !== undefined) {
    const { startingPlayerIndex } = globals.state.replay.hypothetical;
    if (
      startingPlayerIndex === undefined
      || startingPlayerIndex >= globals.elements.playerHands.length
      || globals.elements.playerHands[startingPlayerIndex] === undefined
    ) {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (
      let i = 0;
      i < globals.elements.playerHands[startingPlayerIndex].children.length;
      i++
    ) {
      const child =
        globals.elements.playerHands[startingPlayerIndex].children[i]!;
      const currentCard = (child as unknown as LayoutChild).card;
      if (currentCard._id === card._id) {
        return true;
      }
    }
  }

  return false;
}
