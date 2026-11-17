// Arrows are used to show which cards are touched by a clue (and to highlight things in shared
// replays).

import type { Clue, HiddenClue, PlayerIndex, Suit } from "@hanabi-live/game";
import {
  EVEN_RANK_CLUE,
  getCharacterNameForPlayer,
  isCardDiscarded,
  isCardInPlayerHand,
  isCardPlayed,
} from "@hanabi-live/game";
import Konva from "konva";
import type * as KonvaContext from "konva/lib/Context";
import type { KonvaEventObject } from "konva/lib/Node";
import { store } from "../../store.ts";
import * as tooltips from "../../tooltips.ts";
import type { ArrowTarget } from "../highlightArrow.ts";
import { canDrawArrow, getToggledArrow, sendArrow } from "../highlightArrow.ts";
import { getViewPlayerIndex } from "../ourSeat.ts";
import { CardLayout } from "./CardLayout.ts";
import { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import * as cluePreview from "./cluePreview.ts";
import {
  ARROW_COLOR,
  CARD_ANIMATION_DELAY_SECONDS,
  CARD_ANIMATION_LENGTH_SECONDS,
  FULL_TURN_DEGREES,
  HALF_TURN_DEGREES,
  RIGHT_MOUSE_BUTTON,
  STRIKE_ARROW_TARGETS,
} from "./constants.ts";
import type { Arrow } from "./controls/Arrow.ts";
import type { NodeWithTooltip } from "./controls/NodeWithTooltip.ts";
import { StrikeSquare } from "./controls/StrikeSquare.ts";
import { drawPip } from "./drawPip.ts";
import { getCardOrStackBase } from "./getCardOrStackBase.ts";
import * as konvaHelpers from "./konvaHelpers.ts";

/**
 * Where an arrow points on an element that is not a card or a text label, as fractions of the
 * element's width and height from its top-left corner.
 */
const ARROW_ANCHOR = {
  /** The top middle of the deck. */
  DECK: {
    x: 0.5,
    y: 0.1,
  },

  /** The first digit of the turn, score, plays, and clues numbers. */
  SCORE_AREA_NUMBER: {
    x: 0.15,
  },

  /** The max score number, which follows the score. */
  MAX_SCORE: {
    x: 0.7,
  },
} as const;

/**
 * How far an arrow pointing at a card stops short of the card's center, as a fraction of the stage
 * height.
 */
const CARD_ARROW_BACKOFF = 0.075;

function getClueArrowColor(
  element: Konva.Node | undefined,
  preview: boolean,
): string {
  if (!(element instanceof HanabiCard)) {
    return ARROW_COLOR.DEFAULT;
  }

  // The arrow is drawn after the clue is given, so by this time `numPositiveClues` having a value
  // of 2 means it had one clue already. During preview the clue is not applied yet, so if it has at
  // least one positive clue on it already, it will be retouched by the next clue.
  if (
    element.state.numPositiveClues >= 2
    || (preview && element.state.numPositiveClues >= 1)
  ) {
    return ARROW_COLOR.RETOUCHED;
  }

  // if H-Group features are enabled, use a different color for cards that have been chop-moved
  if (
    store.getState().session.settings.hGroupConventions
    && element.note.chopMoved
  ) {
    return ARROW_COLOR.CM_TOUCHED;
  }

  return ARROW_COLOR.DEFAULT;
}

/** Whether the arrows show a clue that the player is considering giving. */
let potentialClueShown = false;

export function isPotentialClueShown(): boolean {
  return potentialClueShown;
}

/** Hides every arrow. Pass true when the arrows will next show a potential clue. */
export function hideAll(potentialClue = false): void {
  potentialClueShown = potentialClue;

  // A potential clue can be previewed only while its arrows are shown.
  cluePreview.setPotentialClue(undefined);

  let changed = false;
  for (const arrow of globals.elements.arrows) {
    if (arrow.pointingTo === undefined) {
      continue;
    }

    changed = true;
    arrow.pointingTo = undefined;
    arrow.hide();
    if (arrow.tween === undefined) {
      continue;
    }

    arrow.tween.destroy();
    arrow.tween = undefined;
  }
  if (changed) {
    globals.layers.arrow.batchDraw();
  }
}

export function set(
  i: number,
  element: Konva.Node | undefined,
  giverPlayerIndex: PlayerIndex | undefined,
  clue: Clue | HiddenClue | undefined,
  preview = false,
  immediate = false,
): void {
  // Show the arrow
  const arrow = globals.elements.arrows[i]!;
  arrow.pointingTo = element;
  arrow.show();
  arrow.moveToTop();

  // Clear leftover suit pips before reusing an arrow for another clue or highlight.
  arrow.suitPip?.hide();

  // Figure out whether the arrow should be inverted or not.
  let rot = 0;
  if (
    element instanceof HanabiCard
    && !isCardPlayed(element.state)
    && !isCardDiscarded(element.state)
    && !element.isStackBase
  ) {
    if (
      element.parent !== null
      && element.parent.parent !== null
      && element.parent.parent instanceof CardLayout
    ) {
      rot = element.parent.parent.origRotation;
    }
    if (
      (!store.getState().session.settings.keldonMode
        && element.state.location === getViewPlayerIndex(globals.metadata))
      || (store.getState().session.settings.keldonMode
        && element.state.location !== getViewPlayerIndex(globals.metadata)
        && isCardInPlayerHand(element.state))
    ) {
      // In BGA mode, invert the arrows on our hand (so that it doesn't get cut off by the top of
      // the screen). In Keldon mode, invert the arrows for all other players.
      rot += HALF_TURN_DEGREES;
    }
  }
  arrow.rotation(rot);

  // We want the text to always be right-side up (e.g. have a rotation of 0)
  arrow.text.rotation(FULL_TURN_DEGREES - rot);

  // Set the arrow features.
  if (clue === undefined) {
    // This is a highlight arrow.
    const color = ARROW_COLOR.HIGHLIGHT;
    arrow.base.fill(color);

    // Do not draw the circle.
    arrow.circle.hide();
    arrow.text.hide();
  } else {
    // This is a clue arrow. Compute color using a small helper for clarity.
    const color = getClueArrowColor(element, preview);

    arrow.base.fill(color);

    // Clue arrows have a circle that shows the type of clue given.
    const giverCharacterName = getCharacterNameForPlayer(
      giverPlayerIndex,
      globals.metadata.characterAssignments,
    );
    const visibleType = clue.type ?? clue.visibleType;
    if (
      visibleType === undefined
      || globals.variant.duck
      || (giverCharacterName === "Quacker" && !globals.state.finished)
    ) {
      // Do not show the circle in variants where the clue types are supposed to be hidden.
      arrow.circle.hide();
      arrow.text.hide();
    } else {
      arrow.circle.show();

      switch (visibleType) {
        case "color": {
          arrow.text.hide();

          // The circle for color clues should have a black border and a fill matching the color.
          arrow.circle.stroke("black");
          if (clue.type === undefined || globals.variant.cowAndPig) {
            // The specific clue color is hidden in "Cow & Pig" variants.
            arrow.circle.fill("white");
          } else {
            const clueColor = clue.value;
            if (typeof clueColor === "number") {
              throw new TypeError(
                "The clue value was a number for a color clue.",
              );
            }
            arrow.circle.fill(clueColor.fill);

            // Additionally, draw the suit pip in colorblind mode.
            if (store.getState().session.settings.colorblindMode) {
              if (typeof clue.value === "number") {
                throw new TypeError(
                  "The clue value was a number for a color clue.",
                );
              }
              const matchingSuits = globals.variant.suits.filter((suit: Suit) =>
                suit.clueColors.includes(clueColor),
              );
              if (matchingSuits.length === 1) {
                arrow.suitPip!.sceneFunc((ctx: KonvaContext.Context) => {
                  drawPip(
                    ctx as unknown as CanvasRenderingContext2D,
                    matchingSuits[0]!,
                    globals.variant,
                  );
                });
                arrow.suitPip!.show();
              }
            }
          }

          break;
        }

        case "rank": {
          // The specific clue rank is hidden in "Cow & Pig" variants.
          let text = "#";
          if (clue.type === "rank" && !globals.variant.cowAndPig) {
            text = clue.value.toString();
            if (globals.variant.oddsAndEvens) {
              text = clue.value === EVEN_RANK_CLUE ? "E" : "O";
            }
          }
          arrow.text.text(text);
          arrow.text.show();

          // The circle for number clues should have a white border and a black fill.
          arrow.circle.stroke("white");
          arrow.circle.fill("black");

          break;
        }
      }
    }
  }

  if (arrow.tween !== undefined) {
    arrow.tween.destroy();
    arrow.tween = undefined;
  }
  if (
    immediate
    || giverPlayerIndex === undefined
    || globals.animateFast
    || globals.isResizing
  ) {
    const pos = getPos(element!, rot);
    arrow.setAbsolutePosition(pos);
  } else {
    animate(arrow, element as HanabiCard, rot, giverPlayerIndex);
  }
  globals.layers.arrow.batchDraw();
}

function getPos(element: Konva.Node, rot: number) {
  // Start by using the absolute position of the element.
  let pos = element.getAbsolutePosition();

  if (element instanceof HanabiCard) {
    // If the card is currently tweening, position the arrow at its final position instead of its
    // current position.
    if (
      element.tweening
      && element.tweenFinalPosition !== undefined
      && element.tweenFinalScale !== undefined
    ) {
      const origPos = element.layout.position();
      const origScale = element.layout.scale();
      const origRot = element.layout.rotation();
      element.layout.position(element.tweenFinalPosition);
      element.layout.scale(element.tweenFinalScale);
      element.layout.rotation(0);
      pos = element.getAbsolutePosition();
      element.layout.position(origPos);
      element.layout.scale(origScale);
      element.layout.rotation(origRot);
    }

    // If we set the arrow at the absolute position of a card, it will point to the exact center.
    // Instead, back it off a little bit (accounting for the rotation of the hand).
    const distance = -CARD_ARROW_BACKOFF * globals.stage.height();
    const rotRadians = konvaHelpers.degreesToRadians(-rot);
    pos.x += distance * Math.sin(rotRadians); // sin(x) = cos(x + (PI * 3 / 2))
    pos.y -= distance * -Math.cos(rotRadians); // -cos(x) = sin(x + (PI * 3 / 2))
  } else if (element instanceof StrikeSquare) {
    pos.x += element.width() * 0.5;
  } else {
    switch (element) {
      case globals.elements.deck: {
        pos.x += element.width() * ARROW_ANCHOR.DECK.x;
        pos.y += element.height() * ARROW_ANCHOR.DECK.y;

        break;
      }

      case globals.elements.turnNumberLabel:
      case globals.elements.scoreNumberLabel:
      case globals.elements.playsNumberLabel:
      case globals.elements.cluesNumberLabel: {
        pos.x += element.width() * ARROW_ANCHOR.SCORE_AREA_NUMBER.x;

        break;
      }

      case globals.elements.maxScoreNumberLabel: {
        pos.x += element.width() * ARROW_ANCHOR.MAX_SCORE.x;

        break;
      }

      default: {
        // A text label is as wide as its text. Anything else, such as a player's name frame, points
        // at its middle.
        if (element instanceof Konva.Text) {
          const { width } = element.measureSize(element.text());
          pos.x += width / 2;
        } else {
          pos.x += element.width() / 2;
        }

        break;
      }
    }
  }

  if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) {
    throw new TypeError(
      "Failed to get the position for the element when drawing an arrow.",
    );
  }

  return pos;
}

/** Animate the arrow to fly from the player who gave the clue to the card. */
function animate(arrow: Arrow, card: HanabiCard, rot: number, giver: number) {
  // Start the arrow at the center position of the clue giver's hand.
  const centerPos = globals.elements.playerHands[giver]!.getAbsoluteCenterPos();
  arrow.setAbsolutePosition(centerPos);

  // Calculate the position of the final arrow destination.
  const pos = getPos(card, rot);

  // Start the tween after a short delay to prevent flashing when moving quickly through a replay.
  konvaHelpers.animate(arrow, {
    duration: CARD_ANIMATION_DELAY_SECONDS,
    onFinish: () => {
      arrow.show();
      konvaHelpers.animate(arrow, {
        duration: CARD_ANIMATION_LENGTH_SECONDS,
        x: pos.x,
        y: pos.y,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        easing: Konva.Easings.EaseOut,
      });
    },
  });

  // The call to animate() shows the arrow, so we need to hide it again.
  arrow.hide();
}

export function click(
  event: KonvaEventObject<MouseEvent>,
  target: ArrowTarget,
): void {
  // We only care about right-clicks. ("event.evt.buttons" is always 0 here.)
  if (
    event.evt.button !== RIGHT_MOUSE_BUTTON
    || !canDrawArrow(globals.state, event.evt)
  ) {
    return;
  }

  toggle(target);
}

/** Toggles the "highlight" arrow on a particular element. */
export function toggle(target: ArrowTarget, alwaysShow = false): void {
  const element = getElementFromTarget(target);
  if (!element) {
    return;
  }

  // Use the first arrow for highlighting a specific thing.
  const arrow = globals.elements.arrows[0]!;
  const shown =
    arrow.pointingTo === element && arrow.base.fill() === ARROW_COLOR.HIGHLIGHT
      ? target
      : undefined;
  const show = getToggledArrow(shown, target, alwaysShow) !== undefined;

  hideAll();
  if (show) {
    set(0, element, undefined, undefined);

    // If this element has a tooltip and it is open, close it.
    if (element.tooltipName !== undefined) {
      tooltips.close(element.tooltipName);
    }
  }

  sendArrow(globals.state, show ? target : undefined);
}

function getElementFromTarget(
  target: ArrowTarget,
): NodeWithTooltip | undefined {
  if (typeof target === "number") {
    return getCardOrStackBase(target);
  }

  if (typeof target === "object") {
    return globals.elements.nameFrames[target.playerIndex];
  }

  switch (target) {
    case "deck": {
      return globals.elements.deck!;
    }

    case "turn": {
      return globals.elements.turnNumberLabel!;
    }

    case "score": {
      return globals.elements.scoreNumberLabel!;
    }

    case "maxScore": {
      return globals.elements.maxScoreNumberLabel!;
    }

    case "clues": {
      return globals.elements.cluesNumberLabel!;
    }

    case "strike1":
    case "strike2":
    case "strike3": {
      return globals.elements.strikeSquares[
        STRIKE_ARROW_TARGETS.indexOf(target)
      ]!;
    }

    case "pace": {
      return globals.elements.paceNumberLabel!;
    }

    case "efficiency": {
      return globals.elements.efficiencyNumberLabel!;
    }

    case "minEfficiency": {
      return globals.elements.efficiencyMinNeededLabel!;
    }
  }
}
