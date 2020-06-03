// The HanabiCard object represents a single card
// It has a LayoutChild parent

// Imports
import Konva from 'konva';
import Color from '../../Color';
import {
  CARD_FADE,
  CARD_H,
  CARD_W,
  ClueType,
  STACK_BASE_RANK,
  StackDirection,
  START_CARD_RANK,
  SUITS,
} from '../../constants';
import Suit from '../../Suit';
import Clue from './Clue';
import { msgSuitToSuit } from './convert';
import globals from './globals';
import * as HanabiCardInit from './HanabiCardInit';
import NoteIndicator from './NoteIndicator';
import * as notes from './notes';
import possibilitiesCheck from './possibilitiesCheck';
import RankPip from './RankPip';
import * as reversible from './variants/reversible';

export default class HanabiCard extends Konva.Group {
  // Mark the object type for use elsewhere in the code
  type: string = 'HanabiCard';
  bareName: string = '';
  order: number;
  // The index of the player that holds this card (or null if played/discarded)
  holder: number | null = null;
  suit: Suit | null = null;
  rank: number | null = null;
  blank: boolean = false;
  // The suit corresponding to the note written on the card, if any
  noteSuit: Suit | null = null;
  // The rank corresponding to the note written on the card, if any
  noteRank: number | null = null;
  noteKnownTrash: boolean = false;
  noteNeedsFix: boolean = false;
  noteChopMoved: boolean = false;
  noteFinessed: boolean = false;
  noteBlank: boolean = false;
  noteUnclued: boolean = false;

  // The following are the variables that are refreshed
  possibleSuits: Suit[] = [];
  possibleRanks: number[] = [];
  possibleCards: Map<string, number> = new Map();
  identityDetermined: boolean = false;
  tweening: boolean = false;
  empathy: boolean = false;
  doMisplayAnimation: boolean = false;
  numPositiveClues: number = 0;
  positiveColorClues: Color[] = [];
  negativeColorClues: Color[] = [];
  positiveRankClues: number[] = [];
  negativeRankClues: number[] = [];
  reapplyColorClues: boolean = false;
  reapplyRankClues: boolean = false;
  turnsClued: number[] = [];
  turnDrawn: number = -1;
  isDiscarded: boolean = false;
  turnDiscarded: number = -1;
  isPlayed: boolean = false;
  turnPlayed: number = -1;
  isMisplayed: boolean = false;

  bare: Konva.Image | null = null;
  cluedBorder: Konva.Group | null = null;
  chopMoveBorder: Konva.Group | null = null;
  finesseBorder: Konva.Group | null = null;
  suitPips: Konva.Group | null = null;
  suitPipsMap: Map<Suit, Konva.Shape> = new Map();
  suitPipsXMap: Map<Suit, Konva.Shape> = new Map();
  rankPips: Konva.Group | null = null;
  rankPipsMap: Map<number, RankPip> = new Map();
  rankPipsXMap: Map<number, Konva.Shape> = new Map();
  noteIndicator: NoteIndicator | null = null;
  tooltipName: string = '';
  trashcan: Konva.Image | null = null;
  wrench: Konva.Image | null = null;
  arrow: Konva.Group | null = null;
  arrowBase: Konva.Arrow | null = null;
  criticalIndicator: Konva.Image | null = null;

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
    this.order = config.order;

    // Initialize various elements/features of the card
    HanabiCardInit.image.call(this);
    HanabiCardInit.borders.call(this);
    HanabiCardInit.directionArrow.call(this);
    HanabiCardInit.pips.call(this);
    HanabiCardInit.note.call(this);
    HanabiCardInit.empathy.call(this);
    HanabiCardInit.click.call(this);
    HanabiCardInit.fadedImages.call(this);
    HanabiCardInit.criticalIndicator.call(this);
  }

  // Erase all of the data on the card to make it like it was freshly drawn
  refresh() {
    // Possible suits and ranks (based on clues given) are tracked separately
    // from knowledge of the true suit and rank
    this.possibleSuits = globals.variant.suits.slice();
    this.possibleRanks = globals.variant.ranks.slice();
    // Possible cards (based on both clues given and cards seen) are also tracked separately
    this.possibleCards = new Map(globals.cardsMap); // Start by cloning the "globals.cardsMap"
    this.identityDetermined = false;
    this.tweening = false;
    this.empathy = false;
    this.doMisplayAnimation = false;
    this.numPositiveClues = 0;
    this.positiveColorClues = [];
    this.negativeColorClues = [];
    this.positiveRankClues = [];
    this.negativeRankClues = [];
    this.reapplyColorClues = false;
    this.reapplyRankClues = false;
    this.turnsClued = [];
    // We have to add one to the turn drawn because
    // the "draw" command comes before the "turn" command
    // However, if it was part of the initial deal, then it will correctly be set as turn 0
    this.turnDrawn = globals.turn === 0 ? 0 : globals.turn + 1;
    this.isDiscarded = false;
    this.turnDiscarded = -1;
    this.isPlayed = false;
    this.turnPlayed = -1;
    this.isMisplayed = false;

    // Some variants disable listening on cards
    this.listening(true);

    this.setClued();
    if (!globals.replay && !globals.spectating) {
      // If it has a "chop move" note on it, we want to keep the chop move border turned on
      if (this.noteChopMoved) {
        this.chopMoveBorder!.show();
      }
      // If it has a "finessed" note on it, we want to keep the finesse border turned on
      if (this.noteFinessed) {
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

    HanabiCardInit.possibilities.call(this);
    this.setBareImage();
  }

  setClued() {
    const isClued = (
      this.numPositiveClues > 0
      && !this.isPlayed
      && !this.isDiscarded
      && !this.noteUnclued
    );

    // When cards are clued,
    // they should raise up a little bit to make it clear that they are touched
    // However, don't do this for other people's hands in Keldon mode
    this.offsetY(0.5 * CARD_H); // The default offset
    if (
      isClued
      && (
        !globals.lobby.settings.keldonMode
        || (this.holder === globals.playerUs && !globals.replay)
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
    return this.numPositiveClues > 0;
  }

  setBareImage() {
    const learnedCard = globals.learnedCards[this.order];

    // Find out the suit to display
    // (Unknown is a colorless suit used for unclued cards)
    let suitToShow;
    if (this.empathy) {
      // If we are in Empathy mode, only show the suit if there is only one possibility left
      if (this.possibleSuits.length === 1) {
        [suitToShow] = this.possibleSuits;
      } else {
        suitToShow = SUITS.get('Unknown');
      }
    } else {
      // If we are not in Empathy mode, then show the suit if it is known
      suitToShow = learnedCard.suit;
      if (
        this.rank === STACK_BASE_RANK
        && this.noteSuit !== null
        && !globals.replay
      ) {
        // The card note suit has precedence over the "real" suit,
        // but only for the stack bases (and not in replays)
        suitToShow = this.noteSuit;
      }
      if (suitToShow === null) {
        suitToShow = this.noteSuit;
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
      if (this.possibleRanks.length === 1) {
        [rankToShow] = this.possibleRanks;
      } else {
        rankToShow = 6;
      }
    } else {
      // If we are not in Empathy mode, then show the rank if it is known
      rankToShow = learnedCard.rank;
      if (
        this.rank === STACK_BASE_RANK
        && this.noteRank !== null
        && !globals.replay
      ) {
        // The card note rank has precedence over the "real" rank,
        // but only for the stack bases (and not in replays)
        rankToShow = this.noteRank;
      }
      if (rankToShow === null) {
        rankToShow = this.noteRank;
      }
      if (rankToShow === null) {
        rankToShow = 6;
      }
    }

    // Set the name
    // (setting "this.bareName" will automatically update how the card appears the next time that
    // the "card" layer is drawn)
    if (this.blank) {
      // The "blank" property is set when the card should appear blank no matter what
      this.bareName = 'deck-back';
    } else if (
      // A "blank" note means that the user wants to force the card to appear blank
      this.noteBlank
      && !this.empathy
      && !this.isPlayed
      && !this.isDiscarded
      && !globals.replay
      && !globals.spectating
    ) {
      this.bareName = 'deck-back';
    } else if (
      (
        globals.lobby.settings.realLifeMode
        || globals.variant.name.startsWith('Cow & Pig')
        || globals.variant.name.startsWith('Duck')
      ) && (suitToShow!.name === 'Unknown' || rankToShow === 6)
    ) {
      // In Real-Life mode or Cow & Pig / Duck variants,
      // always show the vanilla card back if the card is not fully revealed
      this.bareName = 'deck-back';
    } else {
      this.bareName = `card-${suitToShow!.name}-${rankToShow}`;
    }

    // Show or hide the pips
    if (
      globals.lobby.settings.realLifeMode
      || globals.variant.name.startsWith('Cow & Pig')
      || globals.variant.name.startsWith('Duck')
    ) {
      this.suitPips!.hide();
      this.rankPips!.hide();
    } else {
      this.suitPips!.visible(suitToShow!.name === 'Unknown');
      this.rankPips!.visible(rankToShow === 6);
    }

    // Show or hide the "trash" image
    this.trashcan!.visible((
      this.noteKnownTrash
      && !this.empathy
      && !this.isPlayed
      && !this.isDiscarded
      && !globals.replay
      && !globals.spectating
    ));

    // Show or hide the "fixme" image
    this.wrench!.visible((
      this.noteNeedsFix
      && !this.empathy
      && !this.isPlayed
      && !this.isDiscarded
      && !globals.replay
      && !globals.spectating
    ));

    this.setDirectionArrow();
    this.setFade();
    this.setCritical();
  }

  setDirectionArrow() {
    // Show or hide the direction arrow (for specific variants)
    if (
      this.suit === null
      || this.rank === 0
      || (!this.suit.reversed && !reversible.isUpOrDown())
    ) {
      return;
    }

    const suitIndex = globals.variant.suits.indexOf(this.suit);
    const direction = globals.stackDirections[suitIndex];

    let shouldShowArrow;
    if (reversible.isUpOrDown()) {
      // In "Up or Down" variants, the arrow should be shown when the stack direction is determined
      // (and the arrow should be cleared when the stack is finished)
      shouldShowArrow = (
        direction === StackDirection.Up
        || direction === StackDirection.Down
      );
    } else if (this.suit.reversed) {
      // In variants with a reversed suit, the arrow should always be shown on the reversed suit
      shouldShowArrow = true;
    } else {
      throw new Error('The "setDirectionArrow()" function encountered an impossible situation.');
    }

    const visible = (
      shouldShowArrow
      // As an exception, arrows should not show if we are using empathy and they have not
      // discovered the true suit of the card yet
      && (!this.empathy || this.possibleSuits.length === 1)
    );
    this.arrow!.visible(visible);
    if (!visible) {
      return;
    }

    this.arrow!.rotation(direction === StackDirection.Up ? 180 : 0);
    this.arrowBase!.stroke(this.suit!.fill);
    if (this.suit.fill === 'multi') {
      // We can't use a fill gradiant because the "fill" is actually a big stroke
      // (the Konva arrow object is not a shape, but instead a very thick line)
      // Instead, just use the the first gradiant color
      this.arrowBase!.stroke(this.suit.fillColors[0]);
    }
    if (this.rankPips!.visible()) {
      (this.arrow! as any).setMiddleRight();
    } else {
      (this.arrow! as any).setBottomRight();
    }
  }

  // Fade this card if it is useless, fully revealed, and still in a player's hand
  setFade() {
    if (
      globals.lobby.settings.realLifeMode
      || globals.options.speedrun
      || globals.variant.name.startsWith('Throw It in a Hole')
    ) {
      return;
    }

    const oldOpacity = this.opacity();

    let newOpacity = 1;
    if (
      this.suit !== null
      && this.rank !== null
      && this.numPositiveClues === 0
      && !this.isPlayed
      && !this.isDiscarded
      && !this.empathy
      && !this.needsToBePlayed()
    ) {
      newOpacity = CARD_FADE;
    }

    // Override the above logic and always fade the card if it is explicitly marked as known trash
    if (this.trashcan!.visible() && this.numPositiveClues === 0) {
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
      && (!this.empathy || this.identityDetermined)
      && !globals.lobby.settings.realLifeMode
      && !this.isPlayed
      && !this.isDiscarded
      && !this.noteBlank
    ));
  }

  // This card was touched by a positive or negative clue,
  // so remove pips and possibilities from the card
  applyClue(clue: Clue, positive: boolean) {
    // If the card is already fully revealed from clues, then additional clues would tell us nothing
    // We don't check for "this.identityDetermined" here because we still need to calculate the
    // effects of clues on cards in other people's hands that we already know the true identity of
    const wasFullyKnown = this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
    if (wasFullyKnown) {
      return;
    }

    // Mark all turns that this card is positively clued
    if (positive) {
      // We add one because the "clue" action comes before the "turn" action
      this.turnsClued.push(globals.turn + 1);
    }

    // Record unique clues that touch the card for later
    if (clue.type === ClueType.Color) {
      if (positive && !this.positiveColorClues.includes(clue.value as Color)) {
        this.positiveColorClues.push(clue.value as Color);
      } else if (!positive && !this.negativeColorClues.includes(clue.value as Color)) {
        this.negativeColorClues.push(clue.value as Color);
      }
    } else if (clue.type === ClueType.Rank) {
      if (positive && !this.positiveRankClues.includes(clue.value as number)) {
        this.positiveRankClues.push(clue.value as number);
      } else if (!positive && !this.negativeRankClues.includes(clue.value as number)) {
        this.negativeRankClues.push(clue.value as number);
      }
    }

    // Find out if we can remove some rank pips or suit pips from this clue
    let ranksRemoved: number[] = [];
    let suitsRemoved: Suit[] = [];
    if (clue.type === ClueType.Color) {
      const clueColor = clue.value as Color;
      // suitsRemoved keeps track of suits removed for normal ranks
      // This allows for proper checking of possibilities to cross out rank pips
      // We handle special ranks later
      if (globals.variant.colorCluesTouchNothing) {
        // Some variants have color clues touch no cards
        // If this is the case, we cannot remove any suit pips from the card
      } else {
        // The default case (e.g. No Variant)
        // Remove all possibilities that do not include this color
        suitsRemoved = this.possibleSuits.filter(
          (suit: Suit) => (
            suit.clueColors.includes(clueColor)
            || suit.allClueColors
          ) !== positive,
        );
      }

      if (
        possibilitiesCheck()
        && (globals.variant.specialAllClueColors || globals.variant.specialNoClueColors)
      ) {
        // We only need to run this early possibility removal for variants with special ranks
        // touched by all or no color clues
        for (const rank of this.possibleRanks) {
          // We can remove possibilities for normal ranks
          if (rank !== globals.variant.specialRank) {
            for (const suit of suitsRemoved) {
              this.removePossibility(suit, rank, true);
            }
          }
        }
      }

      if (
        positive
        && this.possibleRanks.includes(globals.variant.specialRank)
        && globals.variant.specialAllClueColors
      ) {
        // Some variants have specific ranks touched by all colors
        // If this is the case, and this is a positive color clue,
        // we cannot remove any color pips from the card
        // An exception to this is special suits touched by no colors
        suitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => !suit.noClueColors,
        );
      } else if (
        !positive
        && this.possibleRanks.includes(globals.variant.specialRank)
        && globals.variant.specialNoClueColors
      ) {
        // Some variants have specific ranks touched by no colors
        // If this is the case, and this is a negative color clue,
        // we cannot remove any color pips from the card
        // An exception to this is special suits touched by all colors
        suitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => !suit.allClueColors,
        );
      } else {
        // We can safely remove the suits from possible suits
        filterInPlace(this.possibleSuits, (suit: Suit) => suitsRemoved.indexOf(suit) === -1);
      }

      // Handle special ranks
      if (globals.variant.specialRank !== -1) {
        if (globals.variant.specialAllClueColors) {
          if (positive) {
            if (
              this.positiveColorClues.length >= 2
              && this.possibleSuits.filter((suit) => suit.allClueColors).length === 0
            ) {
              // Two positive color clues should "fill in" a special rank that is touched by all
              // color clues (that cannot be a mult-color suit)
              ranksRemoved = filterInPlace(
                this.possibleRanks,
                (rank: number) => rank === globals.variant.specialRank,
              );
            }
          } else if (this.possibleRanks.length === 1 && this.rank === globals.variant.specialRank) {
            // Negative color to a known special rank means that we can remove all suits
            // other that the ones that are never touched by color clues
            const moreSuitsRemoved = filterInPlace(
              this.possibleSuits,
              (suit: Suit) => suit.noClueColors,
            );
            suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
            suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
          } else if (this.possibleSuits.filter((suit) => suit.noClueColors).length === 0) {
            // Negative color means that the card cannot be the special rank
            // (as long as the card cannot be a suit that is never touched by color clues)
            ranksRemoved = filterInPlace(
              this.possibleRanks,
              (rank: number) => rank !== globals.variant.specialRank,
            );
          } else if (possibilitiesCheck()) {
            // If there is a suit never touched by color clues, we can still remove
            // possibilities for other suits on the special rank
            for (const suit of this.possibleSuits) {
              if (!suit.noClueColors) {
                this.removePossibility(suit, globals.variant.specialRank, true);
              }
            }
          }
        } else if (globals.variant.specialNoClueColors) {
          if (positive) {
            if (this.possibleSuits.filter((suit) => suit.allClueColors).length === 0) {
              // Positive color means that the card cannot be a special rank
              // (as long as the card cannot be a suit that is always touched by color clues)
              ranksRemoved = filterInPlace(
                this.possibleRanks,
                (rank: number) => rank !== globals.variant.specialRank,
              );
            } else if (possibilitiesCheck()) {
              // If there is a suit always touched by color clues, we can still remove
              // possibilities for other suits on the special rank
              for (const suit of this.possibleSuits) {
                if (!suit.allClueColors) {
                  this.removePossibility(suit, globals.variant.specialRank, true);
                }
              }
            }
          } else if (this.negativeColorClues.length === globals.variant.clueColors.length) {
            if (this.possibleSuits.filter((suit) => suit.noClueColors).length === 0) {
              // All negative colors means that the card must be the special rank
              // (as long as it cannot be a suit that is never touched by color clues)
              ranksRemoved = filterInPlace(
                this.possibleRanks,
                (rank: number) => rank === globals.variant.specialRank,
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
      if (globals.variant.rankCluesTouchNothing) {
        // Some variants have rank clues touch no cards
        // If this is the case, we cannot remove any rank pips from the card
      } else if (
        this.possibleRanks.includes(globals.variant.specialRank)
        && globals.variant.specialAllClueRanks
      ) {
        // Some variants have specific ranks touched by all rank clues
        ranksRemoved = this.possibleRanks.filter(
          (rank: number) => (rank === clueRank || rank === globals.variant.specialRank) !== positive, // eslint-disable-line max-len
        );
      } else if (
        this.possibleRanks.includes(globals.variant.specialRank)
        && globals.variant.specialNoClueRanks
      ) {
        // Some variants have specific ranks touched by no rank clues
        ranksRemoved = this.possibleRanks.filter(
          (rank: number) => (rank === clueRank && rank !== globals.variant.specialRank) !== positive, // eslint-disable-line max-len
        );
      } else {
        // The default case (e.g. No Variant)
        // Remove all possibilities that do not include this rank
        ranksRemoved = this.possibleRanks.filter(
          (rank: number) => (rank === clueRank) !== positive,
        );
      }

      // Some suits are touched by all rank clues
      // Some suits are not touched by any rank clues
      // So we may be able to remove a suit pip
      if (positive) {
        suitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => !suit.noClueRanks,
        );
      } else {
        suitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => !suit.allClueRanks,
        );
      }

      // Handle the special case where two positive rank clues should "fill in" a card of a
      // multi-rank suit
      if (
        positive
        && this.positiveRankClues.length >= 2
        && !(
          this.possibleRanks.includes(globals.variant.specialRank)
          && globals.variant.specialAllClueRanks
        )
      ) {
        const moreSuitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => suit.allClueRanks,
        );
        suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
        suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
      }

      // Handle the special case where all negative rank clues should "fill in" a card of a
      // rank-less suit
      if (
        !positive
        && this.negativeRankClues.length === globals.variant.ranks.length
        // We know that any special rank can be given as a rank clue
        // so there is no need to have a separate check for special variants
      ) {
        const moreSuitsRemoved = filterInPlace(
          this.possibleSuits,
          (suit: Suit) => suit.noClueRanks,
        );
        suitsRemoved = suitsRemoved.concat(moreSuitsRemoved);
        suitsRemoved = removeDuplicatesFromArray(suitsRemoved);
      }

      // If the rank of the card is not known yet,
      // change the rank pip that corresponds with this number to signify a positive clue
      if (positive) {
        const pip = this.rankPipsMap.get(clueRank)!;
        if (pip.visible()) {
          pip.showPositiveClue();
        }
      }

      if (possibilitiesCheck()) {
        for (const suit of this.possibleSuits) {
          // We can remove possibilities for normal suits touched by their own rank
          if (!suit.allClueRanks && !suit.noClueRanks) {
            for (const rank of ranksRemoved) {
              this.removePossibility(suit, rank, true);
            }
          }
        }
      }

      if (this.possibleSuits.some((suit) => suit.allClueRanks) && positive) {
        // Some cards are touched by all ranks,
        // so if this is a positive rank clue, we cannot remove any rank pips from the card
        ranksRemoved = [];
      } else if (this.possibleSuits.some((suit) => suit.noClueRanks) && !positive) {
        // Some suits are not touched by any ranks,
        // so if this is a negative rank clue, we cannot remove any rank pips from the card
        ranksRemoved = [];
      } else {
        // We can safely remove the ranks from possible ranks
        filterInPlace(this.possibleRanks, (rank: number) => ranksRemoved.indexOf(rank) === -1);
      }
    }

    // Remove suit pips, if any
    for (const suitRemoved of suitsRemoved) {
      // Hide the suit pips
      this.suitPipsMap.get(suitRemoved)!.hide();
      this.suitPipsXMap.get(suitRemoved)!.hide();

      // Remove any card possibilities for this suit
      if (possibilitiesCheck()) {
        for (const rank of globals.variant.ranks) {
          this.removePossibility(suitRemoved, rank, true);
        }
      }

      // Check for note impossibilities
      // e.g. a note of "r" is now impossible because we know that it is not a red card
      if (this.noteSuit === suitRemoved && this.noteRank === null) {
        this.noteSuit = null;
        this.noteRank = null;
        this.setBareImage();
        globals.layers.card.batchDraw();
      }

      if (suitRemoved.allClueRanks || suitRemoved.noClueRanks) {
        // Mark to retroactively apply rank clues when we return from this function
        this.reapplyRankClues = true;
      }
    }
    if (this.possibleSuits.length === 1) {
      // We have discovered the true suit of the card
      [this.suit] = this.possibleSuits;
      globals.learnedCards[this.order].suit = this.suit;
      this.suitPipsMap.get(this.suit)!.hide();
      this.suitPips!.hide();
    }

    // Remove rank pips, if any
    for (const rankRemoved of ranksRemoved) {
      // Hide the rank pips
      this.rankPipsMap.get(rankRemoved)!.hide();
      this.rankPipsXMap.get(rankRemoved)!.hide();

      // Remove any card possibilities for this rank
      if (possibilitiesCheck()) {
        for (const suit of globals.variant.suits) {
          this.removePossibility(suit, rankRemoved, true);
        }
      }

      // Check for note impossibilities
      // e.g. a note of "1" is now impossible because we know that it is not a 1
      if (this.noteSuit === null && this.noteRank !== this.rank) {
        this.noteSuit = null;
        this.noteRank = null;
        this.setBareImage();
        globals.layers.card.batchDraw();
      }

      if (
        rankRemoved === globals.variant.specialRank
        && (globals.variant.specialAllClueColors || globals.variant.specialNoClueColors)
      ) {
        // Mark to retroactively apply color clues when we return from this function
        this.reapplyColorClues = true;
      }
    }
    if (this.possibleRanks.length === 1) {
      // We have discovered the true rank of the card
      [this.rank] = this.possibleRanks;
      globals.learnedCards[this.order].rank = this.rank;
      this.rankPips!.hide();
    }

    // Handle if this is the first time that the card is fully revealed to the holder
    const isFullyKnown = this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
    if (isFullyKnown && !wasFullyKnown) {
      this.identityDetermined = true;
      this.updatePossibilitiesOnOtherCards(this.suit!, this.rank!);
    }
  }

  // If a clue just eliminated the possibility of being a special multi-color card,
  // we need to retroactively apply previous color clues
  checkReapplyColorClues() {
    if (!this.reapplyColorClues) {
      return;
    }

    this.reapplyColorClues = false;
    const { positiveColorClues, negativeColorClues } = this;
    this.positiveColorClues = [];
    this.negativeColorClues = [];
    for (const color of positiveColorClues) {
      this.applyClue(new Clue(ClueType.Color, color), true);
    }
    for (const color of negativeColorClues) {
      this.applyClue(new Clue(ClueType.Color, color), false);
    }
  }

  // If a clue just eliminated the possibility of being a special multi-rank card,
  // we can retroactively remove rank pips from previous rank clues
  checkReapplyRankClues() {
    if (!this.reapplyRankClues) {
      return;
    }

    this.reapplyRankClues = false;
    const { positiveRankClues, negativeRankClues } = this;
    this.positiveRankClues = [];
    this.negativeRankClues = [];
    for (const rank of positiveRankClues) {
      this.applyClue(new Clue(ClueType.Rank, rank), true);
    }
    for (const rank of negativeRankClues) {
      this.applyClue(new Clue(ClueType.Rank, rank), false);
    }
  }

  // Check to see if we can put an X over this suit pip or this rank pip
  checkPipPossibilities(suit: Suit, rank: number) {
    // First, check to see if there are any possibilities remaining for this suit
    let suitPossible = false;
    for (const rank2 of globals.variant.ranks) {
      const count = this.possibleCards.get(`${suit.name}${rank2}`);
      if (typeof count === 'undefined') {
        throw new Error(`Failed to get an entry for ${suit.name}${rank2} from the "possibleCards" map for card ${this.order}.`);
      }
      if (count > 0) {
        suitPossible = true;
        break;
      }
    }
    if (!suitPossible) {
      // Do nothing if the normal pip is already hidden
      const pip = this.suitPipsMap.get(suit)!;
      if (pip.visible()) {
        // All the cards of this suit are seen, so put an X over the suit pip
        this.suitPipsXMap.get(suit)!.visible(true);
      }
    }

    // Second, check to see if there are any possibilities remaining for this rank
    let rankPossible = false;
    for (const suit2 of globals.variant.suits) {
      const count = this.possibleCards.get(`${suit2.name}${rank}`);
      if (typeof count === 'undefined') {
        throw new Error(`Failed to get an entry for ${suit2.name}${rank} from the "possibleCards" map for card ${this.order}.`);
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
        const pip = this.rankPipsMap.get(rank)!;
        if (pip.visible()) {
          // All the cards of this rank are seen, so put an X over the rank pip
          this.rankPipsXMap.get(rank)!.visible(true);
        }
      }
    }
  }

  // This card was either played or discarded (or revealed at the end of the game)
  reveal(msgSuit: number, rank: number) {
    // Local variables
    const suit = msgSuitToSuit(msgSuit, globals.variant);

    // Set the true suit/rank on the card
    this.suit = suit;
    this.rank = rank;

    // Played cards are not revealed in the "Throw It in a Hole" variant
    if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay && this.isPlayed) {
      return;
    }

    // If the card was already fully-clued,
    // we already updated the possibilities for it on other cards
    if (!this.identityDetermined) {
      this.identityDetermined = true;
      this.updatePossibilitiesOnOtherCards(suit, rank);
    }

    // Keep track of what this card is
    const learnedCard = globals.learnedCards[this.order];
    learnedCard.suit = suit;
    learnedCard.rank = rank;
    learnedCard.revealed = true;

    // Redraw the card
    this.setBareImage();
  }

  updatePossibilitiesOnOtherCards(suit: Suit, rank: number) {
    if (!possibilitiesCheck()) {
      return;
    }

    // Update the possibilities for the player
    // who just discovered the true identity of this card
    // (either through playing it, discarding it, or getting a clue that fully revealed it)
    if (this.holder === null) {
      throw new Error('The holder of this card\'s hand is null in the "updatePossibilitiesOnOtherCards()" function.');
    }
    const playerHand = globals.elements.playerHands[this.holder];
    for (const layoutChild of playerHand.children.toArray()) {
      const card = layoutChild.children[0];
      if (card.order === this.order) {
        // There is no need to update the card that was just revealed
        continue;
      }
      card.removePossibility(suit, rank, false);
    }

    // If this is a:
    // 1) unknown card that we played or
    // 2) a card that was just fully revealed in our hand via a clue
    // then we also need to update the possibilities for the other hands
    if (this.holder === globals.playerUs && !globals.replay && !globals.spectating) {
      for (let i = 0; i < globals.elements.playerHands.length; i++) {
        if (i === this.holder) {
          // We already updated our own hand above
          continue;
        }

        const playerHand2 = globals.elements.playerHands[i];
        for (const layoutChild of playerHand2.children.toArray()) {
          const card = layoutChild.children[0];
          card.removePossibility(suit, rank, false);
        }
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
    this.holder = null;
  }

  animateToPlayStacks() {
    // We add a LayoutChild to a PlayStack
    if (globals.variant.name.startsWith('Throw It in a Hole') && !globals.replay) {
      // The act of adding it will automatically tween the card
      const hole = globals.elements.playStacks.get('hole')!;
      hole.addChild(this.parent as any);

      // We do not want this card to interfere with writing notes on the stack bases
      this.listening(false);
    } else {
      // The act of adding it will automatically tween the card
      const playStack = globals.elements.playStacks.get(this.suit!)!;
      playStack.addChild(this.parent as any);

      // We also want to move this stack to the top so that
      // cards do not tween behind the other play stacks when travelling to this stack
      playStack.moveToTop();
    }
  }

  animateToDiscardPile() {
    // We add a LayoutChild to a CardLayout
    const discardStack = globals.elements.discardStacks.get(this.suit!)!;
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
    notes.set(this.order, note);
    notes.update(this);
    if (note !== '') {
      notes.show(this);
    }
  }

  appendNote(note: string) {
    // By default, set the note directly on the card
    let newNote = note;

    // If we had an existing note, append the new note to the end using pipe notation
    const existingNote = globals.ourNotes[this.order];
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
      if (layoutChild.children[0].order === this.order) {
        return numCardsInHand - i;
      }
    }

    return -1;
  }

  isCritical() {
    if (
      this.suit === null
      || this.rank === null
      || this.rank === 0 // Base
      || this.isPlayed
      || this.isDiscarded
      || !this.needsToBePlayed()
    ) {
      return false;
    }

    // "Up or Down" has some special cases for critical cards
    if (reversible.hasReversedSuits()) {
      return reversible.isCardCritical(this);
    }

    const num = getSpecificCardNum(this.suit, this.rank);
    return num.total === num.discarded + 1;
  }

  // needsToBePlayed returns true if the card is not yet played
  // and is still needed to be played in order to get the maximum score
  // (this mirrors the server function in "card.go")
  needsToBePlayed() {
    // First, check to see if a copy of this card has already been played
    for (const card of globals.deck) {
      if (card.order === this.order) {
        continue;
      }
      if (card.suit === this.suit && card.rank === this.rank && card.isPlayed) {
        return false;
      }
    }

    // Determining if the card needs to be played in variants with reversed suits is more
    // complicated
    if (reversible.hasReversedSuits()) {
      return reversible.needsToBePlayed(this);
    }

    // Second, check to see if it is still possible to play this card
    // (the preceding cards in the suit might have already been discarded)
    for (let i = 1; i < this.rank!; i++) {
      const num = getSpecificCardNum(this.suit!, i);
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
    if (reversible.hasReversedSuits()) {
      return reversible.isPotentiallyPlayable(this);
    }

    let potentiallyPlayable = false;
    for (const suit of globals.variant.suits) {
      const playStack = globals.elements.playStacks.get(suit)!;
      let lastPlayedRank = playStack.getLastPlayedRank();
      if (lastPlayedRank === 5) {
        continue;
      }
      if (lastPlayedRank === STACK_BASE_RANK) {
        lastPlayedRank = 0;
      }
      const nextRankNeeded = lastPlayedRank + 1;
      const count = this.possibleCards.get(`${suit.name}${nextRankNeeded}`);
      if (typeof count === 'undefined') {
        throw new Error(`Failed to get an entry for ${suit.name}${nextRankNeeded} from the "possibleCards" map for card ${this.order}.`);
      }
      if (count > 0) {
        potentiallyPlayable = true;
        break;
      }
    }

    return potentiallyPlayable;
  }

  removePossibility(suit: Suit, rank: number, all: boolean) {
    // Every card has a possibility map that maps card identities to count
    const mapIndex = `${suit.name}${rank}`;
    let cardsLeft = this.possibleCards.get(mapIndex);
    if (typeof cardsLeft === 'undefined') {
      throw new Error(`Failed to get an entry for ${mapIndex} from the "possibleCards" map for card ${this.order}.`);
    }
    if (cardsLeft > 0) {
      // Remove one or all possibilities for this card,
      // (depending on whether the card was clued
      // or if we saw someone draw a copy of this card)
      cardsLeft = all ? 0 : cardsLeft - 1;
      this.possibleCards.set(mapIndex, cardsLeft);
      this.checkPipPossibilities(suit, rank);
    }

    // If we wrote a card identity note and all the possibilities for that note have been
    // eliminated, unmorph the card
    // e.g. a note of "r1" is now impossible because red 1 has 0 cards left
    // The case of removing a wrong note of "r" or "1" is handled in the "HanabiCard.applyClue()"
    // function
    if (this.noteSuit === suit && this.noteRank === rank && cardsLeft === 0) {
      this.noteSuit = null;
      this.noteRank = null;
      this.setBareImage();
      globals.layers.card.batchDraw();
    }
  }
}

// ---------------
// Misc. functions
// ---------------

// Remove everything from the array that does not match the condition in the function
const filterInPlace = (values: any[], predicate: (value: any) => boolean) => {
  const removed = [];
  let i = values.length - 1;
  while (i >= 0) {
    if (!predicate(values[i])) {
      removed.unshift(values.splice(i, 1)[0]);
    }
    i -= 1;
  }
  return removed;
};

// From: https://medium.com/dailyjs/how-to-remove-array-duplicates-in-es6-5daa8789641c
const removeDuplicatesFromArray = (array: any[]) => array.filter(
  (item, index) => array.indexOf(item) === index,
);

// getSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
// (this DOES NOT mirror the server function in "game.go",
// because the client does not have the full deck)
export const getSpecificCardNum = (suit: Suit, rank: number) => {
  // First, find out how many of this card should be in the deck, based on the rules of the game
  let total = 0;
  if (rank === 1) {
    total = 3;
    if (reversible.isUpOrDown() || suit.reversed) {
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
    if (card.suit === suit && card.rank === rank && card.isDiscarded) {
      discarded += 1;
    }
  }

  return { total, discarded };
};
