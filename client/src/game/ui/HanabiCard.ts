/* eslint-disable max-classes-per-file */
// The HanabiCard object represents a single card
// It has a LayoutChild parent

import Konva from 'konva';
import {
  CARD_FADE,
  CARD_H,
  CARD_W,
} from '../../constants';
import { SUITS } from '../data/gameData';
import * as variantRules from '../rules/variant';
import CardNote from '../types/CardNote';
import CardState, { cardInitialState, PipState } from '../types/CardState';
import Clue from '../types/Clue';
import ClueType from '../types/ClueType';
import Color from '../types/Color';
import { STACK_BASE_RANK, START_CARD_RANK, UNKNOWN_CARD_RANK } from '../types/constants';
import StackDirection from '../types/StackDirection';
import Suit from '../types/Suit';
import Variant from '../types/Variant';
import * as arrows from './arrows';
import CardLayout from './CardLayout';
import NodeWithTooltip from './controls/NodeWithTooltip';
import NoteIndicator from './controls/NoteIndicator';
import RankPip from './controls/RankPip';
import { msgSuitToSuit, suitToMsgSuit } from './convert';
import globals from './globals';
import HanabiCardClick from './HanabiCardClick';
import HanabiCardClickSpeedrun from './HanabiCardClickSpeedrun';
import * as HanabiCardInit from './HanabiCardInit';
import LayoutChild from './LayoutChild';
import * as notes from './notes';
import possibilitiesCheck from './possibilitiesCheck';
import * as reversible from './variants/reversible';

const DECK_BACK_IMAGE = 'deck-back';

export default class HanabiCard extends Konva.Group implements NodeWithTooltip {
  state: CardState;

  tweening: boolean = false;
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
    this.state = cardInitialState(config.order);

    // Initialize various elements/features of the card
    this.bare = HanabiCardInit.image(() => this.bareName);
    this.add(this.bare);

    this.cluedBorder = HanabiCardInit.cluedBorder();
    this.finesseBorder = HanabiCardInit.finesseBorder();
    this.chopMoveBorder = HanabiCardInit.chopMoveBorder();
    this.add(this.cluedBorder);
    this.add(this.finesseBorder);
    this.add(this.chopMoveBorder);

    const arrowElements = HanabiCardInit.directionArrow(globals.variant);
    if (arrowElements) {
      this.arrow = arrowElements.arrow;
      this.arrowBase = arrowElements.arrowBase;
      this.add(this.arrow);
    }

    const pips = HanabiCardInit.pips(globals.variant);
    this.suitPipsMap = pips.suitPipsMap;
    this.suitPipsXMap = pips.suitPipsXMap;
    this.rankPipsMap = pips.rankPipsMap;
    this.rankPipsXMap = pips.rankPipsXMap;
    this.suitPips = pips.suitPips;
    this.rankPips = pips.rankPips;
    this.add(this.suitPips);
    this.add(this.rankPips);

    this.noteIndicator = HanabiCardInit.note(
      globals.variant.offsetCornerElements,
      () => notes.shouldShowIndicator(this.state.order),
    );
    this.add(this.noteIndicator);

    this.criticalIndicator = HanabiCardInit.criticalIndicator(globals.variant.offsetCornerElements);
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
  refresh(suit: Suit | null, rank: number | null) {
    // Reset visual state
    this.tweening = false;
    this.empathy = false;
    this.doMisplayAnimation = false;

    // We might have some information about this card already
    this.state.suitIndex = suit ? suitToMsgSuit(suit, globals.variant) : null;
    this.state.rank = rank;

    // Possible suits and ranks (based on clues given) are tracked separately
    // from knowledge of the true suit and rank
    this.state.colorClueMemory.possibilities = globals.variant.suits.slice().map((_, i) => i);
    this.state.rankClueMemory.possibilities = globals.variant.ranks.slice();
    // Possible cards (based on both clues given and cards seen) are also tracked separately

    // Start by cloning the "globals.cardsMap"
    this.state.colorClueMemory.possibilities.forEach((suitIndex) => {
      this.state.possibleCards[suitIndex] = [];
      const suitName = msgSuitToSuit(suitIndex, globals.variant)!.name;
      this.state.rankClueMemory.possibilities.forEach((rankIndex) => {
        this.state.possibleCards[suitIndex][rankIndex] = globals.cardsMap.get(`${suitName}${rankIndex}`)!;
      });
    });
    this.state.identityDetermined = false;
    this.state.numPositiveClues = 0;
    for (const mem of [this.state.colorClueMemory, this.state.rankClueMemory]) {
      mem.positiveClues = [];
      mem.negativeClues = [];
      mem.pipStates = [];
      mem.possibilities.forEach((i) => { mem.pipStates[i] = 'Visible'; });
    }
    this.state.turnsClued = [];
    // We have to add one to the turn drawn because
    // the "draw" command comes before the "turn" command
    // However, if it was part of the initial deal, then it will correctly be set as turn 0
    this.state.turnDrawn = globals.turn === 0 ? 0 : globals.turn + 1;
    this.state.isDiscarded = false;
    this.state.turnDiscarded = -1;
    this.state.isPlayed = false;
    this.state.turnPlayed = -1;
    this.state.isMisplayed = false;

    // Some variants disable listening on cards
    this.listening(true);

    this.setClued();
    if (!globals.replay && !globals.spectating) {
      // If it has a "chop move" note on it, we want to keep the chop move border turned on
      if (this.note?.chopMoved) {
        this.chopMoveBorder!.show();
      }
      // If it has a "finessed" note on it, we want to keep the finesse border turned on
      if (this.note?.finessed) {
        this.finesseBorder!.show();
      }
    }

    // Reset all of the pips to their default state
    // (but don't show any pips in Real-Life mode)
    if (this.suitPipsMap) {
      for (const [, suitPip] of this.suitPipsMap) {
        suitPip.show();
      }
    }
    if (this.suitPipsXMap) {
      for (const [, suitPipX] of this.suitPipsXMap) {
        suitPipX.hide();
      }
    }
    if (this.rankPipsMap) {
      for (const [, rankPip] of this.rankPipsMap) {
        rankPip.show();
        rankPip.hidePositiveClue();
      }
    }
    if (this.rankPipsXMap) {
      for (const [, rankPipX] of this.rankPipsXMap) {
        rankPipX.hide();
      }
    }

    this.resetPossibilities();
    this.setBareImage();

    // Hide the pips if we have full knowledge of the suit / rank
    if (suit) {
      this.suitPips!.hide();
    }
    if (rank) {
      this.rankPips!.hide();
    }
  }

  resetPossibilities() {
    if (!possibilitiesCheck()) {
      return;
    }

    // We want to remove all of the currently seen cards from the list of possibilities
    for (let i = 0; i <= globals.indexOfLastDrawnCard; i++) {
      const card = globals.deck[i];

      // Don't do anything if this is one of our unknown cards
      if (card.state.suitIndex === null || card.state.rank === null) {
        continue;
      }

      // If the card is still in the player's hand and it is not fully "filled in" with clues,
      // then we cannot remove it from the list of possibilities
      // (because they do not know what it is yet)
      if (
        card.state.holder === this.state.holder
        && (card.state.colorClueMemory.possibilities.length > 1
          || card.state.rankClueMemory.possibilities.length > 1)
      ) {
        continue;
      }

      removePossibility(globals.variant, this.state, card.state.suitIndex, card.state.rank, false);
    }
  }

  setHolder(holder: number | null) {
    this.state.holder = holder;
  }

  unsetBlank() {
    this.state.blank = false;
  }

  setClued() {
    const isClued = (
      this.state.numPositiveClues > 0
      && !this.state.isPlayed
      && !this.state.isDiscarded
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
        || (this.state.holder === globals.playerUs && !globals.replay)
      )
    ) {
      this.offsetY(0.6 * CARD_H);
    }

    this.cluedBorder!.visible(isClued);

    // Remove all special borders when a card is clued, played, discarded
    this.chopMoveBorder!.hide();
    this.finesseBorder!.hide();
  }

  isClued() {
    return this.state.numPositiveClues > 0;
  }

  markPositiveClue() {
    this.state.numPositiveClues += 1;
  }

  setBareImage() {
    // Optimization: This function is expensive, so don't do it in replays
    // unless we got to the final destination
    // However, if an action happens before the "turn" message is sent,
    // we still need to redraw any affected cards
    if (
      this.bareName !== ''
      && globals.replay
      && !globals.hypothetical
      && globals.turn < globals.replayTurn - 1
    ) {
      return;
    }

    const learnedCard = globals.learnedCards[this.state.order];

    // Find out the suit to display
    // (Unknown is a colorless suit used for unclued cards)
    let suitToShow: Suit | undefined | null;
    if (this.empathy) {
      // If we are in Empathy mode, only show the suit if there is only one possibility left
      if (this.state.colorClueMemory.possibilities.length === 1) {
        const [suitId] = this.state.colorClueMemory.possibilities;
        suitToShow = globals.variant.suits[suitId];
      } else {
        suitToShow = SUITS.get('Unknown')!;
      }
    } else {
      // If we are not in Empathy mode, then show the suit if it is known
      suitToShow = learnedCard.suit!;
      if (
        this.state.rank === STACK_BASE_RANK
        && this.note?.suitIndex !== null
        && !globals.replay
      ) {
        // The card note suit has precedence over the "real" suit,
        // but only for the stack bases (and not in replays)
        suitToShow = globals.variant.suits[this.note.suitIndex];
      }
      if (suitToShow === null && this.note?.suitIndex !== null) {
        suitToShow = globals.variant.suits[this.note.suitIndex];
      }
      if (suitToShow === null) {
        suitToShow = SUITS.get('Unknown');
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
      rankToShow = learnedCard.rank;
      if (
        this.state.rank === STACK_BASE_RANK
        && this.note?.rank !== null
        && !globals.replay
      ) {
        // The card note rank has precedence over the "real" rank,
        // but only for the stack bases (and not in replays)
        rankToShow = this.note?.rank;
      }
      if (rankToShow === null) {
        rankToShow = this.note?.rank;
      }
      if (rankToShow === null) {
        rankToShow = 6;
      }
    }

    // Set the name
    // (setting "this.bareName" will automatically update how the card appears the next time that
    // the "card" layer is drawn)
    if (this.state.blank) {
      // The "blank" property is set when the card should appear blank no matter what
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
      && !this.state.isPlayed
      && !this.state.isDiscarded
      && !globals.replay
      && !globals.spectating
    ) {
      this.bareName = DECK_BACK_IMAGE;
    } else if (
      (
        globals.lobby.settings.realLifeMode
        || variantRules.isCowAndPig(globals.variant)
        || variantRules.isDuck(globals.variant)
      ) && (suitToShow!.name === 'Unknown' || rankToShow === 6)
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
      || variantRules.isCowAndPig(globals.variant)
      || variantRules.isDuck(globals.variant)
      || this.state.blank
    ) {
      this.suitPips!.hide();
      this.rankPips!.hide();
    } else {
      this.suitPips!.visible(suitToShow!.name === 'Unknown');
      this.rankPips!.visible(rankToShow === UNKNOWN_CARD_RANK);
    }

    // Show or hide the "trash" image
    this.trashcan!.visible((
      (this.note ? this.note.knownTrash : false)
      && !this.empathy
      && !this.state.isPlayed
      && !this.state.isDiscarded
      && !globals.replay
      && !globals.spectating
    ));

    // Show or hide the "fixme" image
    this.wrench!.visible((
      (this.note ? this.note.needsFix : false)
      && !this.empathy
      && !this.state.isPlayed
      && !this.state.isDiscarded
      && !globals.replay
      && !globals.spectating
    ));

    let suitIndex: number | null = null;
    if (!suitToShow || suitToShow!.name === 'Unknown') {
      suitIndex = null;
    } else {
      suitIndex = globals.variant.suits.indexOf(suitToShow);
    }
    this.setDirectionArrow(suitIndex);
    this.setFade();
    this.setCritical();
  }

  // Show or hide the direction arrow (for specific variants)
  setDirectionArrow(suitIndex: number | null) {
    if (!variantRules.hasReversedSuits(globals.variant)) {
      return;
    }

    if (suitIndex === null || this.state.rank === STACK_BASE_RANK) {
      this.arrow!.hide();
      return;
    }

    const direction = globals.stackDirections[suitIndex];
    const suit = globals.variant.suits[suitIndex];

    let shouldShowArrow;
    if (variantRules.isUpOrDown(globals.variant)) {
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
    if (this.rankPips!.visible()) {
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
      || variantRules.isThrowItInAHole(globals.variant)
      || this.state.rank === STACK_BASE_RANK
    ) {
      return;
    }

    const oldOpacity = this.opacity();

    let newOpacity = 1;
    if (
      this.state.suitIndex !== null
      && this.state.rank !== null
      && this.state.numPositiveClues === 0
      && !this.state.isPlayed
      && !this.state.isDiscarded
      && !this.empathy
      && !this.needsToBePlayed()
    ) {
      newOpacity = CARD_FADE;
    }

    // Override the above logic and always fade the card if it is explicitly marked as known trash
    if (this.trashcan!.visible() && this.state.numPositiveClues === 0) {
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
      && !this.state.isPlayed
      && !this.state.isDiscarded
      && !this.note.blank
    ));
  }

  discard(turn: number, failed: boolean) {
    this.state.isDiscarded = true;
    this.state.turnDiscarded = turn;
    this.state.isMisplayed = failed;
  }

  play(turn: number) {
    this.state.isPlayed = true;
    this.state.turnPlayed = turn;
  }

  // This card was touched by a positive or negative clue,
  // so remove pips and possibilities from the card
  applyClue(clue: Clue, positive: boolean) {
    const state = this.state;
    const variant = globals.variant;

    // If the card is already fully revealed from clues, then additional clues would tell us nothing
    // We don't check for "state.identityDetermined" here because we still need to calculate
    // the effects of clues on cards in other people's hands whose true identity we already know
    const wasFullyKnown = (
      state.colorClueMemory.possibilities.length === 1
      && state.rankClueMemory.possibilities.length === 1
    );
    if (wasFullyKnown) {
      return;
    }

    // Mark all turns that this card is positively clued
    if (positive) {
      // We add one because the "clue" action comes before the "turn" action
      state.turnsClued.push(globals.turn + 1);
    }

    const {
      shouldReapplyRankClues,
      shouldReapplyColorClues,
    } = applyClueCore(state, variant, possibilitiesCheck(), clue, positive);

    if (state.colorClueMemory.possibilities.length === 1) {
      // We have discovered the true suit of the card
      globals.learnedCards[state.order].suit = variant.suits[state.suitIndex!];
    }

    if (state.rankClueMemory.possibilities.length === 1) {
      // We have discovered the true rank of the card
      globals.learnedCards[state.order].rank = state.rank!;
    }

    // Handle if this is the first time that the card is fully revealed to the holder
    const isFullyKnown = (state.rank !== null && state.suitIndex !== null);
    if (isFullyKnown && !wasFullyKnown) {
      this.updatePossibilitiesOnOtherCards(state.suitIndex!, state.rank!);
    }

    if (shouldReapplyRankClues) {
      this.reapplyRankClues(state);
    }

    if (shouldReapplyColorClues) {
      this.reapplyColorClues(state);
    }

    this.updateNotePossibilities();

    this.updatePips();

    this.setBareImage();
  }

  private updateNotePossibilities() {
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
    }
  }

  // If a clue just eliminated the possibility of being a special multi-color card,
  // we need to retroactively apply previous color clues
  private reapplyColorClues(state: CardState) {
    const { positiveClues, negativeClues } = state.colorClueMemory;
    state.colorClueMemory.positiveClues = [];
    state.colorClueMemory.negativeClues = [];
    for (const color of positiveClues) {
      this.applyClue(new Clue(ClueType.Color, color), true);
    }
    for (const color of negativeClues) {
      this.applyClue(new Clue(ClueType.Color, color), false);
    }
  }

  // If a clue just eliminated the possibility of being a special multi-rank card,
  // we can retroactively remove rank pips from previous rank clues
  private reapplyRankClues(state: CardState) {
    const { positiveClues, negativeClues } = state.rankClueMemory;
    state.rankClueMemory.positiveClues = [];
    state.rankClueMemory.negativeClues = [];
    for (const rank of positiveClues) {
      this.applyClue(new Clue(ClueType.Rank, rank), true);
    }
    for (const rank of negativeClues) {
      this.applyClue(new Clue(ClueType.Rank, rank), false);
    }
  }

  // We have learned the true suit and rank of this card
  // but it might not be known to the holder
  convert(msgSuit: number, msgRank: number) {
    // Local variables
    const suitIndex = msgSuit === -1 ? null : msgSuit;
    const rank = msgRank === -1 ? null : msgRank;

    // Blank the card if it is revealed with no suit and no rank
    this.state.blank = !(suitIndex || rank);

    // Set the true suit/rank on the card
    this.state.suitIndex = suitIndex;
    this.state.rank = rank;

    // Keep track of what this card is
    const learnedCard = globals.learnedCards[this.state.order];
    learnedCard.suit = msgSuitToSuit(suitIndex, globals.variant);
    learnedCard.rank = rank;

    // Redraw the card
    this.setBareImage();
  }

  // This card was either played or discarded
  reveal(msgSuit: number, msgRank: number) {
    // Played cards are not revealed in the "Throw It in a Hole" variant
    if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay && this.state.isPlayed) {
      return;
    }

    this.convert(msgSuit, msgRank);

    const suitIndex = this.state.suitIndex;
    const rank = this.state.rank;

    // If the card was already fully-clued,
    // we already updated the possibilities for it on other cards
    if (suitIndex != null && rank != null && !this.state.identityDetermined) {
      this.state.identityDetermined = true;
      this.updatePossibilitiesOnOtherCards(suitIndex, rank);
    }
  }

  // We need to redraw this card's suit and rank in a shared replay or hypothetical
  // based on deckOrder and hypoRevealed
  replayRedraw() {
    if (globals.deckOrder.length === 0) {
      return;
    }
    const suitNum = globals.deckOrder[this.state.order].suit;
    const trueSuit = msgSuitToSuit(suitNum, globals.variant);
    const trueRank = globals.deckOrder[this.state.order].rank;

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
      this.convert(suitNum, trueRank);

      // Check if we can drag this card now
      const layoutChild = this.parent as unknown as LayoutChild;
      if (layoutChild) {
        layoutChild.checkSetDraggable();
      }
    }
  }

  private updatePossibilitiesOnOtherCards(suit: number, rank: number) {
    if (!possibilitiesCheck()) {
      return;
    }

    // Update the possibilities for the player
    // who just discovered the true identity of this card
    // (either through playing it, discarding it, or getting a clue that fully revealed it)
    if (this.state.holder === null) {
      throw new Error('The holder of this card\'s hand is null in the "updatePossibilitiesOnOtherCards()" function.');
    }
    const playerHand = globals.elements.playerHands[this.state.holder];
    for (const layoutChild of playerHand.children.toArray() as Konva.Node[]) {
      const card = layoutChild.children[0] as HanabiCard;
      if (card.state.order === this.state.order) {
        // There is no need to update the card that was just revealed
        continue;
      }
      removePossibility(globals.variant, card.state, suit, rank, false);
    }

    // If this is a:
    // 1) unknown card that we played or
    // 2) a card that was just fully revealed in our hand via a clue
    // then we also need to update the possibilities for the other hands
    if (this.state.holder === globals.playerUs && !globals.replay && !globals.spectating) {
      for (let i = 0; i < globals.elements.playerHands.length; i++) {
        if (i === this.state.holder) {
          // We already updated our own hand above
          continue;
        }

        const playerHand2 = globals.elements.playerHands[i];
        playerHand2.children.each((layoutChild) => {
          const card = layoutChild.children[0] as HanabiCard;
          removePossibility(globals.variant, card.state, suit, rank, false);
        });
      }
    }
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

    // Mark that no player is now holding this card
    this.setHolder(null);
  }

  animateToPlayStacks() {
    // We add a LayoutChild to a PlayStack
    if (variantRules.isThrowItInAHole(globals.variant) && !globals.replay) {
      // The act of adding it will automatically tween the card
      const hole = globals.elements.playStacks.get('hole')!;
      hole.addChild(this.parent as any);

      // We do not want this card to interfere with writing notes on the stack bases
      this.listening(false);
    } else {
      // The act of adding it will automatically tween the card
      const suit = globals.variant.suits[this.state.suitIndex!];
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
    // We add a LayoutChild to a CardLayout
    const suit = globals.variant.suits[this.state.suitIndex!];
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
      if (stack[1]) {
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
    if (
      this.state.suitIndex === null
      || this.state.rank === null
      || this.state.rank === 0 // Base
      || this.state.isPlayed
      || this.state.isDiscarded
      || !this.needsToBePlayed()
    ) {
      return false;
    }

    // "Up or Down" has some special cases for critical cards
    if (variantRules.hasReversedSuits(globals.variant)) {
      return reversible.isCardCritical(globals.variant, this.state);
    }

    const num = getSpecificCardNum(globals.variant, this.state.suitIndex, this.state.rank);
    return num.total === num.discarded + 1;
  }

  // needsToBePlayed returns true if the card is not yet played
  // and is still needed to be played in order to get the maximum score
  // (this mirrors the server function in "card.go")
  private needsToBePlayed() {
    // First, check to see if a copy of this card has already been played
    for (const card of globals.deck) {
      if (card.state.order === this.state.order) {
        continue;
      }
      if (
        card.state.suitIndex === this.state.suitIndex
        && card.state.rank === this.state.rank
        && card.state.isPlayed
      ) {
        return false;
      }
    }

    // Determining if the card needs to be played in variants with reversed suits is more
    // complicated
    if (variantRules.hasReversedSuits(globals.variant)) {
      return reversible.needsToBePlayed(globals.variant, globals.stackDirections, this.state);
    }

    // Second, check to see if it is still possible to play this card
    // (the preceding cards in the suit might have already been discarded)
    for (let i = 1; i < this.state.rank!; i++) {
      const num = getSpecificCardNum(globals.variant, this.state.suitIndex!, i);
      if (num.total === num.discarded) {
        // The suit is "dead", so this card does not need to be played anymore
        return false;
      }
    }

    // By default, all cards not yet played will need to be played
    return true;
  }

  isPotentiallyPlayable() {
    // Calculating this in an Up or Down variant is more complicated
    if (variantRules.hasReversedSuits(globals.variant)) {
      return reversible.isPotentiallyPlayable(globals.variant, globals.stackDirections, this.state);
    }

    let potentiallyPlayable = false;
    for (const [suitIndex, suit] of globals.variant.suits.entries()) {
      const playStack = globals.elements.playStacks.get(suit)!;
      let lastPlayedRank = playStack.getLastPlayedRank();
      if (lastPlayedRank === 5) {
        continue;
      }
      if (lastPlayedRank === STACK_BASE_RANK) {
        lastPlayedRank = 0;
      }
      const nextRankNeeded = lastPlayedRank! + 1;
      const count = this.state.possibleCards[suitIndex][nextRankNeeded];
      if (count === undefined) {
        throw new Error(`Failed to get an entry for Suit: ${suitIndex} Rank:${nextRankNeeded} from the "possibleCards" map for card ${this.state.order}.`);
      }
      if (count > 0) {
        potentiallyPlayable = true;
        break;
      }
    }

    return potentiallyPlayable;
  }

  // Update all UI pips to their state
  private updatePips() {
    function updatePip(pipState: PipState, pip: Konva.Shape | RankPip, x : Konva.Shape) {
      switch (pipState) {
        case 'Visible': {
          pip.show();
          x.hide();
          if (pip instanceof RankPip) {
            pip.hidePositiveClue();
          }
          break;
        }
        case 'Hidden': {
          pip.hide();
          x.hide();
          if (pip instanceof RankPip) {
            pip.hidePositiveClue();
          }
          break;
        }
        case 'Eliminated': {
          pip.show();
          x.show();
          if (pip instanceof RankPip) {
            pip.hidePositiveClue();
          }
          break;
        }
        case 'PositiveClue': {
          pip.show();
          x.hide();
          // TODO: Positive clues on suits
          if (pip instanceof RankPip) {
            pip.showPositiveClue();
          }
          break;
        }
        default:
          break;
      }
    }

    for (const [suit, pipState] of this.state.colorClueMemory.pipStates.entries()) {
      const pip = this.suitPipsMap.get(suit)!;
      const x = this.suitPipsXMap.get(suit)!;
      updatePip(pipState, pip, x);
    }
    for (const [rank, pipState] of this.state.rankClueMemory.pipStates.entries()) {
      const pip = this.rankPipsMap.get(rank)!;
      const x = this.rankPipsXMap.get(rank)!;
      updatePip(pipState, pip, x);
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
    this.on('mousedown', (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (
        event.evt.button !== 0 // Dragging uses left click
        || !this.parent
        || !this.parent.draggable()
      ) {
        return;
      }

      // Hide any visible arrows on the rest of a hand when the card begins to be dragged
      if (!this.parent || !this.parent.parent) {
        return;
      }
      const hand = this.parent.parent;
      let hidden = false;
      for (const layoutChild of hand.children.toArray()) {
        const card: HanabiCard = (layoutChild as Konva.Node).children[0] as HanabiCard;
        for (const arrow of globals.elements.arrows) {
          if (arrow.pointingTo === card) {
            hidden = true;
            arrows.hideAll();
            break;
          }
        }
        if (hidden) {
          break;
        }
      }

      // Move this hand to the top
      // (otherwise, the card can appear under the play stacks / discard stacks)
      hand.moveToTop();
    });
  }

  private initTooltip() {
    // If the user mouses over the card, show a tooltip that contains the note
    // (we don't use the "tooltip.init()" function because we need the extra conditions in the
    // "mousemove" event)
    this.tooltipName = `card-${this.state.order}`;
    this.on('mousemove', function cardMouseMove(this: HanabiCard) {
      // Don't do anything if there is not a note on this card
      if (!this.noteIndicator!.visible()) {
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
        || this.state.isPlayed // Clicking on a played card goes to the turn that it was played
        // Clicking on a discarded card goes to the turn that it was discarded
        || this.state.isDiscarded
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
      if (!hand || hand.children.length === 0 || hand.empathy === enabled) {
        return;
      }

      hand.empathy = enabled;
      hand.children.each((layoutChild) => {
        const card = layoutChild.children[0] as HanabiCard;
        card.empathy = enabled;
        card.setBareImage();
      });
      globals.layers.card.batchDraw();
    };
  }

  checkSpecialNote() {
    const noteText = globals.ourNotes[this.state.order];

    this.note = notes.checkNoteIdentity(globals.variant, noteText);
    notes.checkNoteImpossibility(globals.variant, this.state, this.note);
    this.setClued();

    // Feature 1 - Morph the card if it has an "exact" card note
    // (or clear the bare image if the note was deleted/changed)
    this.setBareImage();

    // Feature 2 - Give the card a special border if it is chop moved
    const showSpecialBorder = (
      !this.cluedBorder!.visible()
      && !this.state.isPlayed
      && !this.state.isDiscarded
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

// Functions that don't depend on HanabiCard

function applyClueCore(
  state: CardState,
  variant: Variant,
  calculatePossibilities: boolean,
  clue: Clue,
  positive: boolean,
) {
  // Helpers to convert from suit/color to index and vice-versa
  const suitIndexes: Map<string, number> = new Map<string, number>();
  const colorIndexes: Map<Color, number> = new Map<Color, number>();
  variant.suits.forEach((suit, index) => suitIndexes.set(suit.name, index));
  variant.clueColors.forEach((color, index) => colorIndexes.set(color, index));

  const getIndex = (suit: Suit) => suitIndexes.get(suit.name)!;

  // Record unique clues that touch the card for later
  if (clue.type === ClueType.Color) {
    const colorId = colorIndexes.get(clue.value as Color)!;
    if (positive && !state.colorClueMemory.positiveClues.includes(colorId)) {
      state.colorClueMemory.positiveClues.push(colorId);
    } else if (!positive && !state.colorClueMemory.negativeClues.includes(colorId)) {
      state.colorClueMemory.negativeClues.push(colorId);
    }
  } else if (clue.type === ClueType.Rank) {
    if (positive && !state.rankClueMemory.positiveClues.includes(clue.value as number)) {
      state.rankClueMemory.positiveClues.push(clue.value as number);
    } else if (!positive && !state.rankClueMemory.negativeClues.includes(clue.value as number)) {
      state.rankClueMemory.negativeClues.push(clue.value as number);
    }
  }

  // Temporarily use a suit array so we don't have to keep converting back and forth
  const possibleSuits = state.colorClueMemory.possibilities.map((p) => variant.suits[p]);

  // Find out if we can remove some rank pips or suit pips from this clue
  let ranksRemoved: number[] = [];
  let suitsRemoved: number[] = [];
  if (clue.type === ClueType.Color) {
    const clueColor = clue.value as Color;
    // suitsRemoved keeps track of suits removed for normal ranks
    // This allows for proper checking of possibilities to cross out rank pips
    // We handle special ranks later
    if (variant.colorCluesTouchNothing) {
      // Some variants have color clues touch no cards
      // If this is the case, we cannot remove any suit pips from the card
    } else {
      // The default case (e.g. No Variant)
      // Remove all possibilities that do not include this color
      suitsRemoved = possibleSuits.filter(
        (suit: Suit) => (suit.clueColors.includes(clueColor) || suit.allClueColors) !== positive,
      ).map(getIndex);
    }

    if (calculatePossibilities
      && (variant.specialAllClueColors || variant.specialNoClueColors)) {
      // We only need to run this early possibility removal for variants with special ranks
      // touched by all or no color clues
      for (const rank of state.rankClueMemory.possibilities) {
        // We can remove possibilities for normal ranks
        if (rank !== variant.specialRank) {
          for (const suitIndex of suitsRemoved) {
            removePossibility(variant, state, suitIndex, rank, true);
          }
        }
      }
    }

    if (positive
      && state.rankClueMemory.possibilities.includes(variant.specialRank)
      && variant.specialAllClueColors) {
      // Some variants have specific ranks touched by all colors
      // If this is the case, and this is a positive color clue,
      // we cannot remove any color pips from the card
      // An exception to this is special suits touched by no colors
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.noClueColors,
      ).map(getIndex);
    } else if (!positive
      && state.rankClueMemory.possibilities.includes(variant.specialRank)
      && variant.specialNoClueColors) {
      // Some variants have specific ranks touched by no colors
      // If this is the case, and this is a negative color clue,
      // we cannot remove any color pips from the card
      // An exception to this is special suits touched by all colors
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.allClueColors,
      ).map(getIndex);
    } else {
      // We can safely remove the suits from possible suits
      filterInPlace(
        possibleSuits,
        (suit: Suit) => suitsRemoved.indexOf(suitIndexes.get(suit.name)!) === -1,
      );
    }

    // Handle special ranks
    if (variant.specialRank !== -1) {
      if (variant.specialAllClueColors) {
        if (positive) {
          if (state.colorClueMemory.positiveClues.length >= 2
            && possibleSuits
              .filter((suit) => suit.allClueColors)
              .length === 0
          ) {
            // Two positive color clues should "fill in" a special rank that is touched by all
            // color clues (that cannot be a multi-color suit)
            ranksRemoved = filterInPlace(
              state.rankClueMemory.possibilities,
              (rank: number) => rank === variant.specialRank,
            );
          }
        } else if (state.rankClueMemory.possibilities.length === 1
          && state.rank === variant.specialRank) {
          // Negative color to a known special rank means that we can remove all suits
          // other that the ones that are never touched by color clues
          const moreSuitsRemoved = filterInPlace(
            possibleSuits,
            (suit: Suit) => suit.noClueColors,
          ).map(getIndex);
          suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
          suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
        } else if (
          possibleSuits
            .filter((suit: Suit) => suit.noClueColors).length === 0
        ) {
          // Negative color means that the card cannot be the special rank
          // (as long as the card cannot be a suit that is never touched by color clues)
          ranksRemoved = filterInPlace(
            state.rankClueMemory.possibilities,
            (rank: number) => rank !== variant.specialRank,
          );
        } else if (calculatePossibilities) {
          // If there is a suit never touched by color clues, we can still remove
          // possibilities for other suits on the special rank
          for (const suit of possibleSuits.filter((s) => !s.noClueColors)) {
            const suitIndex = suitIndexes.get(suit.name)!;
            removePossibility(variant, state, suitIndex, variant.specialRank, true);
          }
        }
      } else if (variant.specialNoClueColors) {
        if (positive) {
          if (
            possibleSuits
              .filter((suit) => suit.allClueColors).length === 0
          ) {
            // Positive color means that the card cannot be a special rank
            // (as long as the card cannot be a suit that is always touched by color clues)
            ranksRemoved = filterInPlace(
              state.rankClueMemory.possibilities,
              (rank: number) => rank !== variant.specialRank,
            );
          } else if (calculatePossibilities) {
            // If there is a suit always touched by color clues, we can still remove
            // possibilities for other suits on the special rank
            for (const suit of possibleSuits.filter((s) => !s.allClueColors)) {
              const suitIndex = suitIndexes.get(suit.name)!;
              removePossibility(variant, state, suitIndex, variant.specialRank, true);
            }
          }
        } else if (state.colorClueMemory.negativeClues.length === variant.clueColors.length) {
          if (
            possibleSuits
              .filter((suit) => suit.noClueColors).length === 0
          ) {
            // All negative colors means that the card must be the special rank
            // (as long as it cannot be a suit that is never touched by color clues)
            ranksRemoved = filterInPlace(
              state.rankClueMemory.possibilities,
              (rank: number) => rank === variant.specialRank,
            );
          }
        }
      }
    }
  } else if (clue.type === ClueType.Rank) {
    const clueRank = clue.value as number;
    // ranksRemoved keeps track of ranks removed for normal suits touched by their own rank
    // This allows for proper checking of possibilities to cross out suit pips
    // We handle suits with special ranks later
    if (variant.rankCluesTouchNothing) {
      // Some variants have rank clues touch no cards
      // If this is the case, we cannot remove any rank pips from the card
    } else if (state.rankClueMemory.possibilities.includes(variant.specialRank)
      && variant.specialAllClueRanks) {
      // Some variants have specific ranks touched by all rank clues
      ranksRemoved = state.rankClueMemory.possibilities.filter(
        (rank: number) => (rank === clueRank || rank === variant.specialRank) !== positive,
      );
    } else if (state.rankClueMemory.possibilities.includes(variant.specialRank)
      && variant.specialNoClueRanks) {
      // Some variants have specific ranks touched by no rank clues
      ranksRemoved = state.rankClueMemory.possibilities.filter(
        (rank: number) => (rank === clueRank && rank !== variant.specialRank) !== positive,
      );
    } else {
      // The default case (e.g. No Variant)
      // Remove all possibilities that do not include this rank
      ranksRemoved = state.rankClueMemory.possibilities.filter(
        (rank: number) => (rank === clueRank) !== positive,
      );
    }

    // Some suits are touched by all rank clues
    // Some suits are not touched by any rank clues
    // So we may be able to remove a suit pip
    if (positive) {
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.noClueRanks,
      ).map((suit) => suitIndexes.get(suit.name)!);
    } else {
      suitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => !suit.allClueRanks,
      ).map((suit) => suitIndexes.get(suit.name)!);
    }

    // Handle the special case where two positive rank clues should "fill in" a card of a
    // multi-rank suit
    if (positive
      && state.rankClueMemory.positiveClues.length >= 2
      && !(
        state.rankClueMemory.possibilities.includes(variant.specialRank)
        && variant.specialAllClueRanks
      )) {
      const moreSuitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => suit.allClueRanks,
      ).map((suit) => suitIndexes.get(suit.name)!);
      suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
      suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
    }

    // Handle the special case where all negative rank clues should "fill in" a card of a
    // rank-less suit
    if (!positive
      && !variant.rankCluesTouchNothing
      && state.rankClueMemory.negativeClues.length === variant.ranks.length
      // We know that any special rank can be given as a rank clue
      // so there is no need to have a separate check for special variants
    ) {
      const moreSuitsRemoved = filterInPlace(
        possibleSuits,
        (suit: Suit) => suit.noClueRanks,
      ).map(getIndex);
      suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
      suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
    }

    // If the rank of the card is not known yet,
    // change the rank pip that corresponds with this number to signify a positive clue
    if (positive) {
      if (state.rankClueMemory.pipStates[clueRank] === 'Visible') {
        state.rankClueMemory.pipStates[clueRank] = 'PositiveClue';
      }
    }

    if (calculatePossibilities) {
      for (const suit of possibleSuits) {
        // We can remove possibilities for normal suits touched by their own rank
        if (!suit.allClueRanks && !suit.noClueRanks) {
          for (const rank of ranksRemoved) {
            removePossibility(variant, state, suitIndexes.get(suit.name)!, rank, true);
          }
        }
      }
    }

    if (possibleSuits.some((suit) => suit.allClueRanks) && positive) {
      // Some cards are touched by all ranks,
      // so if this is a positive rank clue, we cannot remove any rank pips from the card
      ranksRemoved = [];
    } else if (possibleSuits.some((suit) => suit.noClueRanks) && !positive) {
      // Some suits are not touched by any ranks,
      // so if this is a negative rank clue, we cannot remove any rank pips from the card
      ranksRemoved = [];
    } else {
      // We can safely remove the ranks from possible ranks
      filterInPlace(state.rankClueMemory.possibilities,
        (rank: number) => ranksRemoved.indexOf(rank) === -1);
    }
  }

  // Bring the result back to the state as indexes
  state.colorClueMemory.possibilities = possibleSuits.map(getIndex);

  let shouldReapplyRankClues = false;
  let shouldReapplyColorClues = false;

  // Remove suit pips, if any
  for (const suitRemoved of suitsRemoved) {
    // Hide the suit pips
    state.colorClueMemory.pipStates[suitRemoved] = 'Hidden';

    // Remove any card possibilities for this suit
    if (calculatePossibilities) {
      for (const rank of variant.ranks) {
        removePossibility(variant, state, suitRemoved, rank, true);
      }
    }

    const suitObject = msgSuitToSuit(suitRemoved, variant)!;
    if (suitObject.allClueRanks || suitObject.noClueRanks) {
      // Mark to retroactively apply rank clues when we return from this function
      shouldReapplyRankClues = true;
    }
  }

  // Remove rank pips, if any
  for (const rankRemoved of ranksRemoved) {
    // Hide the rank pips
    state.rankClueMemory.pipStates[rankRemoved] = 'Hidden';

    // Remove any card possibilities for this rank
    if (calculatePossibilities) {
      for (let suitIndex = 0; suitIndex < variant.suits.length; suitIndex++) {
        removePossibility(variant, state, suitIndex, rankRemoved, true);
      }
    }

    if (rankRemoved === variant.specialRank
          && (variant.specialAllClueColors || variant.specialNoClueColors)) {
      // Mark to retroactively apply color clues when we return from this function
      shouldReapplyColorClues = true;
    }
  }

  if (state.colorClueMemory.possibilities.length === 1) {
    // We have discovered the true suit of the card
    [state.suitIndex] = state.colorClueMemory.possibilities;
  }

  if (state.rankClueMemory.possibilities.length === 1) {
    // We have discovered the true rank of the card
    [state.rank] = state.rankClueMemory.possibilities;
  }

  if (state.colorClueMemory.possibilities.length === 1
    && state.rankClueMemory.possibilities.length === 1) {
    state.identityDetermined = true;
  }

  return { shouldReapplyRankClues, shouldReapplyColorClues };
}

export function removePossibility(
  variant: Variant,
  state: CardState,
  suit: number,
  rank: number,
  all: boolean,
) {
  // Every card has a possibility map that maps card identities to count
  let cardsLeft = state.possibleCards[suit][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suit} and Rank: ${rank} from the "possibleCards" map for card ${state.order}.`);
  }
  if (cardsLeft > 0) {
    // Remove one or all possibilities for this card,
    // (depending on whether the card was clued
    // or if we saw someone draw a copy of this card)
    cardsLeft = all ? 0 : cardsLeft - 1;
    state.possibleCards[suit][rank] = cardsLeft;
    checkPipPossibilities(variant, state, suit, rank);
  }
}

// Check to see if we can put an X over this suit pip or this rank pip
function checkPipPossibilities(variant: Variant, state: CardState, suit: number, rank: number) {
  // First, check to see if there are any possibilities remaining for this suit
  let suitPossible = false;
  for (const rank2 of variant.ranks) {
    const count = state.possibleCards[suit][rank2];
    if (count === undefined) {
      throw new Error(`Failed to get an entry for Suit: ${suit} and Rank: ${rank2} from the "possibleCards" map for card ${state.order}.`);
    }
    if (count > 0) {
      suitPossible = true;
      break;
    }
  }
  if (!suitPossible) {
    // Do nothing if the normal pip is already hidden
    if (state.colorClueMemory.pipStates[suit] !== 'Hidden') {
      // All the cards of this suit are seen, so put an X over the suit pip
      state.colorClueMemory.pipStates[suit] = 'Eliminated';
    }
  }

  // Second, check to see if there are any possibilities remaining for this rank
  let rankPossible = false;
  for (let suit2 = 0; suit2 < variant.suits.length; suit2++) {
    const count = state.possibleCards[suit2][rank];
    if (count === undefined) {
      throw new Error(`Failed to get an entry for Suit: ${suit2} and Rank: ${rank}from the "possibleCards" map for card ${state.order}.`);
    }
    if (count > 0) {
      rankPossible = true;
      break;
    }
  }
  if (!rankPossible) {
    // There is no rank pip for "START" cards
    if (rank >= 1 && rank <= 5) {
      // Do nothing if the normal pip is already hidden
      if (state.rankClueMemory.pipStates[rank] !== 'Hidden') {
        // All the cards of this rank are seen, so put an X over the rank pip
        state.rankClueMemory.pipStates[rank] = 'Eliminated';
      }
    }
  }
}

// ---------------
// Misc. functions
// ---------------

// Remove everything from the array that does not match the condition in the function
function filterInPlace<T>(values: T[], predicate: (value: T) => boolean) : T[] {
  const removed = [];
  let i = values.length - 1;
  while (i >= 0) {
    if (!predicate(values[i])) {
      removed.unshift(values.splice(i, 1)[0]);
    }
    i -= 1;
  }
  return removed;
}

// From: https://medium.com/dailyjs/how-to-remove-array-duplicates-in-es6-5daa8789641c
function removeDuplicatesFromArray<T>(array: T[]) {
  return array.filter((item, index) => array.indexOf(item) === index);
}

// getSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
// (this DOES NOT mirror the server function in "game.go",
// because the client does not have the full deck)
export const getSpecificCardNum = (variant: Variant, suitIndex: number, rank: number) => {
  const suit = variant.suits[suitIndex];
  // First, find out how many of this card should be in the deck, based on the rules of the game
  let total = 0;
  if (rank === 1) {
    total = 3;
    if (variantRules.isUpOrDown(variant) || suit.reversed) {
      total = 1;
    }
  } else if (rank === 5) {
    total = 1;
    if (suit.reversed) {
      total = 3;
    }
  } else if (rank === START_CARD_RANK) {
    total = 1;
  } else {
    total = 2;
  }
  if (suit.oneOfEach) {
    total = 1;
  }

  // Second, search through the deck to find the total amount of discarded cards that match
  let discarded = 0;
  for (const card of globals.deck) {
    if (card.state.suitIndex === suitIndex && card.state.rank === rank && card.state.isDiscarded) {
      discarded += 1;
    }
  }

  return { total, discarded };
};
