// The HanabiCard object represents a single card
// It has a LayoutChild parent

import Konva from 'konva';
import { getSuit } from '../data/gameData';
import initialCardState from '../reducers/initialStates/initialCardState';
import * as cardRules from '../rules/card';
import * as variantRules from '../rules/variant';
import CardIdentity from '../types/CardIdentity';
import CardNote from '../types/CardNote';
import CardState from '../types/CardState';
import CardStatus from '../types/CardStatus';
import { STACK_BASE_RANK, UNKNOWN_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Suit from '../types/Suit';
import Variant from '../types/Variant';
import * as arrows from './arrows';
import CardLayout from './CardLayout';
import { CARD_FADE, CARD_H, CARD_W } from './constants';
import NodeWithTooltip from './controls/NodeWithTooltip';
import NoteIndicator from './controls/NoteIndicator';
import RankPip from './controls/RankPip';
import { suitIndexToSuit } from './convert';
import cursorSet, { CursorType } from './cursorSet';
import globals from './globals';
import HanabiCardClick from './HanabiCardClick';
import HanabiCardClickSpeedrun from './HanabiCardClickSpeedrun';
import * as HanabiCardInit from './HanabiCardInit';
import { HanabiCardTap, HanabiCardDblTap } from './HanabiCardTouchActions';
import { animate } from './konvaHelpers';
import LayoutChild from './LayoutChild';
import * as notes from './notes';
import * as tooltips from './tooltips';

const DECK_BACK_IMAGE = 'deck-back';

export default class HanabiCard extends Konva.Group implements NodeWithTooltip {
  private readonly variant: Variant;

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

  private _tweening: boolean = false;
  get tweening() { return this._tweening; }

  private tweenCallbacks: Function[] = [];

  startedTweening() {
    this._tweening = true;

    if (!this.isListening()) {
      // HACK: since Konva doesn't propagate listening hierarchically until v7,
      // stop the image from listening
      this.bare.listening(false);
    }
  }

  finishedTweening() {
    if (this.isListening()) {
      // HACK: since Konva doesn't propagate listening hierarchically until v7,
      // stop the image from listening
      this.bare.listening(true);
    }

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

  private _visibleSuitIndex: number | null = null;
  get visibleSuitIndex() {
    return this._visibleSuitIndex;
  }

  private _visibleRank: number | null = null;
  get visibleRank() {
    return this._visibleRank;
  }

  private empathy: boolean = false;

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

  private _layout: LayoutChild;
  get layout() {
    return this._layout;
  }

  constructor(config: Konva.ContainerConfig, variant: Variant) {
    super(config);
    this.listening(true);
    this.variant = variant;

    // Cards should start off with a constant width and height
    this.width(CARD_W);
    this.height(CARD_H);
    this.x(CARD_W / 2);
    this.y(CARD_H / 2);
    this.offset({
      x: 0.5 * CARD_W,
      y: 0.5 * CARD_H,
    });

    // Order is defined upon first initialization
    // This state is only used by stack bases
    // TODO: move stack bases to be a separate class that shares code with HanabiCard
    const initialState = initialCardState(config.order, this.variant);
    this._state = {
      ...initialState,
      suitIndex: typeof config.suitIndex === 'number' ? config.suitIndex : initialState.suitIndex,
      rank: typeof config.rank === 'number' ? config.rank : initialState.rank,
    };

    // Initialize various elements/features of the card
    this.bare = HanabiCardInit.image(
      () => this.bareName,
    );
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
    this.registerMouseHandlers();

    // Add a parent layout
    this._layout = new LayoutChild(this);

    // Initialize the bare image for stack bases
    if (typeof config.suitIndex === 'number' || typeof config.rank === 'number') {
      this.setBareImage();
    }
  }

  setBorder() {
    this.cluedBorder!.visible(this.shouldShowClueBorder());
    this.chopMoveBorder!.visible(this.shouldShowChopMoveBorder());
    this.finesseBorder!.visible(this.shouldShowFinesseBorder());

    // Additionally, when cards are clued,
    // they should raise up a little bit to make it clear that they are touched
    // Call setVisualEffect, which handles that
    this.setVisualEffect(this.visualEffectCursor, 0);
  }

  private shouldShowAnyBorder() {
    return (
      !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && (!this.note.unclued || !globals.state.playing)
    );
  }

  private shouldShowClueBorder() {
    return this.shouldShowAnyBorder() && cardRules.isClued(this.state);
  }

  private shouldShowChopMoveBorder() {
    return (
      this.note.chopMoved
      && this.shouldShowAnyBorder()
      // The clue border has precedence over the chop move border
      && !this.shouldShowClueBorder()
      && globals.state.playing
    );
  }

  private shouldShowFinesseBorder() {
    return (
      this.note.finessed
      && this.shouldShowAnyBorder()
      // The clue border and the chop move border have precedence over the finesse border
      && !this.shouldShowClueBorder()
      && !this.shouldShowChopMoveBorder()
      && globals.state.playing
    );
  }

  private isRaisedBecauseOfClues() {
    // On Keldon mode, only the player should see the cards raised on their own hand
    const shouldShowOnKeldonMode = (
      this.state.location === globals.metadata.ourPlayerIndex
      && !globals.state.finished
    );

    return (
      this.shouldShowClueBorder()
      && !this.layout.isDragging()
      && (!globals.lobby.settings.keldonMode || shouldShowOnKeldonMode)
    );
  }

  // setBareImage adjusts the "bare" image of the card
  // (e.g. the HTML5 canvas drawing from "globals.scaledCardImages")
  // Additionally, it toggles various card elements (pips, shadows, fading, etc.)
  setBareImage() {
    const cardIdentity = this.getCardIdentity();

    // ("Unknown" is a colorless suit used for unclued cards)
    const unknownSuit = getSuit('Unknown');

    const suitToShow = this.getSuitToShow(cardIdentity, unknownSuit);
    const rankToShow = this.getRankToShow(cardIdentity);

    // Cards that are morphed to be blank should not be draggable
    const morphedBlank = this.isMorphedBlank();
    this.layout.blank = morphedBlank; // Also let the LayoutChild know about it
    if (morphedBlank) {
      this.layout.draggable(false);
      this.layout.off('dragend');
    }

    // Set the visible state
    // (this must be after the morphed blank check)
    if (suitToShow === unknownSuit) {
      this._visibleSuitIndex = null;
    } else {
      this._visibleSuitIndex = this.variant.suits.indexOf(suitToShow);
    }
    if (rankToShow === UNKNOWN_CARD_RANK) {
      this._visibleRank = null;
    } else {
      this._visibleRank = rankToShow;
    }

    // Setting "this.bareName" will automatically update how the card appears the next time that the
    // "card" layer is drawn
    this.bareName = this.getBareName(morphedBlank, suitToShow, rankToShow, unknownSuit);

    // Set pips, shadow, etc.
    this.setCardElements(morphedBlank, suitToShow, rankToShow, unknownSuit);

    // Set fading, criticality, etc.
    this.setStatus();

    globals.layers.card.batchDraw();
  }

  getCardIdentity() {
    // We may know the identity through normal means
    // (e.g. it is a card that is currently in someone else's hand)
    // We may also know the identity from a future game state
    // (e.g. it is a card in our hand that we have learned about in the future)

    // First, check if we have an alternate identity (e.g. blank or morphed) for this card
    if (globals.state.replay.hypothetical !== null) {
      const morphedIdentity = globals.state.replay.hypothetical.morphedIdentities[this.state.order];
      if (morphedIdentity !== undefined) {
        return morphedIdentity;
      }
    }

    // We do not track the card identities for the stack bases
    // (for stack bases, the suit and rank is always baked into the state from the get-go)
    if (this.state.rank === STACK_BASE_RANK) {
      return {
        suitIndex: this.state.suitIndex,
        rank: this.state.rank,
      };
    }

    // Card identities are stored on the global state for convenience
    const cardIdentity = globals.state.cardIdentities[this.state.order];
    if (cardIdentity === undefined) {
      throw new Error(`Failed to get the previously known card identity for card ${this.state.order}.`);
    }
    return cardIdentity;
  }

  getSuitToShow(cardIdentity: CardIdentity, unknownSuit: Suit) {
    // If we are in Empathy mode, only show the suit if there is only one possibility left
    if (this.empathy) {
      if (this.state.suitDetermined) {
        const suitIndex = this.state.suitIndex!;
        return this.variant.suits[suitIndex];
      }

      return unknownSuit;
    }

    // Show the suit if it is known
    if (cardIdentity.suitIndex !== null) {
      return suitIndexToSuit(cardIdentity.suitIndex, this.variant) ?? unknownSuit;
    }

    // If we have a note identity on the card, show the suit corresponding to the note
    if (this.note.suitIndex !== null) {
      return this.variant.suits[this.note.suitIndex];
    }

    return unknownSuit;
  }

  getRankToShow(cardIdentity: CardIdentity) {
    // If we are in Empathy mode, only show the rank if there is only one possibility left
    if (this.empathy) {
      if (this.state.rankDetermined && this.state.rank !== null) {
        return this.state.rank;
      }

      return UNKNOWN_CARD_RANK;
    }

    // If we have a note identity on the card, show the rank corresponding to the note
    // (specifically for stack bases in ongoing games; we want notes to have precedence in this case
    // so that players can make notes in "Throw It in a Hole" variants)
    if (this.note.rank !== null && this.state.rank === STACK_BASE_RANK && !globals.state.finished) {
      return this.note.rank;
    }

    // Show the rank if it is known
    if (cardIdentity.rank !== null) {
      return cardIdentity.rank;
    }

    // If we have a note identity on the card, show the rank corresponding to the note
    if (this.note.rank !== null) {
      return this.note.rank;
    }

    return UNKNOWN_CARD_RANK;
  }

  isMorphedBlank() {
    if (globals.state.replay.hypothetical === null) {
      return false;
    }

    const morphedIdentity = globals.state.replay.hypothetical.morphedIdentities[this.state.order];
    return (
      morphedIdentity !== undefined
      && morphedIdentity.rank === null
      && morphedIdentity.suitIndex === null
    );
  }

  getBareName(morphedBlank: boolean, suitToShow: Suit, rankToShow: number, unknownSuit: Suit) {
    // If a card is morphed to a null identity, the card should appear blank no matter what
    if (morphedBlank) {
      return DECK_BACK_IMAGE;
    }

    // If a card has a "blank" note on it, the user wants to force the card to appear blank
    if (
      this.note.blank
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && globals.state.playing
    ) {
      return DECK_BACK_IMAGE;
    }

    // In Real-Life mode, or in Cow & Pig variants, or in Duck variants,
    // always show the vanilla card back if the card is not fully revealed
    if (
      (
        globals.lobby.settings.realLifeMode
        || variantRules.isCowAndPig(this.variant)
        || variantRules.isDuck(this.variant)
      ) && (suitToShow === unknownSuit || rankToShow === UNKNOWN_CARD_RANK)
    ) {
      return DECK_BACK_IMAGE;
    }

    return `card-${suitToShow!.name}-${rankToShow}`;
  }

  setCardElements(morphedBlank: boolean, suitToShow: Suit, rankToShow: number, unknownSuit: Suit) {
    // Show or hide the pips
    if (
      globals.lobby.settings.realLifeMode
      || variantRules.isCowAndPig(this.variant)
      || variantRules.isDuck(this.variant)
      || morphedBlank
    ) {
      this.suitPips!.hide();
      this.rankPips!.hide();
    } else {
      const suitUnknown = suitToShow === unknownSuit;
      const rankUnknown = rankToShow === UNKNOWN_CARD_RANK;
      this.suitPips!.visible(suitUnknown);
      this.rankPips!.visible(rankUnknown);
    }

    // Show or hide the "trash" image
    this.trashcan!.visible((
      this.note.knownTrash
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && globals.state.playing
    ));

    // Show or hide the "fixme" image
    this.wrench!.visible((
      this.note.needsFix
      && !this.empathy
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && globals.state.playing
    ));

    // Show or hide the direction arrows
    if (this.arrow !== null && globals.state.visibleState !== null) {
      if (this.visibleSuitIndex === null || this.visibleRank === STACK_BASE_RANK) {
        this.arrow.hide();
      } else {
        this.setDirectionArrow(
          this.visibleSuitIndex,
          globals.state.visibleState.playStackDirections[this.visibleSuitIndex],
        );
      }
    }

    // Show or hide the shadow on the card
    const shadowVisible = (
      this.visibleRank !== STACK_BASE_RANK
      && !globals.options.speedrun
    );
    if (this.bare.shadowEnabled() !== shadowVisible) {
      this.bare.shadowEnabled(shadowVisible);
    }
  }

  // Show or hide the direction arrow (for specific variants)
  setDirectionArrow(suitIndex: number, direction: StackDirection) {
    if (!variantRules.hasReversedSuits(this.variant)) {
      return;
    }

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

  setStatus() {
    const visibleState = globals.state.visibleState;
    if (visibleState === null) {
      return;
    }

    let status;
    if (
      this.visibleSuitIndex === null
      || this.visibleRank === null
      || this.visibleRank === STACK_BASE_RANK
    ) {
      status = CardStatus.NeedsToBePlayed; // Default status, not faded and not critical
    } else {
      status = visibleState.cardStatus[this.visibleSuitIndex][this.visibleRank];
    }

    this.setFade(status === CardStatus.Trash);
    this.setCritical(status === CardStatus.Critical);
    notes.setCardIndicator(this.state.order);
  }

  private setFade(isTrash: boolean) {
    const opacity = this.shouldSetFade(isTrash) ? CARD_FADE : 1;
    this.opacity(opacity);
  }

  private shouldSetFade(isTrash: boolean) {
    // Override any logic and always fade the card if it is explicitly marked as known trash
    if (this.trashcan!.isVisible() && this.state.numPositiveClues === 0) {
      return true;
    }

    return (
      isTrash
      && !cardRules.isClued(this.state)
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !this.note.blank
      && !this.note.chopMoved
      && !variantRules.isThrowItInAHole(this.variant)
      && !globals.options.speedrun
      && !globals.lobby.settings.realLifeMode
    );
  }

  private setCritical(critical: boolean) {
    const visible = this.shouldSetCritical(critical);
    this.criticalIndicator!.visible(visible);
  }

  private shouldSetCritical(critical: boolean) {
    return (
      critical
      && !cardRules.isPlayed(this.state)
      && !cardRules.isDiscarded(this.state)
      && !globals.lobby.settings.realLifeMode
    );
  }

  updateNotePossibilities() {
    // If we wrote a card identity note and all the possibilities for that note have been
    // eliminated, unmorph the card
    // e.g. a note of "r1" is now impossible because red 1 has 0 cards left
    if (!cardRules.canPossiblyBe(this.state, this.note.suitIndex, this.note.rank)) {
      // Unmorph
      this.note.suitIndex = null;
      this.note.rank = null;
      this.setBareImage();
    }
  }

  // A card's parent is a LayoutChild
  // The parent of the LayoutChild is the location of the card
  // (e.g. a player's hand, the play stacks, etc.)
  // The LayoutChild is removed from the parent prior to the card changing location
  removeLayoutChildFromParent() {
    // Ensure that empathy is disabled prior to removing a card from a player's hand
    this.setEmpathy(false);

    // Remove the card from the player's hand in preparation of adding it to either
    // the play stacks or the discard pile
    if (!this.layout.parent) {
      // If a tween is destroyed in the middle of animation,
      // it can cause a card to be orphaned
      // Ensure the position is reset to the deck, if unset
      if (this.layout.x() === 0 && this.layout.y() === 0) {
        this.moveToDeckPosition();
      }
      return;
    }
    const pos = this.layout.getAbsolutePosition();
    this.layout.rotation(this.layout.parent.rotation());
    this.layout.remove();
    this.layout.setAbsolutePosition(pos);
  }

  moveToDeckPosition() {
    const deckPos = globals.elements.deck!.cardBack.getAbsolutePosition();
    this.layout.setAbsolutePosition(deckPos);
    const scale = globals.elements.deck!.cardBack.width() / CARD_W;
    this.layout.scale({
      x: scale,
      y: scale,
    });
  }

  animateToPlayerHand(holder: number) {
    this.removeLayoutChildFromParent();

    // Sometimes the LayoutChild can get hidden if another card is on top of it in a play stack
    // and the user rewinds to the beginning of the replay
    this.layout.visible(true);
    this.layout.rotation(-globals.elements.playerHands[holder].rotation());
    this.layout.opacity(1); // Cards can be faded in certain variants

    // Add it to the player's hand (which will automatically tween the card)
    globals.elements.playerHands[holder].addChild(this.layout);
    globals.elements.playerHands[holder].moveToTop();

    // In case listening was disabled, which happens in some variants
    this.listening(true);
  }

  animateToDeck() {
    const layoutChild = this.layout;
    if (
      layoutChild === undefined
      || layoutChild.parent === null
      || layoutChild.parent === undefined
    ) {
      // First initialization
      return;
    }
    this.removeLayoutChildFromParent();

    const scale = globals.elements.deck!.cardBack.width() / CARD_W;
    if (globals.animateFast) {
      layoutChild.checkSetDraggable();
      this.setVisualEffect('default');
      layoutChild.hide();
    } else {
      // Sometimes the LayoutChild can get hidden if another card is on top of it in a play stack
      // and the user rewinds to the beginning of the replay
      layoutChild.show();
      layoutChild.opacity(1); // Cards can be hidden in certain variants
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
          this.finishedTweening();
          layoutChild.checkSetDraggable();
          layoutChild.hide();
          this.removeLayoutChildFromParent();
        },
      }, true);
    }
  }

  animateToPlayStacks() {
    this.removeLayoutChildFromParent();

    // The act of adding it will automatically tween the card
    const suit = this.variant.suits[this.state.suitIndex!];
    const playStack = globals.elements.playStacks.get(suit);
    if (!playStack) {
      // We might have played a hidden card in a hypothetical
      return;
    }
    playStack.addChild(this.layout);

    // We also want to move this stack to the top so that
    // cards do not tween behind the other play stacks when travelling to this stack
    playStack.moveToTop();

    // In case listening was disabled, which happens in some variants
    this.listening(true);
  }

  animateToHole() {
    this.removeLayoutChildFromParent();

    // The act of adding it will automatically tween the card
    const hole = globals.elements.playStacks.get('hole')!;
    hole.addChild(this.layout);

    // We do not want this card to interfere with writing notes on the stack bases
    this.listening(false);
  }

  animateToDiscardPile() {
    this.removeLayoutChildFromParent();

    // We add a LayoutChild to a CardLayout
    const suit = this.variant.suits[this.state.suitIndex!];
    const discardStack = globals.elements.discardStacks.get(suit);
    if (!discardStack) {
      // We might have discarded a hidden card in a hypothetical
      return;
    }
    discardStack.addChild(this.layout);

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

    // In case listening was disabled, which happens in some variants
    this.listening(true);
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
    const existingNote = globals.ourNotes.get(this.state.order)!;
    if (existingNote !== '') {
      newNote = `${existingNote} | ${note}`;
    }

    this.setNote(newNote);
  }

  getSlotNum() {
    if (!this.layout.parent) {
      return -1;
    }

    const numCardsInHand = this.layout.parent.children.length;
    for (let i = 0; i < numCardsInHand; i++) {
      const layoutChild = this.layout.parent.children[i] as LayoutChild;
      if (layoutChild.card.state.order === this.state.order) {
        return numCardsInHand - i;
      }
    }

    return -1;
  }

  // Update all UI pips to their state
  updatePips() {
    enum PipState { Hidden, Eliminated, Visible }
    const updatePip = (
      pipState: PipState,
      hasPositiveClues: boolean,
      pip: Konva.Shape | RankPip,
      x : Konva.Shape,
    ) => {
      switch (pipState) {
        case PipState.Visible: {
          pip.show();
          x.hide();
          break;
        }
        case PipState.Hidden: {
          pip.hide();
          x.hide();
          break;
        }
        case PipState.Eliminated: {
          pip.show();
          x.show();
          break;
        }
        default:
          break;
      }

      // TODO: Positive clues on suits
      if (pip instanceof RankPip) {
        if (hasPositiveClues && pipState !== PipState.Hidden) {
          pip.showPositiveClue();
        } else {
          pip.hidePositiveClue();
        }
      }
    };

    const suitPipStates : PipState[] = this.variant.suits.map(() => PipState.Hidden);
    const rankPipStates : PipState[] = [];
    for (const rank of this.variant.ranks) rankPipStates[rank] = PipState.Hidden;

    // We look through each card that should have a visible pip (eliminated or not)
    for (const [suitIndex, rank] of this.state.possibleCardsFromClues) {
      // If the card is impossible, eliminate it
      const pipState = this.state.possibleCardsFromObservation[suitIndex][rank] > 0
        ? PipState.Visible : PipState.Eliminated;

      // If the suit or rank became visible (is possible), don't overwrite it
      suitPipStates[suitIndex] = suitPipStates[suitIndex] === PipState.Visible
        ? PipState.Visible : pipState;
      rankPipStates[rank] = rankPipStates[rank] === PipState.Visible
        ? PipState.Visible : pipState;
    }

    for (const [suit, pipState] of suitPipStates.entries()) {
      const pip = this.suitPipsMap.get(suit)!;
      const x = this.suitPipsXMap.get(suit)!;
      // TODO: Positive clues on suits
      updatePip(pipState, false, pip, x);
    }

    for (const [rank, pipState] of rankPipStates.entries()) {
      if (rank > 5) {
        // Don't show the pip for START cards (in "Up or Down" games)
        continue;
      }
      const pip = this.rankPipsMap.get(rank)!;
      const x = this.rankPipsXMap.get(rank)!;
      const hasPositiveRankClue = this.state.positiveRankClues.includes(rank);
      updatePip(pipState, hasPositiveRankClue, pip, x);
    }
  }

  private visualEffectCursor: CursorType = 'default';
  private wasRaised = false;
  // Required in order to be able to cancel animations
  tween: Konva.Tween | null = null;
  setVisualEffect(cursor: CursorType, duration?: number) {
    const raised = this.isRaisedBecauseOfClues();
    // Early return: no parent (being removed from scene), or no change in cursor/raised state
    if (
      this.layout.parent === null
      || (
        cursor === this.visualEffectCursor
        && this.wasRaised === raised
      )
    ) {
      return;
    }

    this.visualEffectCursor = cursor;
    this.wasRaised = raised;

    const defaultDuration = 0.05;
    const actualDuration = globals.animateFast ? 0 : (duration ?? defaultDuration);

    // Shadow special effects
    const shadowOffset = cursor === 'dragging' ? Math.floor(0.12 * CARD_W) : Math.floor(0.04 * CARD_W);
    if (actualDuration === 0) {
      this.bare.shadowOffsetX(shadowOffset);
      this.bare.shadowOffsetY(shadowOffset);
    } else {
      this.bare.to({
        shadowOffsetX: shadowOffset,
        shadowOffsetY: shadowOffset,
        duration: actualDuration,
      });
    }
    const baseOffsetY = raised ? 0.6 * CARD_H : 0.5 * CARD_H;
    const offsetX = cursor === 'dragging' ? 0.52 * CARD_W : 0.5 * CARD_W;
    const offsetY = baseOffsetY + (cursor === 'dragging' ? 0.02 * CARD_H : 0);
    animate(
      this,
      {
        offsetX,
        offsetY,
        duration: actualDuration,
      }, true,
    );
  }

  private registerMouseHandlers() {
    // Define the clue log mouse handlers
    // (e.g. when we mouse over a card, the positive and negative clues that have touched the card
    // will be highlighted in the clue log)
    this.on('mouseover touchstart', () => {
      globals.elements.clueLog!.showMatches(this.state.order);
      globals.layers.UI.batchDraw();
    });
    this.on('mouseout touchend', () => {
      globals.elements.clueLog!.showMatches(null);
      globals.layers.UI.batchDraw();
    });

    // Define the other mouse handlers
    this.on('click', HanabiCardClick);
    this.on('tap', HanabiCardTap);
    this.on('dbltap', HanabiCardDblTap);
    this.on('mousedown', HanabiCardClickSpeedrun);
    this.on('mousedown', this.cardStartDrag);
    this.on('mousemove', this.setCursor);
    this.on('mouseleave', () => {
      cursorSet('default');
    });
  }

  setCursor() {
    const cursorType = this.shouldShowLookCursor() ? 'look' : 'default';
    cursorSet(cursorType);
  }

  shouldShowLookCursor() {
    // Don't show the cursor if this is a stack base
    if (this.state.rank === STACK_BASE_RANK) {
      return false;
    }

    // Don't show the cursor if the card is draggable
    // (the hand cursor takes precedence over the look cursor)
    if (this.layout !== null && this.layout.draggable()) {
      return false;
    }

    // If we are in an in-game replay or we are not a player in an ongoing game,
    // always show the cursor
    if (globals.state.replay.active || !globals.state.playing) {
      return true;
    }

    // For ongoing games, always show the cursor for other people's hands
    if (
      typeof this.state.location === 'number'
      && this.state.location !== globals.metadata.ourPlayerIndex
    ) {
      return true;
    }

    // For ongoing games, only show the cursor for our hand if it has a custom card identity
    if (
      (this.note.suitIndex !== null && this.note.suitIndex !== this.state.suitIndex)
      || (this.note.rank !== null && this.note.rank !== this.state.rank)
      || this.note.blank
      || this.note.unclued
    ) {
      return true;
    }

    return false;
  }

  private cardStartDrag(event: Konva.KonvaEventObject<MouseEvent>) {
    if (
      event.evt.button !== 0 // Dragging uses left click
      || !this.layout.draggable()
    ) {
      return;
    }

    // Hide any visible arrows on the rest of a hand when the card begins to be dragged
    if (this.layout.parent === undefined || this.layout.parent === null) {
      return;
    }
    const hand = this.layout.parent;
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
    // "mouseover" event)
    // The "touchstart" event is handled later in the empathy function
    this.tooltipName = `card-${this.state.order}`;
    this.on('mouseover', function cardMouseOver(this: HanabiCard) {
      this.noteMouseOver();
      globals.activeHover = this;
    });

    this.on('mouseout touchend', function cardMouseOut(this: HanabiCard) {
      if (globals.activeHover !== this) {
        return;
      }

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
        event.evt.button === 0 // Only enable Empathy for left-clicks
        && this.shouldShowEmpathy(event)
      ) {
        // We might need to set "activeHover" again because it was cleared by a game action,
        // for example
        globals.activeHover = this;

        this.setEmpathyOnHand(true);
      }
    });

    this.on('touchstart', (event: Konva.KonvaEventObject<TouchEvent>) => {
      tooltips.resetActiveHover();
      globals.activeHover = this;

      // Make sure to not register this as a single tap if the user long presses the card
      this.touchstartTimeout = setTimeout(() => {
        // A tap will trigger when the "touchend" event occurs
        // The next tap action will not run because it will appear like the second tap of a double
        // tap
        // Don't worry about this if we actually double-tapped
        if (!this.wasRecentlyTapped && globals.editingNote == null) {
          this.wasRecentlyTapped = true;
        }
      }, 500); // 500 milliseconds, same as the double-tap time for standardization reasons

      // First, show the note tooltip
      this.noteMouseOver();

      // Then, set the empathy
      if (this.shouldShowEmpathy(event)) {
        this.setEmpathyOnHand(true);
      }
    });

    this.on('mouseup', (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (!globals.globalEmpathyEnabled && event.evt.button === 0) { // Left-click
        this.setEmpathyOnHand(false);
      }
    });

    this.on('mouseout touchend', () => {
      if (!globals.globalEmpathyEnabled) {
        this.setEmpathyOnHand(false);
      }
    });
  }

  private shouldShowEmpathy(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    return (
      // Disable Empathy if a modifier key is pressed
      // (unless we are in a speedrun, because then Empathy is mapped to Ctrl + left click)
      (
        !event.evt.ctrlKey
        || (globals.options.speedrun || globals.lobby.settings.speedrunMode)
      )
      && (
        event.evt.ctrlKey
        || (!globals.options.speedrun && !globals.lobby.settings.speedrunMode)
        || !globals.state.playing
      )
      && !event.evt.shiftKey
      && !event.evt.altKey
      && !event.evt.metaKey
      && !this.tweening // Disable Empathy if the card is tweening
      // Clicking on a played card goes to the turn that it was played
      && !cardRules.isPlayed(this.state)
      // Clicking on a discarded card goes to the turn that it was discarded
      && !cardRules.isDiscarded(this.state)
      && this.state.rank !== STACK_BASE_RANK // Disable empathy for the stack bases
    );
  }

  setEmpathy(enabled: boolean) {
    if (this.empathy === enabled) {
      // No change
      return;
    }

    this.empathy = enabled;
    this.setBareImage();
  }

  private noteMouseOver(this: HanabiCard) {
    // Don't do anything if there is not a note on this card
    if (!this.noteIndicator!.isVisible()) {
      return;
    }

    // Don't open any more note tooltips if the user is currently editing a note
    if (globals.editingNote !== null) {
      return;
    }

    // If we are spectating and there is a new note, mark it as seen
    if (this.noteIndicator!.rotated) {
      this.noteIndicator!.rotated = false;
      this.noteIndicator!.rotate(-15);
      globals.layers.card.batchDraw();
    }

    notes.show(this);
  }

  private setEmpathyOnHand(enabled: boolean) {
    // Disable Empathy for cards that are not in a player's hand
    if (typeof this.state.location !== 'number') {
      return;
    }

    // As a sanity check, ensure that the hand object exists
    const hand = this.layout.parent as unknown as CardLayout;
    if (hand === undefined || hand === null || hand.children.length === 0) {
      return;
    }

    hand.setEmpathy(enabled);
  }

  checkSpecialNote() {
    const noteText = globals.ourNotes.get(this.state.order)!;

    this.note = notes.checkNoteIdentity(this.variant, noteText);
    notes.checkNoteImpossibility(this.variant, this.state, this.note);

    // Morph the card if it has an "exact" card note
    // (or clear the bare image if the note was deleted/changed)
    this.setBareImage();

    // Since we updated the note, we might need to redraw a special border around the card
    this.setBorder();

    globals.layers.card.batchDraw();
    this.setCursor();
  }
}
