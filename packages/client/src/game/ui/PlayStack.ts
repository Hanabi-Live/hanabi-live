// PlayStack represents the stack in the middle of the table for each suit. It is composed of
// LayoutChild objects.

import { STACK_BASE_RANK } from "@hanabi/data";
import Konva from "konva";
import * as variantRules from "../rules/variant";
import globals from "./globals";
import { animate } from "./konvaHelpers";
import LayoutChild from "./LayoutChild";

export default class PlayStack extends Konva.Group {
  addChild(layoutChild: LayoutChild): void {
    const pos = layoutChild.getAbsolutePosition();
    this.add(layoutChild as unknown as Konva.Group);
    layoutChild.setAbsolutePosition(pos);
    this.doLayout();
  }

  doLayout(): void {
    const lh = this.height();

    const layoutChildren = this.children.toArray() as LayoutChild[];
    const layoutChild = layoutChildren[layoutChildren.length - 1]!;
    const scale = lh / layoutChild.height();
    const stackBase = layoutChild.card.state.rank === STACK_BASE_RANK;

    // Hide cards in "Throw It in a Hole" variants.
    const opacity =
      variantRules.isThrowItInAHole(globals.variant) &&
      globals.state.playing && // Revert to the normal behavior for spectators of ongoing games
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
    const stackLength = this.children.length;

    for (let i = 0; i < stackLength; i++) {
      const layoutChild = this.children[i] as unknown as LayoutChild;
      if (layoutChild.tween !== null) {
        // Don't hide anything if one of the cards on the stack is still tweening.
        return;
      }
    }

    // Hide all of the cards.
    for (let i = 0; i < stackLength - 1; i++) {
      this.children[i]!.hide();
    }

    // Show the top card.
    if (stackLength > 0) {
      this.children[stackLength - 1]!.show();
    }

    globals.layers.card.batchDraw();
  }
}
