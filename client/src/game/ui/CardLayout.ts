// CardLayout is an object that represents a player's hand (or a discard pile)
// It is composed of LayoutChild objects

import Konva from 'konva';
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
    this.origRotation = config.rotation ?? 0;
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
      listening: false,
    });
    globals.layers.UI.add(debugRect);
    */
  }

  // The card has a relative position relating to its location
  // (e.g. a player's hand, the play stacks)
  // Use the absolute position so that we can tween it from one location to another without having
  // to worry about the relative position
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
    // Local variables
    const handWidth = this.width();
    const handHeight = this.height();
    const numCards = this.children.length;

    let uw = 0;
    for (let i = 0; i < numCards; i++) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      if (!layoutChild.height()) {
        continue;
      }

      const scale = handHeight / layoutChild.height();
      uw += scale * layoutChild.width();
    }

    let spacingBetweenCards = 0;
    if (numCards > 1) {
      spacingBetweenCards = (handWidth - uw) / (numCards - 1);
    }
    let maxSpacingBetweenCards = 0.04 * uw;
    if (globals.lobby.settings.keldonMode) {
      maxSpacingBetweenCards = 0.025 * uw;
    }
    if (spacingBetweenCards > maxSpacingBetweenCards) {
      spacingBetweenCards = maxSpacingBetweenCards;
    }
    uw += spacingBetweenCards * (numCards - 1);

    let x = 0;
    if (this.align === 'center' && uw < handWidth) {
      x = (handWidth - uw) / 2;
    }
    if (this.reverse) {
      x = handWidth - x;
    }

    for (let i = 0; i < numCards; i++) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      // Ensure this card is not hidden at the bottom of a play stack
      layoutChild.show();

      if (!layoutChild.height()) {
        continue;
      }

      const scale = handHeight / layoutChild.height();

      if (layoutChild.tween !== null) {
        layoutChild.tween.destroy();
        layoutChild.tween = null;
      }

      const card = layoutChild.children[0] as unknown as HanabiCard;
      const newX = x - (this.reverse ? scale * layoutChild.width() : 0);
      if (globals.animateFast) {
        layoutChild.x(newX);
        layoutChild.y(0);
        layoutChild.scaleX(scale);
        layoutChild.scaleY(scale);
        layoutChild.rotation(0);
        layoutChild.opacity(1);
        layoutChild.checkSetDraggable();
        layoutChild.card.setVisualEffect('default');

        card.doMisplayAnimation = false;
      } else {
        // Animate the card going from the deck to the hand
        // (or from the hand to the discard pile)
        // and animate the rest of the cards sliding over
        card.startedTweening();
        const duration = 0.5;
        card.setVisualEffect('default', duration);

        const animateToLayout = () => {
          animate(layoutChild, {
            duration,
            x: newX,
            y: 0,
            scale,
            rotation: 0,
            opacity: 1,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
              card.finishedTweening();
              layoutChild.checkSetDraggable();
            },
          }, !globals.options.speedrun);
        };

        if (card.doMisplayAnimation) {
          // If this card just misplayed, do a special animation
          card.doMisplayAnimation = false;

          const suit = globals.variant.suits[card.state.suitIndex!];
          const playStack = globals.elements.playStacks.get(suit)!;
          const pos = this.getAbsolutePosition();
          const playStackPos = playStack.getAbsolutePosition();

          animate(layoutChild, {
            duration,
            x: playStackPos.x - pos.x,
            y: playStackPos.y - pos.y,
            scale: playStack.height() * scale / handHeight,
            rotation: 0,
            opacity: 1,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
              layoutChild.rotation(360);
              animateToLayout();
            },
          }, !globals.options.speedrun);
        } else {
          animateToLayout();
        }
      }

      x += ((scale * layoutChild.width()) + spacingBetweenCards) * (this.reverse ? -1 : 1);
    }
  }

  checkSetDraggableAll() {
    this.children.each((layoutChild) => {
      (layoutChild as unknown as LayoutChild).checkSetDraggable();
    });
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
}
