// Arrows are used to show which cards are touched by a clue
// (and to highlight things in shared replays)

import Konva from 'konva';
import { KonvaEventObject } from 'konva/types/Node';
import {
  ARROW_COLOR,
} from '../../constants';
import * as variantRules from '../rules/variant';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import { STACK_BASE_RANK } from '../types/constants';
import ReplayActionType from '../types/ReplayActionType';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import Suit from '../types/Suit';
import CardLayout from './CardLayout';
import Arrow from './controls/Arrow';
import NodeWithTooltip from './controls/NodeWithTooltip';
import drawPip from './drawPip';
import globals from './globals';
import HanabiCard from './HanabiCard';

export const hideAll = () => {
  let changed = false;
  for (const arrow of globals.elements.arrows) {
    if (arrow.pointingTo !== null) {
      changed = true;
      arrow.pointingTo = null;
      arrow.visible(false);
    }
  }
  if (!globals.animateFast && changed) {
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
    && !element.state.isPlayed
    && !element.state.isDiscarded
    && element.state.rank !== STACK_BASE_RANK
  ) {
    if (element.parent && element.parent.parent && element.parent.parent instanceof CardLayout) {
      rot = element.parent.parent.origRotation;
    }
    if (
      (
        !globals.lobby.settings.keldonMode
        && element.state.holder === globals.playerUs
      ) || (
        globals.lobby.settings.keldonMode
        && (element.state.holder !== globals.playerUs && element.state.holder !== null)
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
    if (
      variantRules.isDuck(globals.variant)
      || (globals.characterAssignments[giver!] === 'Quacker' && !globals.replay)
    ) {
      // Don't show the circle in variants where the clue types are supposed to be hidden
      arrow.circle.hide();
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
              arrow.suitPip!.visible(true);
            } else {
              arrow.suitPip!.visible(false);
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
          arrow.suitPip!.visible(false);
        }
      }
    }
  }

  if (arrow.tween) {
    arrow.tween.destroy();
  }
  if (globals.animateFast || giver === null) {
    const pos = getPos(element!, rot);
    arrow.setAbsolutePosition(pos);
  } else {
    animate(arrow, element as HanabiCard, rot, giver, globals.turn);
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
  } else if (element === globals.elements.cluesNumberLabel) {
    pos.x += element.width() * 0.15;
  } else if (element === globals.elements.deck) {
    pos.x += element.width() * 0.5;
    pos.y += element.height() * 0.1;
  } else {
    pos.x += element.width() / 3;
  }

  if (Number.isNaN(pos.x) || Number.isNaN(pos.y)) {
    throw new Error('Failed to get the position for the element when drawing an arrow.');
  }

  return pos;
};

// Animate the arrow to fly from the player who gave the clue to the card
const animate = (arrow: Arrow, card: HanabiCard, rot: number, giver: number, turn: number) => {
  // Don't bother doing the animation if it is delayed by more than one turn
  if (globals.turn > turn + 1) {
    return;
  }

  // Don't bother doing the animation if the card is no longer part of a hand
  // (which can happen rarely when jumping quickly through a replay)
  if (!card.parent || !card.parent.parent) {
    return;
  }

  // Delay the animation if the card is currently tweening to avoid buggy behavior
  if (card.tweening) {
    arrow.hide();
    setTimeout(() => {
      animate(arrow, card, rot, giver, turn);
    }, 20);
    return;
  }
  arrow.show();

  // Start the arrow at the center position of the clue giver's hand
  const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();
  arrow.setAbsolutePosition(centerPos);

  // Calculate the position of the final arrow destination
  // (this must be done after the card is finished tweening)
  const pos = getPos(card, rot);

  arrow.tween = new Konva.Tween({
    node: arrow,
    duration: 0.5,
    x: pos.x,
    y: pos.y,
    easing: Konva.Easings.EaseOut,
  }).play();
};

export const click = (
  event: KonvaEventObject<MouseEvent>,
  order: ReplayArrowOrder,
  element: any,
) => {
  if (event.evt.button !== 2) { // Right-click
    return;
  }

  if (
    globals.sharedReplay
    && globals.amSharedReplayLeader
    && globals.useSharedTurns
  ) {
    send(order, element);
  } else {
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
  // If the card is currently tweening, delay showing the arrow until the tween is finished
  if (element instanceof HanabiCard && element.tweening) {
    setTimeout(() => {
      toggle(element);
    }, 5);
    return;
  }

  const arrow = globals.elements.arrows[0];
  const show = arrow.pointingTo !== element || arrow.base.fill() !== ARROW_COLOR.HIGHLIGHT;
  hideAll();
  if (show) {
    set(0, element, null, null);

    // If this element has a tooltip and it is open, close it
    if (element && element.tooltipName) {
      const tooltip = $(`#tooltip-${element.tooltipName}`);
      tooltip.tooltipster('close');
    }
  }
};
