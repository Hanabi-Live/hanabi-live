import { STACK_BASE_RANK } from "@hanabi/data";
import type Konva from "konva";
import * as tooltips from "../../tooltips";
import * as cardRules from "../rules/card";
import type { CardLayout } from "./CardLayout";
import type { HanabiCard } from "./HanabiCard";
import { HanabiCardClick } from "./HanabiCardClick";
import { HanabiCardClickSpeedrun } from "./HanabiCardClickSpeedrun";
import { HanabiCardDblTap, HanabiCardTap } from "./HanabiCardTouchActions";
import type { LayoutChild } from "./LayoutChild";
import * as arrows from "./arrows";
import { DOUBLE_TAP_DELAY } from "./constants";
import * as cursor from "./cursor";
import { globals } from "./globals";
import * as konvaTooltips from "./konvaTooltips";
import * as notes from "./notes";

export function registerMouseHandlers(this: HanabiCard): void {
  // https://konvajs.org/docs/events/Binding_Events.html
  this.on("mouseenter", mouseEnter);
  this.on("mouseleave", mouseLeave);
  this.on("touchstart", touchStart);
  this.on("touchend", mouseLeave);
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
  konvaTooltips.resetActiveHover();
  globals.activeHover = this;

  // When we hover over a card, show a tooltip that contains the note.
  checkShowNoteTooltip(this);

  // When we hover over a card, the relevant positive and negative clues will be highlighted in the
  // clue log.
  globals.elements.clueLog!.showMatches(this.state.order);
  globals.layers.UI.batchDraw();

  // When we hover over a card, the cursor can change.
  this.setCursor();
}

function mouseLeave(this: HanabiCard) {
  globals.activeHover = null;

  // When we stop hovering over a card, close any open tooltips.
  checkHideNoteTooltip(this);

  // When we stop hovering over a card, the clue log will return to normal.
  globals.elements.clueLog!.showMatches(null);
  globals.layers.UI.batchDraw();

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
    // it will appear like the second tap of a double tap. Don't worry about this if we actually
    // double-tapped.
    if (!this.wasRecentlyTapped) {
      this.wasRecentlyTapped = true;
    }
    if (globals.editingNote !== null) {
      globals.editingNote = null;
      tooltips.close(`#tooltip-${this.tooltipName}`);
    }
  }, DOUBLE_TAP_DELAY);

  // Do all of the same things that would occur if we hovered over the card.
  mouseEnter.call(this);

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
    HanabiCardClickSpeedrun(this, event.evt);
    return;
  }

  const editMode =
    globals.elements.editCardsButton !== null &&
    globals.elements.editCardsButton.pressed &&
    globals.state.replay.hypothetical !== null;
  // Empathy
  if (
    event.evt.buttons === 1 && // Only enable Empathy for left-clicks
    shouldShowEmpathy(this, event) &&
    !editMode &&
    !checkForHypoEmpathy(this)
  ) {
    setEmpathyOnHand(this, true);
  }

  // Dragging
  if (event.evt.buttons === 1) {
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
  if (globals.editingNote !== null) {
    // Don't open any more note tooltips if the user is currently editing a note
    return;
  }

  if (
    card.noteIndicator.isVisible() === false &&
    card.state.location !== "playStack"
  ) {
    // Don't do anything if there is not a note on this card in hand.
    return;
  }

  // If we are spectating and there is a new note, mark it as seen.
  if (card.noteIndicator.rotated) {
    card.noteIndicator.rotated = false;
    card.noteIndicator.rotate(-15);
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
    globals.elements.editCardsButton !== null &&
    globals.elements.editCardsButton.pressed &&
    globals.state.replay.hypothetical !== null
  ) {
    return "edit";
  }

  if (card.layout.draggable() && !card.tweening) {
    return "hand";
  }

  if (shouldShowLookCursor(card)) {
    return "look";
  }

  return "default";
}

// The look cursor should show if Empathy can be used on the card.
function shouldShowLookCursor(card: HanabiCard) {
  // It is not possible to use Empathy on a stack base.
  if (card.state.rank === STACK_BASE_RANK) {
    return false;
  }

  // If we are in an in-game replay or we are not a player in an ongoing game, always show the
  // cursor.
  if (globals.state.replay.active || !globals.state.playing) {
    return true;
  }

  // For ongoing games, always show the cursor for other people's hands.
  if (
    typeof card.state.location === "number" &&
    card.state.location !== globals.metadata.ourPlayerIndex
  ) {
    return true;
  }

  // For ongoing games, only show the cursor for our hand if it has a custom card identity.

  // Check if there exists a possibility from clues that the note declares impossible.
  const noteNarrowsPossibilities =
    card.note.possibilities.length !== 0 &&
    card.state.possibleCardsFromClues.some(
      ([suitIndexA, rankA]) =>
        !card.note.possibilities.some(
          ([suitIndexB, rankB]) => suitIndexA === suitIndexB && rankA === rankB,
        ),
    );
  if (noteNarrowsPossibilities || card.note.blank || card.note.unclued) {
    return true;
  }

  return false;
}

function checkHideNoteTooltip(card: HanabiCard) {
  // Don't close the tooltip if we are currently editing a note.
  if (globals.editingNote === card.state.order) {
    return;
  }

  tooltips.close(`#tooltip-${card.tooltipName}`);
}

const useSpeedrunClickHandlers = () =>
  (globals.options.speedrun || globals.lobby.settings.speedrunMode) &&
  globals.state.playing;

const shouldShowEmpathy = (
  card: HanabiCard,
  event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
) =>
  // Disable Empathy if a modifier key is pressed.
  !event.evt.shiftKey &&
  !event.evt.altKey &&
  !event.evt.metaKey &&
  // Disable Empathy if the card is tweening (e.g. moving)
  !card.tweening &&
  // Disable empathy for the stack bases.
  card.state.rank !== STACK_BASE_RANK &&
  // Clicking on a played card goes to the turn that it was played.
  !cardRules.isPlayed(card.state) &&
  // Clicking on a discarded card goes to the turn that it was discarded.
  !cardRules.isDiscarded(card.state);

// In a game, click and hold the left mouse button on a teammate's hand to show the cards as they
// appear to that teammate. Or show your own hand as it should appear without any identity notes on
// it. Or, in a replay, show the hand as it appeared at that moment in time.
export function setEmpathyOnHand(card: HanabiCard, enabled: boolean): void {
  // Disable Empathy for cards that are not in a player's hand.
  if (typeof card.state.location !== "number") {
    return;
  }

  // As a sanity check, ensure that the hand object exists.
  const hand = card.layout.parent as unknown as CardLayout | undefined | null;
  if (hand === undefined || hand === null || hand.children.length === 0) {
    return;
  }

  hand.setEmpathy(enabled);
}

// Handle things relating to dragging a card. We cannot use the "dragstart" mouse event since that
// will only fire after the element has moved at least one pixel. Ideally, we would have a check to
// only make a card draggable with a left click. However, checking for "event.evt.buttons !== 1"
// will break iPads.
function dragStart(card: HanabiCard) {
  if (!card.layout.draggable()) {
    return;
  }

  card.dragging = true;
  globals.store!.dispatch({ type: "dragStart", card });

  // Enable the dragging raise effect.
  card.setRaiseAndShadowOffset();

  // We need to change the cursor from the hand to the grabbing icon.
  card.setCursor();

  // In a hypothetical, dragging a rotated card from another person's hand is frustrating, so
  // temporarily remove all rotation (for the duration of the drag). The rotation will be
  // automatically reset if the card tweens back to the hand.
  if (
    globals.state.replay.hypothetical !== null &&
    card.layout.parent !== null &&
    globals.lobby.settings.keldonMode
  ) {
    card.layout.rotation(card.layout.parent.rotation() * -1);
  }

  // Hide any visible arrows on the rest of a hand when the card begins to be dragged.
  const hand = card.layout.parent;
  if (hand === null) {
    return;
  }
  let hideArrows = false;
  for (const layoutChild of hand.children.toArray() as LayoutChild[]) {
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
  if (globals.state.replay.hypothetical !== null) {
    const { startingPlayerIndex } = globals.state.replay.hypothetical;
    if (
      startingPlayerIndex === null ||
      startingPlayerIndex >= globals.elements.playerHands.length ||
      globals.elements.playerHands[startingPlayerIndex] === undefined
    ) {
      return false;
    }
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (
      let i = 0;
      i < globals.elements.playerHands[startingPlayerIndex]!.children.length;
      i++
    ) {
      const child =
        globals.elements.playerHands[startingPlayerIndex]!.children[i]!;
      const currentCard: HanabiCard = child.children[0] as HanabiCard;
      if (currentCard._id === card._id) {
        return true;
      }
    }
  }

  return false;
}
