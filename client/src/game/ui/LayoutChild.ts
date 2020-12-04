// This is the parent of a HanabiCard
// It has a CardLayout or PlayStack parent

import Konva from "konva";
import * as modals from "../../modals";
import * as sounds from "../../sounds";
import * as noteIdentity from "../reducers/noteIdentity";
import { cardRules, clueTokensRules } from "../rules";
import * as variantRules from "../rules/variant";
import ActionType from "../types/ActionType";
import CardLayout from "./CardLayout";
import * as cursor from "./cursor";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import * as hypothetical from "./hypothetical";
import isOurTurn from "./isOurTurn";
import PlayStack from "./PlayStack";
import * as turn from "./turn";

export default class LayoutChild extends Konva.Group {
  tween: Konva.Tween | null = null;
  doMisplayAnimation = false;
  blank = false;

  private _card: HanabiCard;
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
    this.add((child as unknown) as Konva.Group);
    this.width(child.width());
    this.height(child.height());

    const change = (event: unknown) => {
      const changeEvent = event as { oldVal: number; newVal: number };
      if (changeEvent.oldVal === changeEvent.newVal) {
        return;
      }
      this.width(changeEvent.newVal);
      if (this.parent) {
        ((this.parent as unknown) as CardLayout | PlayStack).doLayout();
      }
    };

    child.on("widthChange", change);
    child.on("heightChange", change);
  }

  // Note that this method cannot be named "setDraggable()",
  // since that would overlap with the Konva function
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

  shouldBeDraggable(currentPlayerIndex: number | null): boolean {
    // Rarely, if the game is restarted when a tween is happening,
    // we can get here without the card being defined
    if (this.card === null || this.card === undefined) {
      return false;
    }

    // First, handle the special case of a hypothetical
    if (globals.state.replay.hypothetical !== null) {
      return (
        (globals.state.replay.shared === null ||
          globals.state.replay.shared.amLeader) &&
        currentPlayerIndex === this.card.state.location &&
        !this.blank
      );
    }

    return (
      // If it is not our turn, then the card should not need to be draggable yet
      // (unless we have the "Enable pre-playing cards" feature enabled)
      (isOurTurn() || globals.lobby.settings.speedrunPreplay) &&
      // Cards should not be draggable if there is a queued move
      globals.state.premove === null &&
      !globals.options.speedrun && // Cards should never be draggable while speedrunning
      !globals.lobby.settings.speedrunMode && // Cards should never be draggable while speedrunning
      // Only our cards should be draggable
      this.card.state.location === globals.metadata.ourPlayerIndex &&
      // Cards should not be draggable if we are spectating an ongoing game, in a dedicated solo
      // replay, or in a shared replay
      globals.state.playing &&
      // Cards should not be draggable if they are currently playing an animation
      // (this function will be called again upon the completion of the animation)
      !this.card.tweening
    );
  }

  dragEnd(): void {
    // Mouse events will not normally fire when the card is released from being dragged
    this.card.dispatchEvent(new MouseEvent("mouseup"));
    this.card.dispatchEvent(new MouseEvent("mouseleave"));

    this.draggable(false);

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.off("dragend");

    const ongoingGameState =
      globals.state.replay.hypothetical === null
        ? globals.state.ongoingGame
        : globals.state.replay.hypothetical.ongoing;

    let draggedTo = cursor.getElementDragLocation(this);
    if (
      draggedTo === "discardArea" &&
      clueTokensRules.atMax(ongoingGameState.clueTokens, globals.variant)
    ) {
      sounds.play("error");
      globals.elements.cluesNumberLabelPulse!.play();
      draggedTo = null;
    }
    if (
      globals.state.replay.hypothetical !== null &&
      ((draggedTo === "playArea" && this.checkHypoUnknown("play")) ||
        (draggedTo === "discardArea" && this.checkHypoUnknown("discard")))
    ) {
      draggedTo = null;
    }
    if (draggedTo === "playArea" && this.checkMisplay()) {
      draggedTo = null;
    }

    if (draggedTo === null) {
      // The card was dragged to an invalid location; tween it back to the hand
      ((this.parent as unknown) as CardLayout | PlayStack).doLayout();
      return;
    }

    let type;
    if (draggedTo === "playArea") {
      type = ActionType.Play;
    } else if (draggedTo === "discardArea") {
      type = ActionType.Discard;
    } else {
      throw new Error("Unknown drag location.");
    }

    turn.end({
      type,
      target: this.card.state.order,
    });
  }

  // Before we play a card,
  // do a check to ensure that it is actually playable to prevent silly mistakes from players
  // (but disable this in speedruns and certain variants)
  checkMisplay(): boolean {
    const { currentPlayerIndex } = globals.state.ongoingGame.turn;
    const { ourPlayerIndex } = globals.metadata;
    let { ongoingGame } = globals.state;
    if (globals.state.replay.hypothetical !== null) {
      ongoingGame = globals.state.replay.hypothetical.ongoing;
    }

    if (
      !globals.options.speedrun &&
      !variantRules.isThrowItInAHole(globals.variant) &&
      // Don't use warnings for preplays unless we are at 2 strikes
      (currentPlayerIndex === ourPlayerIndex ||
        ongoingGame.strikes.length === 2) &&
      !cardRules.isPotentiallyPlayable(
        this.card.state,
        ongoingGame.deck,
        ongoingGame.playStacks,
        ongoingGame.playStackDirections,
      )
    ) {
      let text = "Are you sure you want to play this card?\n";
      text += "It is known to be unplayable based on the current information\n";
      text +=
        "available to you. (e.g. positive clues, negative clues, cards seen, etc.)";
      return !window.confirm(text);
    }

    return false;
  }

  checkHypoUnknown(action: string): boolean {
    if (this.card.visibleSuitIndex !== null && this.card.visibleRank !== null) {
      return false;
    }

    const newIdentityText = window.prompt(
      `You just tried to ${action} an unknown card.\n` +
        "What card do you want to assume it is for the purposes of the hypothetical? (e.g. red 1, b3)",
    );
    if (newIdentityText === null) {
      return true;
    }
    const newIdentity = noteIdentity.parseIdentity(
      globals.variant,
      newIdentityText,
    );

    const newSuitIndex = this.card.visibleSuitIndex ?? newIdentity.suitIndex;
    const newRank = this.card.visibleRank ?? newIdentity.rank;
    if (
      (newIdentity.suitIndex === null && newIdentity.rank === null) ||
      newSuitIndex === null ||
      newRank === null
    ) {
      modals.warningShow("You entered an invalid card.");
      return true;
    }

    hypothetical.sendHypoAction({
      type: "morph",
      order: this.card.state.order,
      suitIndex: newSuitIndex,
      rank: newRank,
    });

    return false;
  }
}
