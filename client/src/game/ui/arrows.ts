// Arrows are used to show which cards are touched by a clue
// (and to highlight things in shared replays)

import Konva from "konva";
import * as KonvaContext from "konva/types/Context";
import { KonvaEventObject } from "konva/types/Node";
import { getCharacter } from "../data/gameData";
import { cardRules, variantRules } from "../rules";
import Clue from "../types/Clue";
import ClueType from "../types/ClueType";
import { STACK_BASE_RANK } from "../types/constants";
import ReplayActionType from "../types/ReplayActionType";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import Suit from "../types/Suit";
import CardLayout from "./CardLayout";
import { ARROW_COLOR, CARD_ANIMATION_LENGTH } from "./constants";
import Arrow from "./controls/Arrow";
import NodeWithTooltip from "./controls/NodeWithTooltip";
import StrikeSquare from "./controls/StrikeSquare";
import drawPip from "./drawPip";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import * as konvaHelpers from "./konvaHelpers";

export function hideAll(): void {
  let changed = false;
  for (const arrow of globals.elements.arrows) {
    if (arrow.pointingTo !== null) {
      changed = true;
      arrow.pointingTo = null;
      arrow.hide();
      if (arrow.tween !== null) {
        arrow.tween.destroy();
        arrow.tween = null;
      }
    }
  }
  if (changed) {
    globals.layers.arrow.batchDraw();
  }
}

export function set(
  i: number,
  element: Konva.Node | null,
  giver: number | null,
  clue: Clue | null,
): void {
  // Show the arrow
  const arrow = globals.elements.arrows[i];
  arrow.pointingTo = element;
  arrow.show();
  arrow.moveToTop();

  // Figure out whether the arrow should be inverted or not
  let rot = 0;
  if (
    element instanceof HanabiCard &&
    !cardRules.isPlayed(element.state) &&
    !cardRules.isDiscarded(element.state) &&
    element.state.rank !== STACK_BASE_RANK
  ) {
    if (
      element.parent &&
      element.parent.parent &&
      element.parent.parent instanceof CardLayout
    ) {
      rot = element.parent.parent.origRotation;
    }
    if (
      (!globals.lobby.settings.keldonMode &&
        element.state.location === globals.metadata.ourPlayerIndex) ||
      (globals.lobby.settings.keldonMode &&
        element.state.location !== globals.metadata.ourPlayerIndex &&
        cardRules.isInPlayerHand(element.state))
    ) {
      // In BGA mode, invert the arrows on our hand
      // (so that it doesn't get cut off by the top of the screen)
      // In Keldon mode, invert the arrows for all other players
      rot += 180;
    }
  }
  arrow.rotation(rot);

  // We want the text to always be right-side up (e.g. have a rotation of 0)
  arrow.text.rotation(360 - rot);

  // Set the arrow features
  if (clue === null) {
    // This is a highlight arrow
    const color = ARROW_COLOR.HIGHLIGHT;
    arrow.base.stroke(color);
    arrow.base.fill(color);

    // Don't draw the circle
    arrow.circle.hide();
    arrow.text.hide();
  } else {
    // This is a clue arrow
    let color;
    if (element instanceof HanabiCard && element.state.numPositiveClues >= 2) {
      // Cards that are re-clued use a different color
      color = ARROW_COLOR.RETOUCHED;
    } else {
      // Freshly touched cards use the default color
      color = ARROW_COLOR.DEFAULT;
    }
    arrow.base.stroke(color);
    arrow.base.fill(color);

    // Clue arrows have a circle that shows the type of clue given
    let giverCharacterName = "";
    if (giver !== null) {
      const giverCharacterID = globals.metadata.characterAssignments[giver];
      if (giverCharacterID !== null) {
        const giverCharacter = getCharacter(giverCharacterID);
        giverCharacterName = giverCharacter.name;
      }
    }
    if (
      variantRules.isDuck(globals.variant) ||
      (giverCharacterName === "Quacker" && !globals.state.finished)
    ) {
      // Don't show the circle in variants where the clue types are supposed to be hidden
      arrow.circle.hide();
      arrow.text.hide();
    } else {
      arrow.circle.show();
      if (clue.type === ClueType.Color) {
        arrow.text.hide();

        // The circle for color clues should have a black border and a fill matching the color
        arrow.circle.stroke("black");
        if (variantRules.isCowAndPig(globals.variant)) {
          // The specific clue color is hidden in "Cow & Pig" variants
          arrow.circle.fill("white");
        } else {
          const clueColor = clue.value;
          if (typeof clueColor === "number") {
            throw new Error("The clue value was a number for a color clue.");
          }
          arrow.circle.fill(clueColor.fill);

          // Additionally, draw the suit pip in colorblind mode
          if (globals.lobby.settings.colorblindMode) {
            if (typeof clue.value === "number") {
              throw new Error("The clue value was a number for a color clue.");
            }
            const matchingSuits = globals.variant.suits.filter((suit: Suit) =>
              suit.clueColors.includes(clueColor),
            );
            if (matchingSuits.length === 1) {
              arrow.suitPip!.sceneFunc((ctx: KonvaContext.Context) => {
                drawPip(
                  (ctx as unknown) as CanvasRenderingContext2D,
                  matchingSuits[0],
                );
              });
              arrow.suitPip!.show();
            } else {
              arrow.suitPip!.hide();
            }
          }
        }
      } else if (clue.type === ClueType.Rank) {
        let text = clue.value.toString();
        if (variantRules.isCowAndPig(globals.variant)) {
          text = "#";
        }
        arrow.text.text(text);
        arrow.text.show();

        // The circle for number clues should have a white border and a black fill
        arrow.circle.stroke("white");
        arrow.circle.fill("black");

        if (globals.lobby.settings.colorblindMode) {
          arrow.suitPip!.hide();
        }
      }
    }
  }

  if (arrow.tween !== null) {
    arrow.tween.destroy();
    arrow.tween = null;
  }
  if (globals.animateFast || giver === null) {
    const pos = getPos(element!, rot);
    arrow.setAbsolutePosition(pos);
  } else {
    const visibleSegment = globals.state.visibleState!.turn.segment!;
    animate(arrow, element as HanabiCard, rot, giver, visibleSegment);
  }
  if (!globals.animateFast) {
    globals.layers.arrow.batchDraw();
  }
}

function getPos(element: Konva.Node, rot: number) {
  // Start by using the absolute position of the element
  const pos = element.getAbsolutePosition();

  if (element instanceof HanabiCard) {
    // Order = 0 through N
    // If we set the arrow at the absolute position of a card, it will point to the exact center
    // Instead, back it off a little bit (accounting for the rotation of the hand)
    const winH = globals.stage.height();
    const distance = -0.075 * winH;
    const rotRadians = (-rot / 180) * Math.PI;
    pos.x += distance * Math.sin(rotRadians); // sin(x) = cos(x + (PI * 3 / 2))
    pos.y -= distance * -Math.cos(rotRadians); // -cos(x) = sin(x + (PI * 3 / 2))
  } else if (element === globals.elements.deck) {
    // Order = ReplayArrowOrder.Deck (-1)
    pos.x += element.width() * 0.5;
    pos.y += element.height() * 0.1;
  } else if (
    // Order = ReplayArrowOrder.Turn (-2)
    element === globals.elements.turnNumberLabel ||
    // Order = ReplayArrowOrder.Score (-3)
    element === globals.elements.scoreNumberLabel ||
    // Order = Local arrow only (for "Throw It in a Hole" variants)
    element === globals.elements.playsNumberLabel ||
    // Order = ReplayArrowOrder.Clues (-5)
    element === globals.elements.cluesNumberLabel
  ) {
    pos.x += element.width() * 0.15;
  } else if (element === globals.elements.maxScoreNumberLabel) {
    // Order = ReplayArrowOrder.MaxScore (-4)
    pos.x += element.width() * 0.7;
  } else if (element instanceof StrikeSquare) {
    // Order = ReplayArrowOrder.Strike1 (-6)
    // Order = ReplayArrowOrder.Strike2 (-7)
    // Order = ReplayArrowOrder.Strike3 (-8)
    pos.x += element.width() * 0.5;
  } else {
    // Order = ReplayArrowOrder.Pace (-9)
    // Order = ReplayArrowOrder.Efficiency (-10)
    // Order = ReplayArrowOrder.MinEfficiency (-11)
    // The type of Konva.Text.width is "any" for some reason
    const textElement = element as Konva.Text;
    const width = textElement.measureSize(textElement.text()).width as number;
    if (typeof width !== "number") {
      throw new Error("The width of the element was not a number.");
    }
    pos.x += width / 2;
  }

  if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) {
    throw new Error(
      "Failed to get the position for the element when drawing an arrow.",
    );
  }

  return pos;
}

// Animate the arrow to fly from the player who gave the clue to the card
function animate(
  arrow: Arrow,
  card: HanabiCard,
  rot: number,
  giver: number,
  segment: number,
) {
  // We can't continue arrow animations if we are on the wrong segment
  // because arrows are reused and this causes glitches
  const visibleSegment = globals.state.visibleState!.turn.segment!;
  if (visibleSegment !== segment) {
    return;
  }

  // Don't bother doing the animation if the card is no longer part of a hand
  // (which can happen when jumping quickly through a replay)
  if (
    card === undefined ||
    card.parent === undefined ||
    card.parent === null ||
    card.parent.parent === undefined ||
    card.parent.parent === null
  ) {
    return;
  }

  // Don't bother doing the animation if we have hidden the arrow in the meantime
  // (which can happen when jumping quickly through a replay)
  if (arrow.pointingTo === null) {
    return;
  }

  // Delay the animation if the card is currently tweening to avoid buggy behavior
  if (card.tweening) {
    arrow.hide();
    card.waitForTweening(() => {
      animate(arrow, card, rot, giver, segment);
    });
    return;
  }
  arrow.show();

  // Start the arrow at the center position of the clue giver's hand
  const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();
  arrow.setAbsolutePosition(centerPos);

  // Calculate the position of the final arrow destination
  // (this must be done after the card is finished tweening)
  const pos = getPos(card, rot);

  konvaHelpers.animate(arrow, {
    duration: CARD_ANIMATION_LENGTH,
    x: pos.x,
    y: pos.y,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    easing: Konva.Easings.EaseOut,
  });
}

export function click(
  event: KonvaEventObject<MouseEvent>,
  order: number,
): void {
  // "event.evt.buttons" is always 0 here
  if (event.evt.button !== 2) {
    // We only care about right-clicks
    return;
  }

  // Don't allow followers in a shared replay to summon arrows because it could be misleading as to
  // who the real replay leader is
  if (
    globals.state.replay.shared !== null &&
    !globals.state.replay.shared.amLeader
  ) {
    return;
  }

  // Don't allow shared replay leaders to summon arrows when they are not in shared turns because it
  // could be misleading as to whether or not the arrows are being shown to the other players
  if (
    globals.state.replay.shared !== null &&
    !globals.state.replay.shared.useSharedSegments
  ) {
    return;
  }

  toggle(order);
}

// This toggles the "highlight" arrow on a particular element
export function toggle(order: number, alwaysShow = false): void {
  // Get the element corresponding to the "order" number
  const element = getElementFromOrder(order);

  // If we are showing an arrow on a card that is currently tweening,
  // delay showing it until the tween is finished
  if (element instanceof HanabiCard && element.tweening) {
    element.waitForTweening(() => toggle(order, alwaysShow));
    return;
  }

  const arrow = globals.elements.arrows[0];
  const show =
    alwaysShow ||
    arrow.pointingTo !== element ||
    arrow.base.fill() !== ARROW_COLOR.HIGHLIGHT;
  hideAll();
  if (show) {
    set(0, element, null, null);

    // If this element has a tooltip and it is open, close it
    if (
      element !== null &&
      element.tooltipName !== undefined &&
      element.tooltipName !== ""
    ) {
      const tooltip = $(`#tooltip-${element.tooltipName}`);
      tooltip.tooltipster("close");
    }
  }

  if (
    globals.state.replay.shared !== null &&
    globals.state.replay.shared.amLeader &&
    globals.state.replay.shared.useSharedSegments
  ) {
    globals.lobby.conn!.send("replayAction", {
      tableID: globals.lobby.tableID,
      type: ReplayActionType.Arrow,
      order: show ? order : ReplayArrowOrder.Nothing,
    });
  }
}

function getElementFromOrder(order: number): NodeWithTooltip {
  if (order >= 0) {
    // This is an arrow for a card
    // The order corresponds to the card's order in the deck
    return getCardOrStackBase(order);
  }

  switch (order) {
    case ReplayArrowOrder.Deck: {
      return globals.elements.deck!;
    }
    case ReplayArrowOrder.Turn: {
      return globals.elements.turnNumberLabel!;
    }
    case ReplayArrowOrder.Score: {
      return globals.elements.scoreNumberLabel!;
    }
    case ReplayArrowOrder.MaxScore: {
      return globals.elements.maxScoreNumberLabel!;
    }
    case ReplayArrowOrder.Clues: {
      return globals.elements.cluesNumberLabel!;
    }
    case ReplayArrowOrder.Pace: {
      return globals.elements.paceNumberLabel!;
    }
    case ReplayArrowOrder.Efficiency: {
      return globals.elements.efficiencyNumberLabel!;
    }
    case ReplayArrowOrder.MinEfficiency: {
      return globals.elements.efficiencyMinNeededLabel!;
    }
    default: {
      throw new Error(
        `Failed to get the element corresponding to arrow order ${order}.`,
      );
    }
  }
}
