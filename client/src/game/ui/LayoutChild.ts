// This is the parent of a HanabiCard
// It has a CardLayout or PlayStack parent

import Konva from 'konva';
import * as sounds from '../../sounds';
import { cardRules, clueTokensRules } from '../rules';
import * as variantRules from '../rules/variant';
import ActionType from '../types/ActionType';
import * as arrows from './arrows';
import CardLayout from './CardLayout';
import globals from './globals';
import HanabiCard from './HanabiCard';
import isOurTurn from './isOurTurn';
import PlayStack from './PlayStack';
import * as turn from './turn';

export default class LayoutChild extends Konva.Group {
  dragging: boolean = false;
  tween: Konva.Tween | null = null;
  doMisplayAnimation: boolean = false;
  blank: boolean = false;

  private _card: HanabiCard;
  get card() {
    return this._card;
  }

  constructor(child: HanabiCard, config?: Konva.ContainerConfig | undefined) {
    super(config);
    this.listening(true);
    this._card = child;
    this.addCard(child);
  }

  private addCard(child: HanabiCard) {
    this.add(child as any);
    this.width(child.width());
    this.height(child.height());

    const change = (event: any) => {
      const changeEvent = event as {oldVal: number; newVal: number};
      if (changeEvent.oldVal === changeEvent.newVal) {
        return;
      }
      this.width(changeEvent.newVal);
      if (this.parent) {
        (this.parent as unknown as CardLayout | PlayStack).doLayout();
      }
    };

    child.on('widthChange', change);
    child.on('heightChange', change);
  }

  // Note that this method cannot be named "setDraggable()",
  // since that would overlap with the Konva function
  checkSetDraggable() {
    if (globals.state.visibleState === null) {
      return;
    }

    if (this.shouldBeDraggable(globals.state.visibleState.turn.currentPlayerIndex)) {
      this.draggable(true);
      this.on('dragstart', this.dragStart);
      this.on('dragend', this.dragEnd);
    } else {
      this.draggable(false);
      this.off('dragstart');
      this.off('dragend');
    }
  }

  shouldBeDraggable(currentPlayerIndex: number | null) {
    // Rarely, if the game is restarted when a tween is happening,
    // we can get here without the card being defined
    if (this.card === null || this.card === undefined) {
      return false;
    }

    // First, handle the special case of a hypothetical
    if (globals.state.replay.hypothetical !== null) {
      return (
        globals.state.replay.shared !== null
        && globals.state.replay.shared.amLeader
        && currentPlayerIndex === this.card.state.location
        && !this.blank
      );
    }

    return (
      // If it is not our turn, then the card should not need to be draggable yet
      // (unless we have the "Enable pre-playing cards" feature enabled)
      (isOurTurn() || globals.lobby.settings.speedrunPreplay)
      // Cards should not be draggable if there is a queued move
      && globals.state.premove === null
      && !globals.options.speedrun // Cards should never be draggable while speedrunning
      && !globals.lobby.settings.speedrunMode // Cards should never be draggable while speedrunning
      // Only our cards should be draggable
      && this.card.state.location === globals.metadata.ourPlayerIndex
      // Cards should not be draggable if we are spectating an ongoing game, in a dedicated solo
      // replay, or in a shared replay
      && globals.state.playing
      // Cards should not be draggable if they are currently playing an animation
      // (this function will be called again upon the completion of the animation)
      && !this.card.tweening
    );
  }

  dragStart(event: Konva.KonvaEventObject<DragEvent>) {
    // Disable dragging with middle-click or right-click
    // (checking for "event.evt.buttons !== 1" will break iPads)
    if (event.evt.buttons === 4 || event.evt.buttons === 2) {
      return;
    }

    this.dragging = true;

    // Enable the dragging raise effect
    this.card.setRaiseAndShadowOffset();

    // We need to change the cursor from the hand to the grabbing icon
    this.card.setCursor();

    // In a hypothetical, dragging a rotated card from another person's hand is frustrating,
    // so temporarily remove all rotation (for the duration of the drag)
    // The rotation will be automatically reset if the card tweens back to the hand
    if (globals.state.replay.hypothetical !== null && this.parent !== null) {
      this.rotation(this.parent.rotation() * -1);
    }

    // Hide any visible arrows on the rest of a hand when the card begins to be dragged
    const hand = this.parent;
    if (hand === null || hand === undefined) {
      return;
    }
    let hideArrows = false;
    for (const layoutChild of hand.children.toArray() as LayoutChild[]) {
      for (const arrow of globals.elements.arrows) {
        if (arrow.pointingTo === layoutChild.card) {
          hideArrows = true;
          break;
        }
      }
      if (hideArrows) {
        break;
      }
    }
    if (hideArrows) {
      arrows.hideAll();
    }

    // Move this hand to the top
    // (otherwise, the card can appear under the play stacks / discard stacks)
    hand.moveToTop();
  }

  dragEnd() {
    this.dragging = false;
    this.draggable(false);

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.off('dragstart');
    this.off('dragend');

    // Disable the dragging raise effect
    this.card.setRaiseAndShadowOffset();

    // We need to change the cursor from the grabbing icon back to the default
    this.card.setCursor();

    let draggedTo = this.getDragLocation();
    if (draggedTo === 'playArea' && this.checkMisplay()) {
      draggedTo = null;
    }

    if (draggedTo === null) {
      // The card was dragged to an invalid location; tween it back to the hand
      (this.parent as unknown as CardLayout | PlayStack).doLayout();
      return;
    }

    let type;
    if (draggedTo === 'playArea') {
      type = ActionType.Play;
    } else if (draggedTo === 'discardArea') {
      type = ActionType.Discard;
    } else {
      throw new Error(`Unknown drag location of "${draggedTo}".`);
    }

    turn.end({
      type,
      target: this.card.state.order,
    });
  }

  getDragLocation() {
    const pos = this.getAbsolutePosition();
    pos.x += this.width() * this.scaleX() / 2;
    pos.y += this.height() * this.scaleY() / 2;

    if (globals.elements.playArea!.isOver(pos)) {
      return 'playArea';
    }
    if (globals.elements.discardArea!.isOver(pos)) {
      if (clueTokensRules.atMax(globals.state.ongoingGame.clueTokens, globals.variant)) {
        sounds.play('error');
        globals.elements.cluesNumberLabelPulse!.play();
        return null;
      }

      return 'discardArea';
    }

    return null;
  }

  // Before we play a card,
  // do a check to ensure that it is actually playable to prevent silly mistakes from players
  // (but disable this in speedruns and certain variants)
  checkMisplay() {
    const currentPlayerIndex = globals.state.ongoingGame.turn.currentPlayerIndex;
    const ourPlayerIndex = globals.metadata.ourPlayerIndex;
    let ongoingGame = globals.state.ongoingGame;
    if (globals.state.replay.hypothetical !== null) {
      ongoingGame = globals.state.replay.hypothetical.ongoing;
    }

    if (
      !globals.options.speedrun
      && !variantRules.isThrowItInAHole(globals.variant)
      // Don't use warnings for preplays unless we are at 2 strikes
      && (currentPlayerIndex === ourPlayerIndex || ongoingGame.strikes.length === 2)
      && !cardRules.isPotentiallyPlayable(
        this.card.state,
        ongoingGame.deck,
        ongoingGame.playStacks,
        ongoingGame.playStackDirections,
      )
    ) {
      let text = 'Are you sure you want to play this card?\n';
      text += 'It is known to be unplayable based on the current information\n';
      text += 'available to you. (e.g. positive clues, negative clues, cards seen, etc.)';
      return !window.confirm(text);
    }

    return false;
  }
}
