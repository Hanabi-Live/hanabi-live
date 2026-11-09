import { assertDefined, eRange } from "complete-common";
import Konva from "konva";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import { CARD_ANIMATION_LENGTH_SECONDS } from "./constants";
import { animate, degreesToRadians } from "./konvaHelpers";
import { startMisplayAnimation } from "./misplayAnimation";

/** The largest gap between adjacent cards in a hand, as a fraction of the total card width. */
const MAX_CARD_SPACING = 0.04;

/** The largest gap between adjacent cards in Keldon mode, as a fraction of the total card width. */
const MAX_CARD_SPACING_KELDON = 0.025;

/** Represents a player's hand (or a discard pile). It is composed of `LayoutChild` objects. */
export class CardLayout extends Konva.Group {
  private readonly align: string;
  private readonly reverse: boolean;
  origRotation: number;
  empathy: boolean;

  constructor(config: Konva.ContainerConfig) {
    super(config);

    // Class variables.
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    this.align = (config["align"] || "left") as string;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    this.reverse = (config["reverse"] || false) as boolean;
    this.origRotation = config.rotation ?? 0;
    this.empathy = false;

    assertDefined(config.width, "A width was not defined for a CardLayout.");
    assertDefined(config.height, "A height was not defined for a CardLayout.");

    // Debug rectangle (uncomment to show the size of the hand).
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
  // (e.g. a player's hand, the play stacks). Use the absolute position so that we can tween it from
  // one location to another without having to worry about the relative position.
  addChild(child: LayoutChild): void {
    const pos = child.getAbsolutePosition();
    this.add(child);
    child.setAbsolutePosition(pos);
    if (this.empathy) {
      child.card.setEmpathy(true);
    }
    this.doLayout();
  }

  override _setChildrenIndices(): void {
    Konva.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
  }

  doLayout(): void {
    const handWidth = this.width();
    const handHeight = this.height();
    const numCards = this.children.length;

    let uw = 0;
    for (const i of eRange(numCards)) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      if (layoutChild.height() <= 0) {
        continue;
      }

      const scale = handHeight / layoutChild.height();
      uw += scale * layoutChild.width();
    }

    let spacingBetweenCards = 0;
    if (numCards > 1) {
      spacingBetweenCards = (handWidth - uw) / (numCards - 1);
    }
    const maxSpacingBetweenCards =
      (globals.lobby.settings.keldonMode
        ? MAX_CARD_SPACING_KELDON
        : MAX_CARD_SPACING) * uw;
    if (spacingBetweenCards > maxSpacingBetweenCards) {
      spacingBetweenCards = maxSpacingBetweenCards;
    }
    uw += spacingBetweenCards * (numCards - 1);

    let x = 0;
    if (this.align === "center" && uw < handWidth) {
      x = (handWidth - uw) / 2;
    }
    if (this.reverse) {
      x = handWidth - x;
    }

    for (const i of eRange(numCards)) {
      const layoutChild = this.children[i] as unknown as LayoutChild;

      // Ensure this card is not hidden at the bottom of a play stack.
      layoutChild.show();

      if (layoutChild.height() <= 0) {
        continue;
      }

      const scale = handHeight / layoutChild.height();
      const newX = x - (this.reverse ? scale * layoutChild.width() : 0);
      if (globals.animateFast) {
        layoutChild.doMisplayAnimation = false;
      }

      if (layoutChild.tween !== null) {
        layoutChild.tween.destroy();
        layoutChild.tween = null;
      }
      layoutChild.stopMisplayAnimation();

      // Animate the card going:
      // - from the deck to a player's hand (or vice versa)
      // - or leaving the hand to the discard pile (or vice versa)

      // Also, animate the rest of the cards sliding over.
      layoutChild.card.startedTweening(newX, scale);
      layoutChild.card.setRaiseAndShadowOffset();

      // eslint-disable-next-line func-style
      const animateToLayout = () => {
        animate(
          layoutChild,
          {
            duration: CARD_ANIMATION_LENGTH_SECONDS,
            x: newX,
            y: 0,
            scale,
            rotation: 0,
            opacity: 1,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
              layoutChild.card.finishedTweening();
              layoutChild.checkSetDraggable();
            },
          },
          !globals.options.speedrun,
        );
      };

      if (layoutChild.doMisplayAnimation) {
        // If this card just misplayed, do a special animation.
        layoutChild.doMisplayAnimation = false;
        layoutChild.misplayAnimation = startMisplayAnimation(
          layoutChild,
          { x: newX, y: 0, scale },
          () => {
            layoutChild.misplayAnimation = null;
            layoutChild.card.finishedTweening();
            layoutChild.checkSetDraggable();
          },
        );
      } else {
        animateToLayout();
      }

      x +=
        (scale * layoutChild.width() + spacingBetweenCards)
        * (this.reverse ? -1 : 1);
    }
  }

  checkSetDraggableAll(): void {
    for (const layoutChild of this.children) {
      (layoutChild as unknown as LayoutChild).checkSetDraggable();
    }
  }

  getAbsoluteCenterPos(): { x: number; y: number } {
    const pos = this.getAbsolutePosition(); // The top-left-hand corner

    const w = this.width();
    const h = this.height();

    // The rotation comes from Konva in clockwise degrees but we need to convert it to
    // counter-clockwise radians.
    const rot = degreesToRadians(-this.origRotation);

    pos.x += (w / 2) * Math.cos(rot);
    pos.y -= (w / 2) * Math.sin(rot);
    pos.x += (h / 2) * Math.sin(rot); // sin(x) = cos(x - (PI / 2))
    pos.y -= (h / 2) * -Math.cos(rot); // -cos(x) = sin(x - (PI / 2))

    return pos;
  }

  setEmpathy(enabled: boolean): void {
    if (enabled === this.empathy) {
      // No change
      return;
    }

    this.empathy = enabled;
    for (const layoutChild of this.children) {
      // The first Konva child is not guaranteed to be the card itself.
      (layoutChild as unknown as LayoutChild).card.setEmpathy(enabled);
    }
  }
}
