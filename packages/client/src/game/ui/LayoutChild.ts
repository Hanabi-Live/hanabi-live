import type { PlayerIndex } from "@hanabi-live/game";
import { isAtMaxClueTokens } from "@hanabi-live/game";
import Konva from "konva";
import * as modals from "../../modals.ts";
import * as sounds from "../../sounds.ts";
import { SoundType } from "../types/SoundType.ts";
import type { CardLayout } from "./CardLayout.ts";
import type { HanabiCard } from "./HanabiCard.ts";
import type { PlayStack } from "./PlayStack.ts";
import { globals } from "./UiGlobals.ts";
import { confirmPlay } from "./confirmPlay.ts";
import * as cursor from "./cursor.ts";
import type { MisplayAnimation } from "./misplayAnimation.ts";
import { draggablePlayerIndex } from "./reactive/views/draggableView.ts";
import type { StackCompleteAnimation } from "./stackCompleteAnimation.ts";
import * as turn from "./turn.ts";

/** Parent of a `HanabiCard`. It has a `CardLayout` or `PlayStack` parent. */
export class LayoutChild extends Konva.Group {
  tween: Konva.Tween | undefined = undefined;
  doMisplayAnimation = false;
  misplayAnimation: MisplayAnimation | undefined = undefined;
  stackCompleteAnimation: StackCompleteAnimation | undefined = undefined;
  blank = false;

  private readonly _card: HanabiCard;
  get card(): HanabiCard {
    return this._card;
  }

  constructor(child: HanabiCard, config?: Konva.ContainerConfig) {
    super(config);
    this.listening(true);
    this._card = child;
    this.addCard(child);
  }

  private addCard(child: HanabiCard) {
    this.add(child);
    this.width(child.width());
    this.height(child.height());

    const change = (event: unknown) => {
      const changeEvent = event as { oldVal: number; newVal: number };
      if (changeEvent.oldVal === changeEvent.newVal) {
        return;
      }
      this.width(changeEvent.newVal);
      if (this.parent !== null) {
        (this.parent as unknown as CardLayout | PlayStack).doLayout();
      }
    };

    child.on("widthChange", change);
    child.on("heightChange", change);
  }

  stopAnimations(): void {
    if (this.misplayAnimation !== undefined) {
      this.misplayAnimation.stop();
      this.misplayAnimation = undefined;
    }
    if (this.stackCompleteAnimation !== undefined) {
      this.stackCompleteAnimation.stop();
      this.stackCompleteAnimation = undefined;
    }
  }

  // Note that this method cannot be named "setDraggable()", since that would overlap with the Konva
  // function.
  checkSetDraggable(): void {
    if (globals.state.visibleState === undefined) {
      return;
    }

    if (this.shouldBeDraggable(draggablePlayerIndex(globals.state))) {
      this.draggable(true);
      // This method runs repeatedly, so replace the handler instead of adding another copy of it.
      this.off("dragend");
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.on("dragend", this.dragEnd);
    } else {
      this.draggable(false);
      this.off("dragend");
    }

    // Konva warns when asked for the pointer position before the pointer has entered the stage.
    const { stage } = globals;
    const pointer =
      stage.getPointersPositions().length > 0
        ? stage.getPointerPosition()
        : null;
    if (pointer === null) {
      return;
    }
    const shape = globals.stage.getIntersection(pointer);
    if (shape !== null && this.card.isAncestorOf(shape)) {
      this.card.setCursor();
    }
  }

  shouldBeDraggable(draggableIndex: PlayerIndex | undefined): boolean {
    // Rarely, if the game is restarted when a tween is happening, we can get here without the card
    // being defined.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.card === undefined) {
      return false;
    }

    return (
      draggableIndex !== undefined
      && this.card.state.location === draggableIndex
      // A morphed card with an unknown identity cannot be played or discarded.
      && !this.blank
      // Cards should not be draggable while they are playing an animation. (This function will be
      // called again upon the completion of the animation.)
      && !this.card.tweening
    );
  }

  dragEnd(): void {
    // Mouse events will not normally fire when the card is released from being dragged.
    this.card.dispatchEvent(new MouseEvent("mouseup"));
    this.card.dispatchEvent(new MouseEvent("mouseleave"));

    this.draggable(false);

    // We have to unregister the handler or else it will send multiple actions for one drag.
    this.off("dragend");

    const ongoingGameState =
      globals.state.replay.hypothetical === undefined
        ? globals.state.ongoingGame
        : globals.state.replay.hypothetical.ongoing;

    let draggedTo = cursor.getElementDragLocation(this);
    if (
      draggedTo === "discardArea"
      && isAtMaxClueTokens(ongoingGameState.clueTokens, globals.variant)
    ) {
      sounds.play(SoundType.Error);
      globals.elements.cluesNumberLabelPulse?.play();
      draggedTo = undefined;
    }
    if (
      globals.state.replay.hypothetical !== undefined
      && (draggedTo === "playArea" || draggedTo === "discardArea")
    ) {
      const knownCard = this.checkHypoUnknown(draggedTo);
      if (!knownCard) {
        // Morph modal is shown. Do not complete the drag action. It will be taken care of after the
        // user input.
        return;
      }
    }
    this.continueDragAction(draggedTo);
  }

  checkHypoUnknown(draggedTo: "playArea" | "discardArea"): boolean {
    const { suitIndex, rank } = this.card.getMorphedIdentity();
    if (suitIndex !== undefined && rank !== undefined) {
      return true; // Known card
    }

    modals.askForMorph(this.card.morphTarget(), globals.variant, {
      card: this.card,
      area: draggedTo,
    });
    return false; // Unknown card
  }

  continueDragAction(draggedTo: "playArea" | "discardArea" | undefined): void {
    const returnToHand = () => {
      (this.parent as unknown as CardLayout | PlayStack).doLayout();
    };

    switch (draggedTo) {
      case undefined: {
        // The card was dragged to an invalid location; tween it back to the hand.
        returnToHand();
        break;
      }

      case "playArea": {
        // Before we play a card, ensure that it is actually playable to prevent silly mistakes from
        // players. (But this is disabled in speedruns, hypotheticals and certain variants.)
        confirmPlay(
          this.card.state,
          () => {
            turn.end({
              type: "play",
              order: this.card.order,
            });
          },
          returnToHand,
        );
        break;
      }

      case "discardArea": {
        turn.end({
          type: "discard",
          order: this.card.order,
        });
        break;
      }
    }
  }
}
