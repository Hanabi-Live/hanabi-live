import { ActionType } from "@hanabi-live/data";
import type { PlayerIndex } from "@hanabi-live/game";
import { isAtMaxClueTokens } from "@hanabi-live/game";
import Konva from "konva";
import * as modals from "../../modals";
import * as sounds from "../../sounds";
import { SoundType } from "../types/SoundType";
import type { CardLayout } from "./CardLayout";
import type { HanabiCard } from "./HanabiCard";
import type { PlayStack } from "./PlayStack";
import { globals } from "./UIGlobals";
import { confirmPlay } from "./confirmPlay";
import * as cursor from "./cursor";
import { draggablePlayerIndex } from "./reactive/views/draggableView";
import * as turn from "./turn";

/** Parent of a `HanabiCard`. It has a `CardLayout` or `PlayStack` parent. */
export class LayoutChild extends Konva.Group {
  tween: Konva.Tween | null = null;
  doMisplayAnimation = false;
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

  // Note that this method cannot be named "setDraggable()", since that would overlap with the Konva
  // function.
  checkSetDraggable(): void {
    if (globals.state.visibleState === null) {
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

  shouldBeDraggable(draggableIndex: PlayerIndex | null): boolean {
    // Rarely, if the game is restarted when a tween is happening, we can get here without the card
    // being defined.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.card === null || this.card === undefined) {
      return false;
    }

    return (
      draggableIndex !== null
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
      globals.state.replay.hypothetical === null
        ? globals.state.ongoingGame
        : globals.state.replay.hypothetical.ongoing;

    let draggedTo = cursor.getElementDragLocation(this);
    if (
      draggedTo === "discardArea"
      && isAtMaxClueTokens(ongoingGameState.clueTokens, globals.variant)
    ) {
      sounds.play(SoundType.Error);
      globals.elements.cluesNumberLabelPulse?.play();
      draggedTo = null;
    }
    if (
      globals.state.replay.hypothetical !== null
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
    if (suitIndex !== null && rank !== null) {
      return true; // Known card
    }

    modals.askForMorph(
      this.card,
      globals.variant,
      globals.cardImages,
      draggedTo,
    );
    return false; // Unknown card
  }

  continueDragAction(draggedTo: "playArea" | "discardArea" | null): void {
    const returnToHand = () => {
      (this.parent as unknown as CardLayout | PlayStack).doLayout();
    };

    switch (draggedTo) {
      case null: {
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
              type: ActionType.Play,
              target: this.card.state.order,
            });
          },
          returnToHand,
        );
        break;
      }

      case "discardArea": {
        turn.end({
          type: ActionType.Discard,
          target: this.card.state.order,
        });
        break;
      }
    }
  }
}
