// PlayStack represents the stack in the middle of the table for each suit
// It is composed of LayoutChild objects

import Konva from 'konva';
import * as variantRules from '../rules/variant';
import { STACK_BASE_RANK } from '../types/constants';
import globals from './globals';
import HanabiCard from './HanabiCard';
import LayoutChild from './LayoutChild';

export default class PlayStack extends Konva.Group {
  addChild(child: LayoutChild) {
    const pos = child.getAbsolutePosition();
    this.add(child as any);
    child.setAbsolutePosition(pos);
    this.doLayout();
  }

  doLayout() {
    const lh = this.height();

    for (const node of this.children.toArray() as LayoutChild[]) {
      const scale = lh / node.height();
      const card = node.children[0] as unknown as HanabiCard;
      const stackBase = card.state.rank === STACK_BASE_RANK;
      const opacity = (
        // Hide cards in "Throw It in a Hole" variants
        variantRules.isThrowItInAHole(globals.variant)
        && !globals.replay // Revert to the normal behavior for replays
        && !stackBase // We want the stack bases to always be visible
      ) ? 0 : 1;

      if (globals.animateFast) {
        node.x(0);
        node.y(0);
        node.scaleX(scale);
        node.scaleY(scale);
        node.rotation(0);
        node.opacity(opacity);
        this.hideCardsUnderneathTheTopCard();
      } else {
        // Animate the card leaving the hand to the play stacks
        // (tweening from the hand to the discard pile is handled in
        // the "CardLayout" object)
        card.tweening = true;
        node.tween = new Konva.Tween({
          node,
          duration: 0.8,
          x: 0,
          y: 0,
          scaleX: scale,
          scaleY: scale,
          rotation: 0,
          opacity,
          easing: Konva.Easings.EaseOut,
          onFinish: () => {
            if (!node || !card || !card.parent) {
              return;
            }
            if (card.state.isMisplayed && card.parent.parent) {
              // If the card is misplayed, then tween it to the discard pile
              // We check for "card.parent.parent" to fix the bug where
              // the tween will still finish if the user goes backward in a replay
              // card.animateToDiscardPile(); // TODO
            } else {
              card.tweening = false;
              node.checkSetDraggable();
              this.hideCardsUnderneathTheTopCard();
            }
          },
        }).play();
      }
    }
  }

  hideCardsUnderneathTheTopCard() {
    const stackLength = this.children.length;
    console.log('hideCardsUnderneathTheTopCard', stackLength);

    for (let i = 0; i < stackLength; i++) {
      const node = this.children[i] as unknown as LayoutChild;
      if (node.tween !== null) {
        // Don't hide anything if one of the cards on the stack is still tweening
        return;
      }
    }

    // Hide all of the cards
    for (let i = 0; i < stackLength - 1; i++) {
      this.children[i].hide();
    }

    // Show the top card
    if (stackLength > 0) {
      this.children[stackLength - 1].show();
    }
  }

  getLastPlayedRank() {
    // The PlayStack will always have at least 1 element in it (the "stack base" card)
    const topLayoutChild = this.children[this.children.length - 1];
    const topCard = topLayoutChild.children[0] as HanabiCard;
    return topCard.state.rank;
  }
}
