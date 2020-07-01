// The HanabiCard object represents a single card
// It has a LayoutChild parent

import produce from 'immer';
import Konva from 'konva';
import {
  CARD_FADE,
  CARD_H,
  CARD_W,
} from '../../constants';
import { SUITS } from '../data/gameData';
import {
  removePossibilityTemp,
  applyClueCore,
  PossibilityToRemove,
  removePossibilities,
  checkAllPipPossibilities,
} from '../rules/applyClueCore';
import * as variantRules from '../rules/variant';
import CardNote from '../types/CardNote';
import CardState, { cardInitialState, PipState } from '../types/CardState';
import Clue, { colorClue, rankClue } from '../types/Clue';
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
    this.add(this.cluedBorder);
    this.finesseBorder = HanabiCardInit.finesseBorder();
    this.add(this.finesseBorder);
    this.chopMoveBorder = HanabiCardInit.chopMoveBorder();
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

    // Possible suits and ranks (based on clues given) are tracked separately
    // from knowledge of the true suit and rank
    const possibleSuits = globals.variant.suits.slice().map((_, i) => i);
    const possibleRanks = globals.variant.ranks.slice();
    const possibleCards: number[][] = [];

    // Possible cards (based on both clues given and cards seen) are also tracked separately
    // Start by cloning the "globals.cardsMap"
    possibleSuits.forEach((suitIndex) => {
      possibleCards[suitIndex] = [];
      const suitName = msgSuitToSuit(suitIndex, globals.variant)!.name;
      possibleRanks.forEach((rankIndex) => {
        possibleCards[suitIndex][rankIndex] = globals.cardsMap.get(`${suitName}${rankIndex}`)!;
      });
    });

    // Mark all rank pips as visible
    // Note that since we are using an array as a map, there will be gaps on the values
    const rankPipStates: PipState[] = [];
    possibleRanks.forEach((r) => { rankPipStates[r] = r >= 1 && r <= 5 ? 'Visible' : 'Hidden'; });

    this.state = {
      ...this.state,
      // We might have some information about this card already
      suitIndex: suit ? suitToMsgSuit(suit, globals.variant) : null,
      rank,
      possibleCards,
      colorClueMemory: {
        possibilities: possibleSuits,
        positiveClues: [],
        negativeClues: [],
        pipStates: possibleSuits.map(() => 'Visible'),
      },
      rankClueMemory: {
        possibilities: possibleRanks,
        positiveClues: [],
        negativeClues: [],
        pipStates: rankPipStates,
      },
      identityDetermined: false,
      numPositiveClues: 0,
      turnsClued: [],
      // We have to add one to the turn drawn because
      // the "draw" command comes before the "turn" command
      // However, if it was part of the initial deal, then it will correctly be set as turn 0
      turnDrawn: globals.turn === 0 ? 0 : globals.turn + 1,
      isDiscarded: false,
      turnDiscarded: -1,
      isPlayed: false,
      turnPlayed: -1,
      isMisplayed: false,
    };

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
    this.updatePips();

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

    const possibilitiesToRemove: PossibilityToRemove[] = [];

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
        && (
          card.state.colorClueMemory.possibilities.length > 1
          || card.state.rankClueMemory.possibilities.length > 1
        )
      ) {
        continue;
      }

      possibilitiesToRemove.push({
        suitIndex: card.state.suitIndex,
        rank: card.state.rank,
        all: false,
      });
    }

    const possibleCards = removePossibilities(this.state.possibleCards, possibilitiesToRemove);
    const pipPossibilities = checkAllPipPossibilities(possibleCards, globals.variant);

    const suitPipStates = this.state.colorClueMemory.pipStates.map(
      (pipState, suitIndex) => (!pipPossibilities.suitsPossible[suitIndex] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
    );

    const rankPipStates = this.state.rankClueMemory.pipStates.map(
      (pipState, rank) => (!pipPossibilities.ranksPossible[rank] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
    );

    this.state = {
      ...this.state,
      possibleCards,
      colorClueMemory: {
        ...this.state.colorClueMemory,
        pipStates: suitPipStates,
      },
      rankClueMemory: {
        ...this.state.rankClueMemory,
        pipStates: rankPipStates,
      },
    };
  }

  setHolder(holder: number | null) {
    this.state = {
      ...this.state,
      holder,
    };
  }

  unsetBlank() {
    this.state = {
      ...this.state,
      blank: false,
    };
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

  markPositiveClue() {
    this.state = {
      ...this.state,
      numPositiveClues: this.state.numPositiveClues + 1,
    };
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
    this.state = {
      ...this.state,
      isDiscarded: true,
      turnDiscarded: turn,
      isMisplayed: failed,
    };
  }

  play(turn: number) {
    this.state = {
      ...this.state,
      isPlayed: true,
      turnPlayed: turn,
    };
  }

  // This card was touched by a positive or negative clue,
  // so remove pips and possibilities from the card
  applyClue(clue: Clue, positive: boolean) {
    const variant = globals.variant;

    // If the card is already fully revealed from clues, then additional clues would tell us nothing
    // We don't check for "state.identityDetermined" here because we still need to calculate
    // the effects of clues on cards in other people's hands whose true identity we already know
    const wasFullyKnown = (
      this.state.colorClueMemory.possibilities.length === 1
      && this.state.rankClueMemory.possibilities.length === 1
    );
    if (wasFullyKnown) {
      return;
    }

    const {
      state,
      shouldReapplyRankClues,
      shouldReapplyColorClues,
    } = applyClueCore(this.state, variant, possibilitiesCheck(), clue, positive);

    // Mutate state
    this.state = {
      ...state,
      // Mark all turns that this card is positively clued
      // We add one because the "clue" action comes before the "turn" action
      turnsClued: positive ? [...state.turnsClued, globals.turn + 1] : state.turnsClued,
    };

    if (state.colorClueMemory.possibilities.length === 1) {
      // We have discovered the true suit of the card
      globals.learnedCards[state.order].suit = variant.suits[state.suitIndex!];
    }

    if (state.rankClueMemory.possibilities.length === 1) {
      // We have discovered the true rank of the card
      globals.learnedCards[state.order].rank = state.rank!;
    }

    // Handle if this is the first time that the card is fully revealed to the holder
    const isFullyKnown = (
      state.colorClueMemory.possibilities.length === 1
      && state.rankClueMemory.possibilities.length === 1
    );
    if (isFullyKnown) {
      this.updatePossibilitiesOnOtherCards(state.suitIndex!, state.rank!);
    }

    if (shouldReapplyRankClues) {
      this.reapplyRankClues();
    }

    if (shouldReapplyColorClues) {
      this.reapplyColorClues();
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
  private reapplyColorClues() {
    const { positiveClues, negativeClues } = this.state.colorClueMemory;
    this.state = produce(this.state, (state) => {
      state.colorClueMemory.positiveClues = [];
      state.colorClueMemory.negativeClues = [];
    });
    for (const colorIndex of positiveClues) {
      this.applyClue(colorClue(globals.variant.clueColors[colorIndex]), true);
    }
    for (const colorIndex of negativeClues) {
      this.applyClue(colorClue(globals.variant.clueColors[colorIndex]), false);
    }
  }

  // If a clue just eliminated the possibility of being a special multi-rank card,
  // we can retroactively remove rank pips from previous rank clues
  private reapplyRankClues() {
    const { positiveClues, negativeClues } = this.state.rankClueMemory;
    this.state = produce(this.state, (state) => {
      state.rankClueMemory.positiveClues = [];
      state.rankClueMemory.negativeClues = [];
    });
    for (const rank of positiveClues) {
      this.applyClue(rankClue(rank), true);
    }
    for (const rank of negativeClues) {
      this.applyClue(rankClue(rank), false);
    }
  }

  // We have learned the true suit and rank of this card
  // but it might not be known to the holder
  convert(msgSuit: number, msgRank: number) {
    // Local variables
    const suitIndex = msgSuit === -1 ? null : msgSuit;
    const rank = msgRank === -1 ? null : msgRank;

    this.state = produce(this.state, (state) => {
    // Blank the card if it is revealed with no suit and no rank
      state.blank = !(suitIndex || rank);

      // Set the true suit/rank on the card
      state.suitIndex = suitIndex;
      state.rank = rank;
    });

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
      this.state = produce(this.state, (state) => { state.identityDetermined = true; });
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

  private updatePossibilitiesOnOtherCards(suitIndex: number, rank: number) {
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
      card.state = removePossibilityTemp(
        card.state,
        suitIndex,
        rank,
        false,
        globals.variant,
      );
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
          card.state = removePossibilityTemp(card.state, suitIndex, rank, false, globals.variant);
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
        throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${nextRankNeeded} from the "possibleCards" map for card ${this.state.order}.`);
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

    for (const [suit, pipState] of this.state.colorClueMemory.pipStates.entries()) {
      const pip = this.suitPipsMap.get(suit)!;
      const x = this.suitPipsXMap.get(suit)!;
      // TODO: Positive clues on suits
      updatePip(pipState, false, pip, x);
    }
    for (const [rank, pipState] of this.state.rankClueMemory.pipStates.entries()) {
      const pip = this.rankPipsMap.get(rank)!;
      const x = this.rankPipsXMap.get(rank)!;
      const hasPositiveClues = this.state.rankClueMemory.positiveClues.includes(rank);
      updatePip(pipState, hasPositiveClues, pip, x);
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
