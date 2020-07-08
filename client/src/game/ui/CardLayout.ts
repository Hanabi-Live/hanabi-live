// CardLayout is an object that represents a player's hand (or a discard pile)
// It is composed of LayoutChild objects

import Konva from 'konva';
import * as cardRules from '../rules/card';
import globals from './globals';
import HanabiCard from './HanabiCard';
import { animate } from './konvaHelpers';
import LayoutChild from './LayoutChild';

export default class CardLayout extends Konva.Group {
  private align: string;
  private reverse: boolean;
  origRotation: number;
  empathy: boolean;

  constructor(config: Konva.ContainerConfig) {
    super(config);

    // Class variables
    this.align = (config.align || 'left') as string;
    this.reverse = (config.reverse || false) as boolean;
    this.origRotation = config.rotation || 0;
    this.empathy = false;

    if (config.width === undefined) {
      throw new Error('A width was not defined for a CardLayout.');
    }
    if (config.height === undefined) {
      throw new Error('A height was not defined for a CardLayout.');
    }

    // Debug rectangle (uncomment to show the size of the hand)
    /*
    const debugRect = new Konva.Rect({
      x: config.x,
      y: config.y,
      width: config.width,
      height: config.height,
      fill: 'black',
      rotation: config.rotation,
    });
    globals.layers.UI.add(debugRect);
    */
  }

  addChild(child: LayoutChild) {
    const pos = child.getAbsolutePosition();
    this.add(child as any);
    child.setAbsolutePosition(pos);
    this.doLayout();
  }

  _setChildrenIndices() {
    Konva.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
  }

  doLayout() {
    let uw = 0;
    let dist = 0;
    let x = 0;

    const lw = this.width();
    const lh = this.height();

    const n = this.children.length;
    for (let i = 0; i < n; i++) {
      const node = this.children[i] as unknown as LayoutChild;

      if (!node.height()) {
        continue;
      }

      const scale = lh / node.height();
      uw += scale * node.width();
    }

    if (n > 1) {
      dist = (lw - uw) / (n - 1);
    }
    const maximumCardSpacing = 0.02 * uw;
    if (dist > maximumCardSpacing) {
      dist = maximumCardSpacing;
    }
    uw += dist * (n - 1);

    if (this.align === 'center' && uw < lw) {
      x = (lw - uw) / 2;
    }
    if (this.reverse) {
      x = lw - x;
    }

    const storedPostAnimationLayout = globals.postAnimationLayout;
    for (let i = 0; i < n; i++) {
      const node = this.children[i] as unknown as LayoutChild;

      if (!node.height()) {
        continue;
      }

      const scale = lh / node.height();

      if (node.tween !== null) {
        node.tween.destroy();
        node.tween = null;
      }

      const newX = x - (this.reverse ? scale * node.width() : 0);
      if (globals.animateFast) {
        node.x(newX);
        node.y(0);
        node.scaleX(scale);
        node.scaleY(scale);
        node.rotation(0);
        node.checkSetDraggable();
      } else {
        // Animate the card going from the deck to the hand
        // (or from the hand to the discard pile)
        // and animate the rest of the cards sliding over
        const card = node.children[0] as unknown as HanabiCard;
        card.tweening = true;

        const animateToLayout = () => {
          animate(node, {
            duration: 0.5,
            x: newX,
            y: 0,
            scale,
            rotation: 0,
            opacity: 1,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
              if (!card || !node) {
                return;
              }
              card.tweening = false;
              node.checkSetDraggable();
              if (!storedPostAnimationLayout) {
                return;
              }
              storedPostAnimationLayout();
            },
          });
        };

        if (card.doMisplayAnimation) {
          // If this card just misplayed, do a special animation
          card.doMisplayAnimation = false;

          const suit = globals.variant.suits[card.state.suitIndex!];
          const playStack = globals.elements.playStacks.get(suit)!;
          const pos = this.getAbsolutePosition();
          const playStackPos = playStack.getAbsolutePosition();

          animate(node, {
            duration: 0.5,
            x: playStackPos.x - pos.x,
            y: playStackPos.y - pos.y,
            scale: playStack.height() * scale / lh,
            rotation: 0,
            opacity: 1,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
              node.rotation(360);
              animateToLayout();
            },
          });
        } else {
          animateToLayout();
        }
      }

      x += ((scale * node.width()) + dist) * (this.reverse ? -1 : 1);
    }
  }

  getAbsoluteCenterPos() {
    const pos = this.getAbsolutePosition(); // The top-left-hand corner

    const w = this.width();
    const h = this.height();

    // The rotation comes from Konva in radians but we need to convert it to degrees
    const rot = this.origRotation / 180 * Math.PI;

    pos.x += (w / 2 * Math.cos(rot)) - (h / 2 * Math.sin(rot));
    pos.y += (w / 2 * Math.sin(rot)) + (h / 2 * Math.cos(rot));

    return pos;
  }

  isLocked() {
    for (const layoutChild of this.children.toArray() as Konva.Node[]) {
      const card = layoutChild.children[0] as HanabiCard;
      if (!cardRules.isClued(card.state)) {
        return false;
      }
    }
    return true;
  }

  getChopIndex() {
    const hand = this.children.toArray() as Konva.Node[];
    for (let i = 0; i < hand.length; i++) {
      const layoutChild = hand[i];
      const card = layoutChild.children[0] as HanabiCard;
      if (!cardRules.isClued(card.state)) {
        return i;
      }
    }

    // Their hand is filled with clued cards,
    // so the chop is considered to be their newest (left-most) card
    return hand.length - 1;
  }
}
