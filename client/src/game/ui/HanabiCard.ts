// The HanabiCard object represents a single card
// It has a LayoutChild parent

import Konva from 'konva';
import {
  CARD_FADE,
  CARD_H,
  CARD_W,
} from '../../constants';
import { getSuit, VARIANTS } from '../data/gameData';
import initialCardState from '../reducers/initialStates/initialCardState';
import * as cardRules from '../rules/card';
import * as variantRules from '../rules/variant';
import CardIdentity from '../types/CardIdentity';
import CardNote from '../types/CardNote';
import CardState, { PipState } from '../types/CardState';
import ClueType from '../types/ClueType';
import { STACK_BASE_RANK, UNKNOWN_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Suit from '../types/Suit';
import Variant from '../types/Variant';
import * as arrows from './arrows';
import CardLayout from './CardLayout';
import NodeWithTooltip from './controls/NodeWithTooltip';
import NoteIndicator from './controls/NoteIndicator';
import RankPip from './controls/RankPip';
import { suitIndexToSuit } from './convert';
import globals from './globals';
import HanabiCardClick from './HanabiCardClick';
import HanabiCardClickSpeedrun from './HanabiCardClickSpeedrun';
import * as HanabiCardInit from './HanabiCardInit';
import { animate } from './konvaHelpers';
import LayoutChild from './LayoutChild';
import * as notes from './notes';

const DECK_BACK_IMAGE = 'deck-back';

export default class HanabiCard extends Konva.Group implements NodeWithTooltip {
  // HACK: this is temporary to figure out what needs to be converted to reactive
  // In the end, the state should not be exposed by the UI in any form
  // and nobody should depend on the HanabiCard UI state
  private _state: CardState;

  get state() {
    return globals.store?.getState()?.visibleState?.deck[this._state.order] || this._state;
  }

  set state(state: CardState) {
    this._state = state;
  }

  private _variant: Variant | null = null;

  private get variant() {
    if (!this._variant) {
      this._variant = VARIANTS.get(globals.store!.getState().metadata.options.variantName)!;
    }
    return this._variant;
  }

  private _tweening: boolean = false;
  private tweenCallbacks: Function[] = [];

  get tweening() {
    return this._tweening;
  }

  private _blank: boolean = false;

  // TEMP: this is just for LayoutChild to know if this card was blanked
  get blank() {
    return this._blank;
  }

  startedTweening() {
    this._tweening = true;
  }

  finishedTweening() {
    this._tweening = false;
    this.tweenCallbacks.forEach((callback) => { callback(); });
    this.tweenCallbacks = [];
  }

  waitForTweening(callback: Function) {
    if (!this.tweening) {
      callback();
      return;
    }
    this.tweenCallbacks.push(callback);
  }

  wasRecentlyTapped: boolean = false;
  touchstartTimeout: ReturnType<typeof setTimeout> | null = null;
  doMisplayAnimation: boolean = false;
  tooltipName: string = '';
  noteIndicator: NoteIndicator;
  empathy: boolean = false;

  private note: CardNote = {
    suitIndex: null,
    rank: null,
    chopMoved: false,
    needsFix: false,
    knownTrash: false,
    finessed: false,
    blank: false,
    unclued: false,
  };

  private cluedBorder: Konva.Group;
  private chopMoveBorder: Konva.Group;
  private finesseBorder: Konva.Group;

  private suitPips: Konva.Group;
  private rankPips: Konva.Group;
  private bareName: string = '';
  private bare: Konva.Image;
  private suitPipsMap: Map<number, Konva.Shape>;
  private suitPipsXMap: Map<number, Konva.Shape>;
  private rankPipsMap: Map<number, RankPip>;
  private rankPipsXMap: Map<number, Konva.Shape>;
  private trashcan: Konva.Image;
  private wrench: Konva.Image;
  private criticalIndicator: Konva.Image;

  private arrow: Konva.Group | null = null;
  private arrowBase: Konva.Arrow | null = null;

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    // Cards should start off with a constant width and height
    this.width(CARD_W);
    this.height(CARD_H);
    this.x(CARD_W / 2);
    this.y(CARD_H / 2);
    this.offset({
      x: 0.5 * CARD_W,
      y: 0.5 * CARD_H,
    });

    // Most class variables are defined below in the "refresh()" function
    // Order is defined upon first initialization
    this._state = initialCardState(config.order, this.variant);

    // Initialize various elements/features of the card
    this.bare = HanabiCardInit.image(() => this.bareName);
    this.add(this.bare);

    this.cluedBorder = HanabiCardInit.cluedBorder();
    this.add(this.cluedBorder);
    this.finesseBorder = HanabiCardInit.finesseBorder();
    this.add(this.finesseBorder);
    this.chopMoveBorder = HanabiCardInit.chopMoveBorder();
    this.add(this.chopMoveBorder);

    const arrowElements = HanabiCardInit.directionArrow(this.variant);
    if (arrowElements) {
      this.arrow = arrowElements.arrow;
      this.arrowBase = arrowElements.arrowBase;
      this.add(this.arrow);
    }

    const pips = HanabiCardInit.pips(this.variant);
    this.suitPipsMap = pips.suitPipsMap;
    this.suitPipsXMap = pips.suitPipsXMap;
    this.rankPipsMap = pips.rankPipsMap;
    this.rankPipsXMap = pips.rankPipsXMap;
    this.suitPips = pips.suitPips;
    this.rankPips = pips.rankPips;
    this.add(this.suitPips);
    this.add(this.rankPips);

    this.noteIndicator = HanabiCardInit.note(
      this.variant.offsetCornerElements,
      () => notes.shouldShowIndicator(this.state.order),
    );
    this.add(this.noteIndicator);

    this.criticalIndicator = HanabiCardInit.criticalIndicator(this.variant.offsetCornerElements);
    this.add(this.criticalIndicator);

    this.trashcan = HanabiCardInit.trashcan();
    this.add(this.trashcan);
    this.wrench = HanabiCardInit.wrench();
    this.add(this.wrench);

    // Register mouse events
    this.initTooltip();
    this.initEmpathy();
    this.registerClick();
  }

  // Erase all of the data on the card to make it like it was freshly drawn
  refresh(suitIndex: number | null, rank: number | null) {
    // Reset visual state
    this.empathy = false;
    this.doMisplayAnimation = false;

    this.state = {
      ...initialCardState(this.state.order, this.variant),
      location: this.state.location,
      // We might have some information about this card already
      suitIndex,
      rank,
      // We have to add one to the turn drawn because
      // the "draw" command comes before the "turn" command
      // However, if it was part of the initial deal, then it will correctly be set as turn 0
      turnDrawn: globals.turn === 0 ? 0 : globals.turn + 1,
    };

    // Some variants disable listening on cards
    this.listening(true);

    if (!globals.replay && !globals.spectating) {
      // If it has a "chop move" note on it, we want to keep the chop move border turned on
      if (this.note.chopMoved) {
        this.chopMoveBorder!.show();
      }
      // If it has a "finessed" note on it, we want to keep the finesse border turned on
      if (this.note.finessed) {
        this.finesseBorder!.show();
      }
    }

    // TODO: remove this, state should also set the initial image
    if (this.bareName === '') {
      this.setBareImage();
    }

    // Hide the pips if we have full knowledge of the suit / rank
    if (suitIndex !== null) {
      this.suitPips!.hide();
    }
    if (rank !== null) {
      this.rankPips!.hide();
    }
  }

  setClued() {
    const isClued = (
      this.state.numPositiveClues > 0
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !this.note.unclued
    );

    // When cards are clued,
    // they should raise up a little bit to make it clear that they are touched
    // However, don't do this for other people's hands in Keldon mode
    this.offsetY(0.5 * CARD_H); // The default offset
    if (
      isClued
      && (
        !globals.lobby.settings.keldonMode
        || (this.state.location === globals.playerUs && !globals.replay)
      )
    ) {
      this.offsetY(0.6 * CARD_H);
    }

    this.cluedBorder!.visible(isClued);

    // Remove all special borders when a card is clued, played, discarded
    this.chopMoveBorder!.hide();
    this.finesseBorder!.hide();
  }

  setBareImage() {
    // Optimization: This function is expensive, so don't do it in replays
    // unless we got to the final destination
    // However, if an action happens before the "turn" message is sent,
    // we still need to redraw any affected cards
    if (
      this.bareName !== ''
      && globals.replay
      && globals.turn < globals.replayTurn - 1
    ) {
      console.warn(`Unnecessary setBareImage call. Order: ${this.state.order}`);
      return;
    }

    // Retrieve the identity of the card
    // We may know the identity through normal means
    // (e.g. it is a card that is currently in someone else's hand)
    // We may also know the identity from a future game state
    // (e.g. it is a card in our hand that we have learned about in the future)
    let cardIdentity: CardIdentity | undefined;
    // First check if we have an alternate identity (blank/morphed) for this card
    const replayState = globals.store?.getState().replay!;
    const morphedIdentity = replayState.hypothetical?.morphedIdentities[this.state.order];
    if (morphedIdentity !== undefined) {
      cardIdentity = morphedIdentity;
    } else if (this.state.rank === STACK_BASE_RANK) {
      // We do not track the card identities for the stack base cards
      // For stack bases, the suit and rank is always baked into the state from the get-go
      cardIdentity = {
        suitIndex: this.state.suitIndex,
        rank: this.state.rank,
      };
    } else {
      // Card identities are stored on the global state for convenience
      cardIdentity = globals.store?.getState().cardIdentities[this.state.order];
      if (cardIdentity === undefined) {
        throw new Error(`Failed to get the previously known card identity for card ${this.state.order}.`);
      }
    }

    const unknownSuit = getSuit('Unknown');

    // Find out the suit to display
    // (Unknown is a colorless suit used for unclued cards)
    let suitToShow: Suit | null | undefined;
    if (this.empathy) {
      // If we are in Empathy mode, only show the suit if there is only one possibility left
      if (this.state.colorClueMemory.possibilities.length === 1) {
        const [suitIndex] = this.state.colorClueMemory.possibilities;
        suitToShow = this.variant.suits[suitIndex];
      } else {
        suitToShow = unknownSuit;
      }
    } else {
      // If we are not in Empathy mode, then show the suit if it is known
      if (cardIdentity.suitIndex === null) {
        suitToShow = null;
      } else {
        suitToShow = suitIndexToSuit(cardIdentity.suitIndex, globals.variant);
      }
      if (
        this.state.rank === STACK_BASE_RANK
        && this.note.suitIndex !== null
        && !globals.replay
      ) {
        // Show the suit corresponding to the note
        // The note has precedence over the "real" suit,
        // but only for the stack bases (and not in replays)
        suitToShow = this.variant.suits[this.note.suitIndex];
      }
      if (suitToShow === null && this.note.suitIndex !== null) {
        // Show the suit corresponding to the note
        suitToShow = this.variant.suits[this.note.suitIndex];
      }
      if (suitToShow === null) {
        suitToShow = unknownSuit;
      }
    }

    // Find out the rank to display
    // (6 is a used for unclued cards)
    let rankToShow;
    if (this.empathy) {
      // If we are in Empathy mode, only show the rank if there is only one possibility left
      if (this.state.rankClueMemory.possibilities.length === 1) {
        [rankToShow] = this.state.rankClueMemory.possibilities;
      } else {
        rankToShow = 6;
      }
    } else {
      // If we are not in Empathy mode, then show the rank if it is known
      rankToShow = cardIdentity.rank;
      if (
        this.state.rank === STACK_BASE_RANK
        && this.note.rank !== null
        && !globals.replay
      ) {
        // The card note rank has precedence over the "real" rank,
        // but only for the stack bases (and not in replays)
        rankToShow = this.note.rank;
      }
      if (rankToShow === null) {
        rankToShow = this.note.rank;
      }
      if (rankToShow === null) {
        rankToShow = 6;
      }
    }

    // Set the name
    // (setting "this.bareName" will automatically update how the card appears the next time that
    // the "card" layer is drawn)
    this._blank = (
      morphedIdentity !== undefined
      && morphedIdentity.rank === null
      && morphedIdentity.suitIndex === null
    );

    if (this._blank) {
      // If a card is morphed to a null identity, the card should appear blank no matter what
      this.bareName = DECK_BACK_IMAGE;

      // Disable dragging of this card
      const layoutChild = this.parent;
      if (layoutChild) {
        layoutChild.draggable(false);
        layoutChild.off('dragend');
      }
    } else if (
      // A "blank" note means that the user wants to force the card to appear blank
      this.note?.blank
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !globals.replay
      && !globals.spectating
    ) {
      this.bareName = DECK_BACK_IMAGE;
    } else if (
      (
        globals.lobby.settings.realLifeMode
        || variantRules.isCowAndPig(this.variant)
        || variantRules.isDuck(this.variant)
      ) && (suitToShow === unknownSuit || rankToShow === 6)
    ) {
      // In Real-Life mode or Cow & Pig / Duck variants,
      // always show the vanilla card back if the card is not fully revealed
      this.bareName = DECK_BACK_IMAGE;
    } else {
      this.bareName = `card-${suitToShow!.name}-${rankToShow}`;
    }

    // Show or hide the pips
    if (
      globals.lobby.settings.realLifeMode
      || variantRules.isCowAndPig(this.variant)
      || variantRules.isDuck(this.variant)
      || this._blank
    ) {
      this.suitPips!.hide();
      this.rankPips!.hide();
    } else {
      this.suitPips!.visible(suitToShow === unknownSuit);
      this.rankPips!.visible(rankToShow === UNKNOWN_CARD_RANK);
    }

    // Show or hide the "trash" image
    this.trashcan!.visible((
      this.note.knownTrash
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !globals.replay
      && !globals.spectating
    ));

    // Show or hide the "fixme" image
    this.wrench!.visible((
      this.note.needsFix
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !globals.replay
      && !globals.spectating
    ));

    let suitIndex: number | null = null;
    if (suitToShow === undefined || suitToShow === unknownSuit) {
      suitIndex = null;
    } else {
      suitIndex = this.variant.suits.indexOf(suitToShow);
    }

    this.setDirectionArrow(suitIndex);
    this.setFade();
    this.setCritical();

    globals.layers.card.batchDraw();
  }

  // Show or hide the direction arrow (for specific variants)
  setDirectionArrow(suitIndex: number | null) {
    if (!variantRules.hasReversedSuits(this.variant)) {
      return;
    }

    if (suitIndex === null || this.state.rank === STACK_BASE_RANK) {
      this.arrow!.hide();
      return;
    }

    const direction = globals.stackDirections[suitIndex];
    const suit = this.variant.suits[suitIndex];

    let shouldShowArrow;
    if (variantRules.isUpOrDown(this.variant)) {
      // In "Up or Down" variants, the arrow should be shown when the stack direction is determined
      // (and the arrow should be cleared when the stack is finished)
      shouldShowArrow = (
        direction === StackDirection.Up
        || direction === StackDirection.Down
      );
    } else if (suit.reversed) {
      // In variants with a reversed suit, the arrow should always be shown on the reversed suit
      shouldShowArrow = true;
    } else {
      shouldShowArrow = false;
    }

    this.arrow!.visible(shouldShowArrow);
    if (!shouldShowArrow) {
      return;
    }

    this.arrow!.rotation(direction === StackDirection.Up ? 180 : 0);
    this.arrowBase!.stroke(suit.fill);
    if (suit.fill === 'multi') {
      // We can't use a fill gradient because the "fill" is actually a big stroke
      // (the Konva arrow object is not a shape, but instead a very thick line)
      // Instead, just use the the first gradient color
      this.arrowBase!.stroke(suit.fillColors[0]);
    }
    if (this.rankPips!.isVisible()) {
      this.setArrowMiddleRight();
    } else {
      this.setArrowBottomRight();
    }
  }

  private setArrowMiddleRight = () => {
    this.arrow!.y(0.5 * CARD_H);
  };

  private setArrowBottomRight = () => {
    this.arrow!.y(0.79 * CARD_H);
  };

  // Fade this card if it is useless, fully revealed, and still in a player's hand
  setFade() {
    if (
      globals.lobby.settings.realLifeMode
      || globals.options.speedrun
      || variantRules.isThrowItInAHole(this.variant)
      || this.state.rank === STACK_BASE_RANK
    ) {
      return;
    }

    const oldOpacity = this.opacity();

    let newOpacity = 1;
    if (
      this.state.suitIndex !== null
      && this.state.rank !== null
      && !cardRules.isClued(this.state)
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !this.empathy
      && !this.needsToBePlayed()
    ) {
      newOpacity = CARD_FADE;
    }

    // Override the above logic and always fade the card if it is explicitly marked as known trash
    if (this.trashcan!.isVisible() && this.state.numPositiveClues === 0) {
      newOpacity = CARD_FADE;
    }

    if (oldOpacity === newOpacity) {
      return;
    }

    this.opacity(newOpacity);
  }

  // Show an indicator if this card is critical, unclued, unmarked, and still in a player's hand
  setCritical() {
    this.criticalIndicator!.visible((
      this.isCritical()
      && (!this.empathy || this.state.identityDetermined)
      && !globals.lobby.settings.realLifeMode
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !this.note.blank
    ));
  }

  updateNotePossibilities() {
    // If we wrote a card identity note and all the possibilities for that note have been
    // eliminated, unmorph the card
    // e.g. a note of "r1" is now impossible because red 1 has 0 cards left

    const isSuitImpossible = this.note.suitIndex !== null
      && !this.state.colorClueMemory.possibilities.includes(this.note.suitIndex);

    const isRankImpossible = this.note.rank !== null
      && !this.state.rankClueMemory.possibilities.includes(this.note.rank);

    if (isSuitImpossible || isRankImpossible) {
      // Unmorph
      this.note.suitIndex = null;
      this.note.rank = null;
      this.setBareImage();
    }
  }

  // We need to redraw this card's suit and rank in a shared replay or hypothetical
  // based on deckOrder and hypoRevealed
  /* eslint-disable */
  replayRedraw() {
    /*
    const cardIdentity = globals.deckOrder[this.state.order];
    if (!cardIdentity) {
      throw new Error(`The identity for card ${this.state.order} was not found in the "replayRedraw()" function.`);
    }
    const trueSuitIndex = cardIdentity.suitIndex;
    if (trueSuitIndex === null) {
      throw new Error(`The suit identity for card ${this.state.order} was not found in the "replayRedraw() function.`);
    }
    const trueSuit = suitIndexToSuit(trueSuitIndex, globals.variant);
    const trueRank = globals.deckOrder[this.state.order].rank;
    if (trueRank === null) {
      throw new Error(`The rank identity for card ${this.state.order} was not found in the "replayRedraw() function.`);
    }

    if (
      // If we are in a hypothetical and "hypoRevealed" is turned off
      // and this card was drawn from the deck since the hypothetical started
      globals.hypothetical
      && !globals.hypoRevealed
      && globals.hypoFirstDrawnIndex
      && this.state.order >= globals.hypoFirstDrawnIndex
    ) {
      if (
        (this.state.suitIndex === trueSuit && this.state.rank === trueRank)
        || (this.state.suitIndex === null && this.state.rank === null)
      ) {
        // We need to hide this card unless it was morphed from its real identity
        // -1 is used for null suits and ranks
        this.convert(-1, -1);
      }
    } else if (this.state.suitIndex === null || this.state.rank === null) {
      // Otherwise, we should make sure to fill in information from deckOrder
      // unless this card is fully known, possibly morphed
      this.convert(trueSuitIndex, trueRank);

      // Check if we can drag this card now
      const layoutChild = this.parent as unknown as LayoutChild;
      if (layoutChild) {
        layoutChild.checkSetDraggable();
      }
    }
    */
    /* eslint-enable */
  }

  removeFromParent() {
    // Remove the card from the player's hand in preparation of adding it to either
    // the play stacks or the discard pile
    const layoutChild = this.parent;
    if (!layoutChild || !layoutChild.parent) {
      // If a tween is destroyed in the middle of animation,
      // it can cause a card to be orphaned
      return;
    }
    const pos = layoutChild.getAbsolutePosition();
    layoutChild.rotation(layoutChild.parent.rotation());
    layoutChild.remove();
    layoutChild.setAbsolutePosition(pos);
  }

  animateToPlayerHand(holder: number) {
    const child = this.parent as unknown as LayoutChild;
    const oldParent = child!.parent;
    this.removeFromParent();

    // Sometimes the LayoutChild can get hidden if another card is on top of it in a play stack
    // and the user rewinds to the beginning of the replay
    child!.visible(true);
    child!.rotation(-globals.elements.playerHands[holder].rotation());
    child!.opacity(1); // Cards can be faded in certain variants
    if (!oldParent) {
      // Animate from the deck
      const deckPos = globals.elements.deck!.cardBack.getAbsolutePosition();
      child!.setAbsolutePosition(deckPos);
      const scale = globals.elements.deck!.cardBack.width() / CARD_W;
      child!.scale({
        x: scale,
        y: scale,
      });
    }

    // Add it to the player's hand (which will automatically tween the card)
    globals.elements.playerHands[holder].addChild(child);
    globals.elements.playerHands[holder].moveToTop();
  }

  animateToDeck() {
    const layoutChild = this.parent as unknown as LayoutChild;
    if (
      layoutChild === undefined
      || layoutChild.parent === null
      || layoutChild.parent === undefined
    ) {
      // First initialization
      return;
    }
    this.removeFromParent();

    const scale = globals.elements.deck!.cardBack.width() / CARD_W;
    if (globals.animateFast) {
      layoutChild.checkSetDraggable();
      layoutChild.hide();
    } else {
      // Sometimes the LayoutChild can get hidden if another card is on top of it in a play stack
      // and the user rewinds to the beginning of the replay
      layoutChild.show();
      layoutChild.opacity(1); // Cards can be faded in certain variants
      const pos = layoutChild.getAbsolutePosition();
      globals.elements.deck!.add(layoutChild as any);
      layoutChild.setAbsolutePosition(pos);

      // Animate to the deck
      this.startedTweening();
      animate(layoutChild, {
        duration: 0.5,
        x: 0,
        y: 0,
        scale,
        rotation: 0,
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          if (this === undefined || layoutChild === undefined) {
            return;
          }
          this.finishedTweening();
          layoutChild.checkSetDraggable();
          layoutChild.hide();
          this.removeFromParent();
        },
      }, true);
    }
  }

  animateToPlayStacks() {
    this.removeFromParent();
    // We add a LayoutChild to a PlayStack
    if (variantRules.isThrowItInAHole(this.variant) && !globals.replay) {
      // The act of adding it will automatically tween the card
      const hole = globals.elements.playStacks.get('hole')!;
      hole.addChild(this.parent as any);

      // We do not want this card to interfere with writing notes on the stack bases
      this.listening(false);
    } else {
      // The act of adding it will automatically tween the card
      const suit = this.variant.suits[this.state.suitIndex!];
      const playStack = globals.elements.playStacks.get(suit);
      if (!playStack) {
        // We might have played a hidden card in a hypothetical
        return;
      }
      playStack.addChild(this.parent as any);

      // We also want to move this stack to the top so that
      // cards do not tween behind the other play stacks when travelling to this stack
      playStack.moveToTop();
    }
  }

  animateToDiscardPile() {
    this.removeFromParent();

    // We add a LayoutChild to a CardLayout
    const suit = this.variant.suits[this.state.suitIndex!];
    const discardStack = globals.elements.discardStacks.get(suit);
    if (!discardStack) {
      // We might have discarded a hidden card in a hypothetical
      return;
    }
    discardStack.addChild(this.parent as any);

    // We need to bring the discarded card to the top so that when it tweens to the discard
    // pile, it will fly on top of the play stacks and other player's hands
    // However, if we use "globals.elements.discardStacks.get(suit).moveToTop()" like we do in
    // the "animateToPlayStacks()" function,
    // then the discard stacks will not be arranged in the correct order
    // Thus, move all of the discord piles to the top in order so that they will be properly
    // overlapping (the bottom-most stack should have priority over the top)
    for (const stack of globals.elements.discardStacks) {
      // Since "discardStacks" is a Map(),
      // "stack" is an array containing a Suit and CardLayout
      if (stack[1] !== undefined) {
        stack[1].moveToTop();
      }
    }
  }

  setNote(note: string) {
    notes.set(this.state.order, note);
    notes.update(this);
    if (note !== '') {
      notes.show(this);
    }
  }

  appendNote(note: string) {
    // By default, set the note directly on the card
    let newNote = note;

    // If we had an existing note, append the new note to the end using pipe notation
    const existingNote = globals.ourNotes[this.state.order];
    if (existingNote !== '') {
      newNote = `${existingNote} | ${note}`;
    }

    this.setNote(newNote);
  }

  getSlotNum() {
    if (!this.parent || !this.parent.parent) {
      return -1;
    }

    const numCardsInHand = this.parent.parent.children.length;
    for (let i = 0; i < numCardsInHand; i++) {
      const layoutChild = this.parent.parent.children[i];
      if ((layoutChild.children[0] as HanabiCard).state.order === this.state.order) {
        return numCardsInHand - i;
      }
    }

    return -1;
  }

  private isCritical() {
    return this.cardRule(cardRules.isCritical);
  }

  private needsToBePlayed() {
    return this.cardRule(cardRules.needsToBePlayed);
  }

  isPotentiallyPlayable() {
    return this.cardRule(cardRules.isPotentiallyPlayable);
  }

  // Gathers all the appropriate state and passes as arguments to
  // a function from cardRules.ts
  private cardRule(fn: (
    variant: Variant,
    deck: readonly CardState[],
    playStacks: ReadonlyArray<readonly number[]>,
    stackDirections: readonly StackDirection[],
    card: CardState,
  ) => boolean) {
    const visibleState = globals.store!.getState().visibleState;
    if (!visibleState) {
      return false;
    }
    const variant = this.variant;
    const deck = visibleState.deck;
    const playStacks = visibleState.playStacks;
    const stackDirections = visibleState.playStacksDirections;
    const state = this.state;
    return fn(variant, deck, playStacks, stackDirections, state);
  }

  // Update all UI pips to their state
  updatePips(clueType: ClueType | null = null) {
    function updatePip(
      pipState: PipState,
      hasPositiveClues: boolean,
      pip: Konva.Shape | RankPip,
      x : Konva.Shape,
    ) {
      switch (pipState) {
        case 'Visible': {
          pip.show();
          x.hide();
          break;
        }
        case 'Hidden': {
          pip.hide();
          x.hide();
          break;
        }
        case 'Eliminated': {
          pip.show();
          x.show();
          break;
        }
        default:
          break;
      }
      // TODO: Positive clues on suits
      if (pip instanceof RankPip) {
        if (hasPositiveClues && pipState !== 'Hidden') {
          pip.showPositiveClue();
        } else {
          pip.hidePositiveClue();
        }
      }
    }

    if (clueType === null || clueType === ClueType.Color) {
      for (const [suit, pipState] of this.state.colorClueMemory.pipStates.entries()) {
        const pip = this.suitPipsMap.get(suit)!;
        const x = this.suitPipsXMap.get(suit)!;
        // TODO: Positive clues on suits
        updatePip(pipState, false, pip, x);
      }
    }
    if (clueType === null || clueType === ClueType.Rank) {
      for (const [rank, pipState] of this.state.rankClueMemory.pipStates.entries()) {
        const pip = this.rankPipsMap.get(rank)!;
        const x = this.rankPipsXMap.get(rank)!;
        const hasPositiveClues = this.state.rankClueMemory.positiveClues.includes(rank);
        updatePip(pipState, hasPositiveClues, pip, x);
      }
    }
  }

  private registerClick() {
    // Define the clue log mouse handlers
    this.on('mousemove tap', () => {
      globals.elements.clueLog!.showMatches(this);
      globals.layers.UI.batchDraw();
    });
    this.on('mouseout', () => {
      globals.elements.clueLog!.showMatches(null);
      globals.layers.UI.batchDraw();
    });

    // Define the other mouse handlers
    this.on('click tap', HanabiCardClick);
    this.on('mousedown', HanabiCardClickSpeedrun);
    this.on('mousedown', this.cardStartDrag);
  }

  private cardStartDrag(event: Konva.KonvaEventObject<MouseEvent>) {
    if (
      event.evt.button !== 0 // Dragging uses left click
      || !this.parent
      || !this.parent.draggable()
    ) {
      return;
    }

    // Hide any visible arrows on the rest of a hand when the card begins to be dragged
    if (
      this.parent === undefined
      || this.parent.parent === undefined
      || this.parent.parent === null
    ) {
      return;
    }
    const hand = this.parent.parent;
    let hideArrows = false;
    for (const layoutChild of hand.children.toArray()) {
      const card: HanabiCard = (layoutChild as Konva.Node).children[0] as HanabiCard;
      for (const arrow of globals.elements.arrows) {
        if (arrow.pointingTo === card) {
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

  private initTooltip() {
    // If the user mouses over the card, show a tooltip that contains the note
    // (we don't use the "tooltip.init()" function because we need the extra conditions in the
    // "mousemove" event)
    this.tooltipName = `card-${this.state.order}`;
    this.on('mousemove', function cardMouseMove(this: HanabiCard) {
      // Don't do anything if there is not a note on this card
      if (!this.noteIndicator!.isVisible()) {
        return;
      }

      // Don't open any more note tooltips if the user is currently editing a note
      if (globals.editingNote !== null) {
        return;
      }

      // If we are spectating and there is an new note, mark it as seen
      if (this.noteIndicator!.rotated) {
        this.noteIndicator!.rotated = false;
        this.noteIndicator!.rotate(-15);
        globals.layers.card.batchDraw();
      }

      globals.activeHover = this;
      notes.show(this);
    });

    this.on('mouseout', function cardMouseOut(this: HanabiCard) {
      globals.activeHover = null;

      // Don't close the tooltip if we are currently editing a note
      if (globals.editingNote !== null) {
        return;
      }

      const tooltipElement = $(`#tooltip-${this.tooltipName}`);
      tooltipElement.tooltipster('close');
    });
  }

  // In a game, click on a teammate's hand to it show as it would to that teammate
  // (or show your own hand as it should appear without any identity notes on it)
  // (or, in a replay, show the hand as it appeared at that moment in time)
  private initEmpathy() {
    this.on('mousedown', (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (
        event.evt.button !== 0 // Only enable Empathy for left-clicks
        // Disable Empathy if a modifier key is pressed
        // (unless we are in a speedrun, because then Empathy is mapped to Ctrl + left click)
        || (event.evt.ctrlKey && !globals.options.speedrun && !globals.lobby.settings.speedrunMode)
        || (
          !event.evt.ctrlKey
          && (globals.options.speedrun || globals.lobby.settings.speedrunMode)
          && !globals.replay
          && !globals.spectating
        )
        || event.evt.shiftKey
        || event.evt.altKey
        || event.evt.metaKey
        || this.tweening // Disable Empathy if the card is tweening
        // Clicking on a played card goes to the turn that it was played
        || cardRules.isPlayed(this.state)
        // Clicking on a discarded card goes to the turn that it was discarded
        || cardRules.isDiscarded(this.state)
        || this.state.order > globals.deck.length - 1 // Disable empathy for the stack bases
      ) {
        return;
      }

      globals.activeHover = this;
      setEmpathyOnHand(true);
    });

    this.on('mouseup mouseout', (event: Konva.KonvaEventObject<MouseEvent>) => {
      // Konva.MouseEvent does not have a "type" property for some reason
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if ((event as any).type === 'mouseup' && event.evt.button !== 0) { // Left-click
        return;
      }

      globals.activeHover = null;
      setEmpathyOnHand(false);
    });

    const setEmpathyOnHand = (enabled: boolean) => {
      // Disable Empathy for the stack bases
      if (this.state.order > globals.deck.length - 1) {
        return;
      }

      if (!this.parent || !this.parent.parent) {
        return;
      }
      const hand = this.parent.parent as unknown as CardLayout;
      if (hand === undefined || hand.children.length === 0 || hand.empathy === enabled) {
        return;
      }

      hand.empathy = enabled;
      hand.children.each((layoutChild) => {
        const card = layoutChild.children[0] as HanabiCard;
        if (card === undefined) {
          // When rewinding, sometimes the card can be undefined
          return;
        }
        card.empathy = enabled;
        card.setBareImage();
      });
      globals.layers.card.batchDraw();
    };
  }

  checkSpecialNote() {
    const noteText = globals.ourNotes[this.state.order];

    this.note = notes.checkNoteIdentity(this.variant, noteText);
    notes.checkNoteImpossibility(this.variant, this.state, this.note);
    this.setClued();

    // Feature 1 - Morph the card if it has an "exact" card note
    // (or clear the bare image if the note was deleted/changed)
    this.setBareImage();

    // Feature 2 - Give the card a special border if it is chop moved
    const showSpecialBorder = (
      !this.cluedBorder!.isVisible()
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !globals.replay
      && !globals.spectating
    );

    this.chopMoveBorder!.visible((
      this.note.chopMoved
      && showSpecialBorder
    ));

    // Feature 3 - Give the card a special border if it is finessed
    this.finesseBorder!.visible((
      this.note.finessed
      && showSpecialBorder
    ));

    globals.layers.card.batchDraw();
  }
}
