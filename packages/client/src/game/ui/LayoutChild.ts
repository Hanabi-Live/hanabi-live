import type { PlayerIndex } from "@hanabi/data";
import { isAtMaxClueTokens, isCardPotentiallyPlayable } from "@hanabi/game";
import Konva from "konva";
import * as modals from "../../modals";
import * as sounds from "../../sounds";
import { ActionType } from "../types/ActionType";
import { SoundType } from "../types/SoundType";
import type { CardLayout } from "./CardLayout";
import type { HanabiCard } from "./HanabiCard";
import type { PlayStack } from "./PlayStack";
import { globals } from "./UIGlobals";
import * as cursor from "./cursor";
import { isOurTurn } from "./isOurTurn";
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

  constructor(child: HanabiCard, config?: Konva.ContainerConfig | undefined) {
    super(config);
    this.listening(true);
    this._card = child;
    this.addCard(child);
  }

  private addCard(child: HanabiCard) {
    this.add(child as unknown as Konva.Group);
    this.width(child.width());
    this.height(child.height());

    // eslint-disable-next-line unicorn/consistent-function-scoping
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

    if (
      this.shouldBeDraggable(globals.state.visibleState.turn.currentPlayerIndex)
    ) {
      this.draggable(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      this.on("dragend", this.dragEnd);
    } else {
      this.draggable(false);
      this.off("dragend");
    }

    if (cursor.elementOverlaps(this)) {
      this.card.setCursor();
    }
  }

  shouldBeDraggable(currentPlayerIndex: PlayerIndex | null): boolean {
    // Rarely, if the game is restarted when a tween is happening, we can get here without the card
    // being defined.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.card === null || this.card === undefined) {
      return false;
    }

    // First, handle the special case of a hypothetical.
    if (globals.state.replay.hypothetical !== null) {
      return (
        (globals.state.replay.shared === null ||
          globals.state.replay.shared.amLeader) &&
        currentPlayerIndex === this.card.state.location &&
        !this.blank
      );
    }

    return (
      // If it is not our turn, then the card should not need to be draggable yet (unless we have
      // the "Enable pre-playing cards" feature enabled).
      (isOurTurn() || globals.lobby.settings.speedrunPreplay) &&
      // Cards should not be draggable if there is a queued move.
      globals.state.premove === null &&
      !globals.options.speedrun && // Cards should never be draggable while speedrunning
      !globals.lobby.settings.speedrunMode && // Cards should never be draggable while speedrunning
      // Only our cards should be draggable.
      this.card.state.location === globals.metadata.ourPlayerIndex &&
      // Cards should not be draggable if we are spectating an ongoing game, in a dedicated solo
      // replay, or in a shared replay.
      globals.state.playing &&
      // Cards should not be draggable if they are currently playing an animation. (This function
      // will be called again upon the completion of the animation.)
      !this.card.tweening
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
      draggedTo === "discardArea" &&
      isAtMaxClueTokens(ongoingGameState.clueTokens, globals.variant)
    ) {
      sounds.play(SoundType.Error);
      globals.elements.cluesNumberLabelPulse!.play();
      draggedTo = null;
    }
    if (
      globals.state.replay.hypothetical !== null &&
      (draggedTo === "playArea" || draggedTo === "discardArea")
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

  // Before we play a card, do a check to ensure that it is actually playable to prevent silly
  // mistakes from players. (But disable this in speedruns, hypotheticals and certain variants.)
  checkMisplay(): boolean {
    const { currentPlayerIndex } = globals.state.ongoingGame.turn;
    const { ourPlayerIndex } = globals.metadata;
    const { ongoingGame } = globals.state;

    if (
      globals.state.replay.hypothetical === null &&
      !globals.options.speedrun &&
      !globals.variant.throwItInAHole &&
      // Do not use warnings for preplays unless we are at 2 strikes.
      (currentPlayerIndex === ourPlayerIndex ||
        ongoingGame.strikes.length === 2) &&
      !isCardPotentiallyPlayable(
        this.card.state,
        ongoingGame.deck,
        ongoingGame.playStacks,
        ongoingGame.playStackDirections,
        ongoingGame.playStackStarts,
        globals.variant,
      )
    ) {
      let text = "Are you sure you want to play this card?\n";
      text += "It is known to be unplayable based on the current information\n";
      text +=
        "available to you. (e.g. positive clues, negative clues, cards seen, etc.)";
      // eslint-disable-next-line no-alert
      return !window.confirm(text);
    }

    return false;
  }

  checkHypoUnknown(draggedTo: "playArea" | "discardArea"): boolean {
    const { suitIndex, rank } = this.card.getMorphedIdentity();
    if (suitIndex !== null && rank !== null) {
      return true; // Known card
    }

    modals.askForMorph(this.card, globals.variant, draggedTo);
    return false; // Unknown card
  }

  continueDragAction(draggedTo: "playArea" | "discardArea" | null): void {
    if (draggedTo === "playArea" && this.checkMisplay()) {
      return;
    }

    if (draggedTo === null) {
      // The card was dragged to an invalid location; tween it back to the hand.
      (this.parent as unknown as CardLayout | PlayStack).doLayout();
      return;
    }

    let type: ActionType;
    switch (draggedTo) {
      case "playArea": {
        type = ActionType.Play;
        break;
      }

      case "discardArea": {
        type = ActionType.Discard;
        break;
      }
    }

    turn.end({
      type,
      target: this.card.state.order,
    });
  }
}
