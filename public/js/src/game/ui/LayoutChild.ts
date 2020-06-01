// This is the parent of a HanabiCard
// It has a CardLayout or PlayStack parent

// Imports
import Konva from 'konva';
import { ActionType, MAX_CLUE_NUM } from '../../constants';
import * as sounds from '../../sounds';
import CardLayout from './CardLayout';
import globals from './globals';
import HanabiCard from './HanabiCard';
import PlayStack from './PlayStack';
import * as turn from './turn';

export default class LayoutChild extends Konva.Group {
  tween: Konva.Tween | null = null;

  addCard(child: HanabiCard) {
    this.add(child as any);
    this.width(child.width());
    this.height(child.height());

    const change = (event: any) => {
      if (event.oldVal === event.newVal) {
        return;
      }
      this.width(event.newVal);
      if (this.parent) {
        (this.parent as unknown as CardLayout | PlayStack).doLayout();
      }
    };

    child.on('widthChange', change);
    child.on('heightChange', change);
  }

  // The card sliding animation is finished, so make the card draggable
  checkSetDraggable() {
    // Cards should only be draggable in specific circumstances
    const card: HanabiCard = this.children[0] as any;
    if (!card) {
      // Rarely, if the game is restarted when a tween is happening,
      // we can get here without the card being defined
      return;
    }

    // First, handle the special case of a hypothetical
    if (globals.hypothetical) {
      if (globals.amSharedReplayLeader && globals.currentPlayerIndex === card.holder) {
        this.draggable(true);
        this.on('dragstart', this.dragStart);
        this.on('dragend', this.dragEnd);
      } else {
        this.draggable(false);
        this.off('dragstart');
        this.off('dragend');
      }
      return;
    }

    if (
      // If it is not our turn, then the card does not need to be draggable yet
      // (unless we have the "Enable pre-playing cards" feature enabled)
      (!globals.ourTurn && !globals.lobby.settings.speedrunPreplay)
      || globals.options.speedrun // Cards should never be draggable while speedrunning
      || card.holder !== globals.playerUs // Only our cards should be draggable
      || card.isPlayed // Cards on the stacks should not be draggable
      || card.isDiscarded // Cards in the discard pile should not be draggable
      || globals.replay // Cards should not be draggable in solo or shared replays
      // Cards should not be draggable if we are spectating an ongoing game
      || globals.spectating
      // Cards should not be draggable if they are currently playing an animation
      // (this function will be called again upon the completion of the animation)
      || card.tweening
    ) {
      this.draggable(false);
      this.off('dragend');
      return;
    }

    this.draggable(true);
    this.on('dragend', this.dragEnd);
  }

  dragStart() {
    // In a hypothetical, dragging a rotated card from another person's hand is frustrating,
    // so temporarily remove all rotation (for the duration of the drag)
    // The rotation will be automatically reset if the card tweens back to the hand
    this.rotation(this.parent!.rotation() * -1);
  }

  dragEnd() {
    const card: HanabiCard = this.children[0] as any;

    const pos = this.getAbsolutePosition();
    pos.x += this.width() * this.scaleX() / 2;
    pos.y += this.height() * this.scaleY() / 2;

    let draggedTo = null;
    if (globals.elements.playArea!.isOver(pos)) {
      draggedTo = 'playArea';
    } else if (globals.elements.discardArea!.isOver(pos)) {
      if (globals.clues === MAX_CLUE_NUM) {
        sounds.play('error');
        globals.elements.cluesNumberLabelPulse!.play();
      } else {
        draggedTo = 'discardArea';
      }
    }

    // Before we play a card,
    // do a check to ensure that it is actually playable to prevent silly mistakes from players
    // (but disable this in speedruns and certain variants)
    if (
      draggedTo === 'playArea'
      && !globals.options.speedrun
      && !globals.variant.name.startsWith('Throw It in a Hole')
      && globals.ourTurn // Don't use warnings for preplays
      && !card.isPotentiallyPlayable()
    ) {
      let text = 'Are you sure you want to play this card?\n';
      text += 'It is known to be unplayable based on the current information\n';
      text += 'available to you. (e.g. positive clues, negative clues, cards seen, etc.)';
      if (!window.confirm(text)) {
        draggedTo = null;
      }
    }

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.draggable(false);
    this.off('dragend');

    if (draggedTo === null) {
      // The card was dragged to an invalid location; tween it back to the hand
      (this.parent as unknown as CardLayout | PlayStack).doLayout();
      return;
    }

    turn.end({
      type: draggedTo === 'playArea' ? ActionType.Play : ActionType.Discard,
      target: card.order,
    });
  }
}
