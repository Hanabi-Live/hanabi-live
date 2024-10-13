import { eRange } from "complete-common";
import Konva from "konva";
import type { LayoutChild } from "./LayoutChild";
import { globals } from "./UIGlobals";
import { animate } from "./konvaHelpers";

/**
 * Represents the stack in the middle of the table for each suit. It is composed of `LayoutChild`
 * objects.
 */
export class PlayStack extends Konva.Group {
  addChild(layoutChild: LayoutChild): void {
    const pos = layoutChild.getAbsolutePosition();
    this.add(layoutChild as unknown as Konva.Group);
    layoutChild.setAbsolutePosition(pos);
    this.doLayout();
  }

  doLayout(): void {
    const lh = this.height();

    const layoutChildren = this.children.toArray() as LayoutChild[];
    const layoutChild = layoutChildren.at(-1)!;
    const scale = lh / layoutChild.height();
    const stackBase = layoutChild.card.isStackBase;

    // Hide cards in "Throw It in a Hole" variants.
    const opacity =
      globals.variant.throwItInAHole &&
      (globals.state.playing || globals.state.shadowing) && // Revert to the normal behavior for spectators of ongoing games
      !globals.state.finished && // Revert to the normal behavior for dedicated replays
      !stackBase // We want the stack bases to always be visible
        ? 0
        : 1;

    // Animate the card leaving the hand to the play stacks (or vice versa). (Tweening from the hand
    // to the discard pile is handled in the "CardLayout" object.)
    layoutChild.card.startedTweening();
    layoutChild.card.setRaiseAndShadowOffset();
    animate(
      layoutChild,
      {
        duration: 0.8,
        x: 0,
        y: 0,
        scale,
        rotation: 0,
        opacity,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          if (layoutChild.tween !== null) {
            layoutChild.tween.destroy();
            layoutChild.tween = null;
          }
          layoutChild.card.finishedTweening();
          layoutChild.checkSetDraggable();
          this.hideCardsUnderneathTheTopCard();
        },
      },
      true,
    );
  }

  hideCardsUnderneathTheTopCard(): void {
    for (const i of eRange(this.children.length)) {
      const layoutChild = this.children[i] as unknown as
        | LayoutChild
        | undefined;
      if (layoutChild === undefined) {
        continue;
      }

      if (layoutChild.tween !== null) {
        // Do not hide anything if one of the cards on the stack is still tweening.
        return;
      }
    }

    // Hide all of the cards.
    for (const i of eRange(this.children.length)) {
      const layoutChild = this.children[i] as unknown as
        | LayoutChild
        | undefined;
      if (layoutChild === undefined) {
        continue;
      }

      layoutChild.hide();
    }

    // Show the top card.
    // eslint-disable-next-line unicorn/prefer-at
    const lastLayoutChild = this.children[this.children.length - 1];
    if (lastLayoutChild !== undefined) {
      lastLayoutChild.show();
    }

    globals.layers.card.batchDraw();
  }
}
