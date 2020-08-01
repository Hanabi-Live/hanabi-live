// This is the parent of a HanabiCard
// It has a CardLayout or PlayStack parent

import Konva from 'konva';
import * as sounds from '../../sounds';
import { cardRules } from '../rules';
import * as variantRules from '../rules/variant';
import ActionType from '../types/ActionType';
import { MAX_CLUE_NUM } from '../types/constants';
import CardLayout from './CardLayout';
import cursorSet from './cursorSet';
import globals from './globals';
import HanabiCard from './HanabiCard';
import isOurTurn from './isOurTurn';
import PlayStack from './PlayStack';
import * as turn from './turn';

export default class LayoutChild extends Konva.Group {
  tween: Konva.Tween | null = null;
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
      this.on('mousemove', (event: Konva.KonvaEventObject<MouseEvent>) => {
        if (event.evt.buttons % 2 === 1) { // Left-click is being held down
          cursorSet('dragging');
          this.card.setVisualEffect('dragging');
        } else {
          cursorSet('hand');
          this.card.setVisualEffect('hand');
        }
      });
      this.on('mouseleave', () => {
        cursorSet('default');
        this.card.setVisualEffect('default');
      });
      this.on('mousedown', (event: Konva.KonvaEventObject<MouseEvent>) => {
        if (event.evt.buttons % 2 === 1) {
          cursorSet('dragging');
          this.card.setVisualEffect('dragging');
        }
      });
      this.on('mouseup', () => {
        cursorSet('hand');
        this.card.setVisualEffect('hand');
      });
    } else {
      this.draggable(false);
      this.off('dragstart');
      this.off('dragend');
      this.off('mousemove');
      this.off('mouseleave');
      this.off('mousedown');
      this.off('mouseup');
    }
  }

  shouldBeDraggable(currentPlayerIndex: number | null) {
    // Cards should only be draggable in specific circumstances
    if (this.card === null || this.card === undefined) {
      // Rarely, if the game is restarted when a tween is happening,
      // we can get here without the card being defined
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
      && this.card.state.location === globals.state.metadata.ourPlayerIndex
      // Cards should not be draggable if we are spectating an ongoing game, in a dedicated solo
      // replay, or in a shared replay
      && globals.state.playing
      // Cards should not be draggable if they are currently playing an animation
      // (this function will be called again upon the completion of the animation)
      && !this.card.tweening
    );
  }

  dragStart() {
    // Ideally, we would have a check to only make a card draggable with a left click
    // However, checking for "event.evt.buttons !== 1" will break iPads

    // In a hypothetical, dragging a rotated card from another person's hand is frustrating,
    // so temporarily remove all rotation (for the duration of the drag)
    // The rotation will be automatically reset if the card tweens back to the hand
    if (globals.state.replay.hypothetical !== null) {
      this.rotation(this.parent!.rotation() * -1);
    }
  }

  dragEnd() {
    // We have released the mouse button, so immediately set the cursor back to the default
    cursorSet('default');
    this.card.setVisualEffect('default');

    // We have to unregister the handler or else it will send multiple actions for one drag
    this.draggable(false);
    this.off('dragstart');
    this.off('dragend');

    // Find out where we dragged this card to
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

    draggedTo = this.checkMisplay(draggedTo);

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

    const card = this.children[0] as unknown as HanabiCard;
    turn.end({
      type,
      target: card.state.order,
    });
  }

  // Before we play a card,
  // do a check to ensure that it is actually playable to prevent silly mistakes from players
  // (but disable this in speedruns and certain variants)
  checkMisplay(draggedTo: string | null) {
    const currentPlayerIndex = globals.state.ongoingGame.turn.currentPlayerIndex;
    const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;
    const card = this.children[0] as unknown as HanabiCard;
    let ongoingGame = globals.state.ongoingGame;
    if (globals.state.replay.hypothetical !== null) {
      ongoingGame = globals.state.replay.hypothetical.ongoing;
    }

    if (
      draggedTo === 'playArea'
      && !globals.options.speedrun
      && !variantRules.isThrowItInAHole(globals.variant)
      // Don't use warnings for preplays unless we are at 2 strikes
      && (currentPlayerIndex === ourPlayerIndex || ongoingGame.strikes.length === 2)
      && !cardRules.isPotentiallyPlayable(
        card.state,
        ongoingGame.deck,
        ongoingGame.playStacks,
        ongoingGame.playStackDirections,
      )
    ) {
      let text = 'Are you sure you want to play this card?\n';
      text += 'It is known to be unplayable based on the current information\n';
      text += 'available to you. (e.g. positive clues, negative clues, cards seen, etc.)';
      if (!window.confirm(text)) {
        return null;
      }
    }

    return draggedTo;
  }
}
