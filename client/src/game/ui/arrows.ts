// Arrows are used to show which cards are touched by a clue
// (and to highlight things in shared replays)

import Konva from 'konva';
import { KonvaEventObject } from 'konva/types/Node';
import { getCharacter } from '../data/gameData';
import { cardRules, variantRules } from '../rules';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import { STACK_BASE_RANK } from '../types/constants';
import ReplayActionType from '../types/ReplayActionType';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import Suit from '../types/Suit';
import CardLayout from './CardLayout';
import { ARROW_COLOR, CARD_ANIMATION_LENGTH } from './constants';
import Arrow from './controls/Arrow';
import NodeWithTooltip from './controls/NodeWithTooltip';
import StrikeSquare from './controls/StrikeSquare';
import drawPip from './drawPip';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as konvaHelpers from './konvaHelpers';

export const hideAll = () => {
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
};

export const set = (
  i: number,
  element: Konva.Node | null,
  giver: number | null,
  clue: Clue | null,
) => {
  // Show the arrow
  const arrow = globals.elements.arrows[i];
  arrow.pointingTo = element;
  arrow.show();
  arrow.moveToTop();

  // Figure out whether the arrow should be inverted or not
  let rot = 0;
  if (
    element instanceof HanabiCard
    && !cardRules.isPlayed(element.state)
    && !cardRules.isDiscarded(element.state)
    && element.state.rank !== STACK_BASE_RANK
  ) {
    if (element.parent && element.parent.parent && element.parent.parent instanceof CardLayout) {
      rot = element.parent.parent.origRotation;
    }
    if (
      (
        !globals.lobby.settings.keldonMode
        && element.state.location === globals.metadata.ourPlayerIndex
      ) || (
        globals.lobby.settings.keldonMode
        && (
          element.state.location !== globals.metadata.ourPlayerIndex
          && cardRules.isInPlayerHand(element.state)
        )
      )
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
    let giverCharacterName = '';
    if (giver !== null) {
      const giverCharacterID = globals.metadata.characterAssignments[giver!];
      if (giverCharacterID !== null) {
        const giverCharacter = getCharacter(giverCharacterID);
        giverCharacterName = giverCharacter.name;
      }
    }
    if (
      variantRules.isDuck(globals.variant)
      || (giverCharacterName === 'Quacker' && !globals.state.finished)
    ) {
      // Don't show the circle in variants where the clue types are supposed to be hidden
      arrow.circle.hide();
      arrow.text.hide();
    } else {
      arrow.circle.show();
      if (clue.type === ClueType.Color) {
        arrow.text.hide();

        // The circle for color clues should have a black border and a fill matching the color
        arrow.circle.stroke('black');
        if (variantRules.isCowAndPig(globals.variant)) {
          // The specific clue color is hidden in "Cow & Pig" variants
          arrow.circle.fill('white');
        } else {
          const clueColor = clue.value;
          if (typeof clueColor === 'number') {
            throw new Error('The clue value was a number for a color clue.');
          }
          arrow.circle.fill(clueColor.fill);

          // Additionally, draw the suit pip in colorblind mode
          if (globals.lobby.settings.colorblindMode) {
            if (typeof clue.value === 'number') {
              throw new Error('The clue value was a number for a color clue.');
            }
            const matchingSuits = globals.variant.suits.filter(
              (suit: Suit) => (suit.clueColors.includes(clueColor)),
            );
            if (matchingSuits.length === 1) {
              arrow.suitPip!.sceneFunc((ctx: any) => {
                drawPip(ctx, matchingSuits[0]);
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
          text = '#';
        }
        arrow.text.text(text);
        arrow.text.show();

        // The circle for number clues should have a white border and a black fill
        arrow.circle.stroke('white');
        arrow.circle.fill('black');

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
};

const getPos = (element: Konva.Node, rot: number) => {
  // Start by using the absolute position of the element
  const pos = element.getAbsolutePosition();

  if (element instanceof HanabiCard) {
    // If we set the arrow at the absolute position of a card, it will point to the exact center
    // Instead, back it off a little bit (accounting for the rotation of the hand)
    const winH = globals.stage.height();
    const distance = -0.075 * winH;
    const rotRadians = (rot / 180) * Math.PI;
    pos.x -= Math.sin(rotRadians) * distance;
    pos.y += Math.cos(rotRadians) * distance;
  } else if (element === globals.elements.deck) {
    pos.x += element.width() * 0.5;
    pos.y += element.height() * 0.1;
  } else if (
    element === globals.elements.turnNumberLabel
    || element === globals.elements.scoreNumberLabel
    || element === globals.elements.playsNumberLabel
    || element === globals.elements.cluesNumberLabel
  ) {
    pos.x += element.width() * 0.15;
  } else if (element === globals.elements.maxScoreNumberLabel) {
    pos.x += element.width() * 0.7;
  } else if (element instanceof StrikeSquare) {
    pos.x += element.width() * 0.5;
  } else {
    pos.x += element.width() / 3;
  }

  if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) {
    throw new Error('Failed to get the position for the element when drawing an arrow.');
  }

  return pos;
};

// Animate the arrow to fly from the player who gave the clue to the card
const animate = (arrow: Arrow, card: HanabiCard, rot: number, giver: number, segment: number) => {
  // Don't bother doing the animation if it is delayed by more than one segment
  const visibleSegment = globals.state.visibleState!.turn.segment!;
  if (visibleSegment > segment + 1 || visibleSegment < segment - 1) {
    return;
  }

  // Don't bother doing the animation if the card is no longer part of a hand
  // (which can happen when jumping quickly through a replay)
  if (
    card === undefined
    || card.parent === undefined
    || card.parent === null
    || card.parent.parent === undefined
    || card.parent.parent === null
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
    easing: Konva.Easings.EaseOut,
  });
};

export const click = (
  event: KonvaEventObject<MouseEvent>,
  order: ReplayArrowOrder,
  element: any,
) => {
  if (event.evt.buttons !== 2) { // Right-click
    return;
  }

  if (
    globals.state.replay.shared !== null
    && globals.state.replay.shared.amLeader
    && globals.state.replay.shared.useSharedSegments
  ) {
    // The shared replay leader is clicking on a UI element, so send this action to the server
    send(order, element);
  } else if (globals.state.replay.shared === null) {
    // Otherwise, toggle the arrow locally
    // However, we don't want to enable this functionality in shared replays because it could be
    // misleading as to who the real replay leader is
    toggle(element);
  }
};

export const send = (order: ReplayArrowOrder, element: any) => {
  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.Arrow,
    order,
  });

  // Draw the arrow manually so that we don't have to wait for the client to server round-trip
  toggle(element);
};

// This toggles the "highlight" arrow on a particular element
export const toggle = (element: NodeWithTooltip | null) => {
  // If we are showing an arrow on a card that is currently tweening,
  // delay showing it until the tween is finished
  if (element instanceof HanabiCard && element.tweening) {
    element.waitForTweening(() => toggle(element));
    return;
  }

  const arrow = globals.elements.arrows[0];
  const show = arrow.pointingTo !== element || arrow.base.fill() !== ARROW_COLOR.HIGHLIGHT;
  hideAll();
  if (show) {
    set(0, element, null, null);

    // If this element has a tooltip and it is open, close it
    if (element !== null && element.tooltipName !== undefined && element.tooltipName !== '') {
      const tooltip = $(`#tooltip-${element.tooltipName}`);
      tooltip.tooltipster('close');
    }
  }
};
