/*
    The HanabiCard object represents a single card
    It has a LayoutChild parent
*/

// Imports
import Konva from 'konva';
import Clue from './Clue';
import {
    CARD_FADE,
    CARD_H,
    CARD_W,
    CLUE_TYPE,
    STACK_BASE_RANK,
    STACK_DIRECTION,
    START_CARD_RANK,
    SUITS,
} from '../../constants';
import Color from '../../Color';
import globals from './globals';
import * as HanabiCardInit from './HanabiCardInit';
import { msgSuitToSuit, suitToMsgSuit } from './convert';
import NoteIndicator from './NoteIndicator';
import * as notes from './notes';
import possibilitiesCheck from './possibilitiesCheck';
import RankPip from './RankPip';
import Suit from '../../Suit';

export default class HanabiCard extends Konva.Group {
    // Mark the object type for use elsewhere in the code
    type: string = 'HanabiCard';
    bareName: string = '';
    order: number;
    // The index of the player that holds this card (or null if played/discarded)
    holder: number | null = null;
    suit: Suit | null = null;
    rank: number | null = null;
    // The suit corresponding to the note written on the card, if any
    noteSuit: Suit | null = null;
    // The rank corresponding to the note written on the card, if any
    noteRank: number | null = null;
    noteKnownTrash: boolean = false;
    noteNeedsFix: boolean = false;
    noteChopMoved: boolean = false;
    noteFinessed: boolean = false;
    noteBlank: boolean = false;

    // The following are the variables that are refreshed
    possibleSuits: Array<Suit> = [];
    possibleRanks: Array<number> = [];
    possibleCards: Map<string, number> = new Map();
    tweening: boolean = false;
    empathy: boolean = false;
    doMisplayAnimation: boolean = false;
    numPositiveClues: number = 0;
    positiveColorClues: Array<Color> = [];
    negativeColorClues: Array<Color> = [];
    positiveRankClues: Array<number> = [];
    negativeRankClues: Array<number> = [];
    reapplyColorClues: boolean = false;
    reapplyRankClues: boolean = false;
    turnsClued: Array<number> = [];
    turnDrawn: number = -1;
    isDiscarded: boolean = false;
    turnDiscarded: number = -1;
    isPlayed: boolean = false;
    turnPlayed: number = -1;
    isMisplayed: boolean = false;

    bare: Konva.Image | null = null;
    cluedBorder: Konva.Rect | null = null;
    noteBorder: Konva.Rect | null = null;
    finesseBorder: Konva.Rect | null = null;
    suitPips: Konva.Group | null = null;
    suitPipsMap: Map<Suit, Konva.Shape> = new Map();
    suitPipsXMap: Map<Suit, Konva.Shape> = new Map();
    rankPips: Konva.Group | null = null;
    rankPipsMap: Map<number, RankPip> = new Map();
    rankPipsXMap: Map<number, Konva.Shape> = new Map();
    noteIndicator: NoteIndicator | null = null;
    tooltipName: string = '';
    fixme: Konva.Image | null = null;

    constructor(config: Konva.ContainerConfig) {
        super(config);
        this.listening(true);

        // Cards should start off with a constant width and height
        this.width(CARD_W);
        this.height(CARD_H);
        this.x(CARD_W / 2);
        this.y(CARD_H / 2);
        this.offset({
            x: CARD_W / 2,
            y: CARD_H / 2,
        });

        // Most class variables are defined below in the "refresh()" function
        // Order is defined upon first initialization
        this.order = config.order;

        // Initialize various elements/features of the card
        HanabiCardInit.image.call(this);
        HanabiCardInit.border.call(this);
        HanabiCardInit.pips.call(this);
        HanabiCardInit.note.call(this);
        HanabiCardInit.empathy.call(this);
        HanabiCardInit.click.call(this);
        HanabiCardInit.fixme.call(this);
        HanabiCardInit.sparkles.call(this);
    }

    // Erase all of the data on the card to make it like it was freshly drawn
    refresh() {
        // Possible suits and ranks (based on clues given) are tracked separately
        // from knowledge of the true suit and rank
        this.possibleSuits = globals.variant.suits.slice();
        this.possibleRanks = globals.variant.ranks.slice();
        // Possible cards (based on both clues given and cards seen) are also tracked separately
        this.possibleCards = new Map(globals.cardsMap); // Start by cloning the "globals.cardsMap"
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

        this.listening(true); // Some variants disable listening on cards

        this.hideBorders();
        if (!globals.replay && !globals.spectating) {
            // If it has a "chop move" note on it, we want to keep the chop move border turned on
            if (this.noteChopMoved) {
                this.noteBorder!.show();
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

    isClued() {
        return this.numPositiveClues > 0;
    }

    hideBorders() {
        this.cluedBorder!.hide();
        this.noteBorder!.hide();
        this.finesseBorder!.hide();
    }

    setBareImage() {
        const learnedCard = globals.learnedCards[this.order];

        // Find out the suit to display
        // (Unknown is a colorless suit used for unclued cards)
        let suitToShow;
        if (this.empathy) {
            // If we are in Empathy mode, only show the suit if there is only one possibility left
            // and the card has one or more clues on it
            if (this.possibleSuits.length === 1 && this.isClued()) {
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

        // "Card-Unknown" is not created, so use "NoPip-Unknown"
        let prefix = 'Card';
        if (suitToShow!.name === 'Unknown') {
            prefix = 'NoPip';
        }

        // Find out the rank to display
        // (6 is a used for unclued cards)
        let rankToShow;
        if (this.empathy) {
            // If we are in Empathy mode, only show the rank if there is only one possibility left
            // and the card has one or more clues on it
            if (this.possibleRanks.length === 1 && this.isClued()) {
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
        // (but in Real-Life mode or Cow & Pig / Duck variants,
        // always show the vanilla card back if the card is not fully revealed)
        if (
            this.noteKnownTrash
            && !this.empathy
            && !this.isPlayed
            && !this.isDiscarded
            && !globals.replay
            && !globals.spectating
        ) {
            this.bareName = 'known-trash';
        } else if (
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
                globals.lobby.settings.get('realLifeMode')
                || globals.variant.name.startsWith('Cow & Pig')
                || globals.variant.name.startsWith('Duck')
            ) && (suitToShow!.name === 'Unknown' || rankToShow === 6)
        ) {
            this.bareName = 'deck-back';
        } else {
            this.bareName = `${prefix}-${suitToShow!.name}-${rankToShow}`;
        }

        // Show or hide the pips
        if (
            this.bareName === 'known-trash'
            || globals.lobby.settings.get('realLifeMode')
            || globals.variant.name.startsWith('Cow & Pig')
            || globals.variant.name.startsWith('Duck')
        ) {
            this.suitPips!.hide();
            this.rankPips!.hide();
        } else {
            this.suitPips!.visible(suitToShow!.name === 'Unknown');
            this.rankPips!.visible(rankToShow === 6);
        }

        // Show or hide the "fixme" image
        this.fixme!.visible((
            this.noteNeedsFix
            && !this.empathy
            && !globals.replay
            && !globals.spectating
        ));
    }

    // Fade this card if it is useless, fully revealed, and still in a player's hand
    setFade() {
        if (
            globals.lobby.settings.get('realLifeMode')
            || globals.speedrun
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

        if (oldOpacity === newOpacity) {
            return;
        }

        this.opacity(newOpacity);
    }

    // This card was touched by a positive or negative clue,
    // so remove pips and possibilities from the card
    applyClue(clue: Clue, positive: boolean) {
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
        if (clue.type === CLUE_TYPE.RANK) {
            if (positive && !this.positiveRankClues.includes(clue.value as number)) {
                this.positiveRankClues.push(clue.value as number);
            } else if (!positive && !this.negativeRankClues.includes(clue.value as number)) {
                this.negativeRankClues.push(clue.value as number);
            }
        } else if (clue.type === CLUE_TYPE.COLOR) {
            if (positive && !this.positiveColorClues.includes(clue.value as Color)) {
                this.positiveColorClues.push(clue.value as Color);
            } else if (!positive && !this.negativeColorClues.includes(clue.value as Color)) {
                this.negativeColorClues.push(clue.value as Color);
            }
        }

        // Find out if we can remove some rank pips or suit pips from this clue
        let ranksRemoved: Array<number> = [];
        let suitsRemoved: Array<Suit> = [];
        if (clue.type === CLUE_TYPE.RANK) {
            const clueRank = clue.value as number;
            if (globals.variant.rankCluesTouchNothing) {
                // Some variants have rank clues touch no cards
                // If this is the case, we cannot remove any rank pips from the card
            } else if (this.possibleSuits.some((suit) => suit.clueRanks === 'none') && !positive) {
                // Some suits are not touched by any ranks,
                // so if this is a negative rank clue, we cannot remove any rank pips from the card
            } else if (this.possibleSuits.some((suit) => suit.clueRanks === 'all') && positive) {
                // Some cards are touched by all ranks,
                // so if this is a positive rank clue, we cannot remove any rank pips from the card
            } else if (
                globals.variant.name.includes('Pink-Ones')
                || globals.variant.name.includes('Omni-Ones')
            ) {
                // In some variants, the 1 of every suit is touched by all rank clues
                ranksRemoved = filterInPlace(
                    this.possibleRanks,
                    (rank: number) => (rank === clueRank || rank === 1) === positive,
                );
            } else if (
                globals.variant.name.includes('Pink-Fives')
                || globals.variant.name.includes('Omni-Fives')
            ) {
                // In some variants, the 5 of every suit is touched by all rank clues
                ranksRemoved = filterInPlace(
                    this.possibleRanks,
                    (rank: number) => (rank === clueRank || rank === 5) === positive,
                );
            } else if (
                globals.variant.name.includes('Brown-Ones')
                || globals.variant.name.includes('Null-Ones')
                || globals.variant.name.includes('Muddy-Rainbow-Ones')
            ) {
                // In some variants, the 1 of every suit is not touched by any rank clues
                ranksRemoved = filterInPlace(
                    this.possibleRanks,
                    (rank: number) => (rank === clueRank && rank !== 1) === positive,
                );
            } else if (
                globals.variant.name.includes('Brown-Fives')
                || globals.variant.name.includes('Null-Fives')
                || globals.variant.name.includes('Muddy-Rainbow-Fives')
            ) {
                // In some variants, the 5 of every suit is not touched by any rank clues
                ranksRemoved = filterInPlace(
                    this.possibleRanks,
                    (rank: number) => (rank === clueRank && rank !== 5) === positive,
                );
            } else {
                // Remove all possibilities that do not include this rank
                ranksRemoved = filterInPlace(
                    this.possibleRanks,
                    (rank: number) => (rank === clueRank) === positive,
                );
            }

            // Some suits are touched by all rank clues
            // Some suits are not touched by any rank clues
            // So we may be able to remove a suit pip or a card possibility
            if (positive) {
                suitsRemoved = filterInPlace(
                    this.possibleSuits,
                    (suit: Suit) => suit.clueRanks !== 'none',
                );

                // Also handle the special case where two positive rank clues
                // should "fill in" a card of a multi-rank suit
                if (
                    this.positiveRankClues.length >= 2
                    && !(globals.variant.name.includes('Pink-Ones') && this.possibleRanks.includes(1))
                    && !(globals.variant.name.includes('Omni-Ones') && this.possibleRanks.includes(1))
                    && !(globals.variant.name.includes('Light-Pink-Ones') && this.possibleRanks.includes(1))
                    && !(globals.variant.name.includes('Pink-Fives') && this.possibleRanks.includes(5))
                    && !(globals.variant.name.includes('Omni-Fives') && this.possibleRanks.includes(5))
                    && !(globals.variant.name.includes('Light-Pink-Fives') && this.possibleRanks.includes(5))
                ) {
                    suitsRemoved = filterInPlace(
                        this.possibleSuits,
                        (suit: Suit) => suit.clueRanks === 'all',
                    );
                }

                // Remove all the possibilities for cards that are definately not this rank
                if (possibilitiesCheck()) {
                    for (const suit of globals.variant.suits) {
                        if (suit.clueRanks === 'all') {
                            continue;
                        }
                        for (const rank of globals.variant.ranks) {
                            if (rank === clueRank) {
                                continue;
                            }
                            if (
                                (globals.variant.name.includes('Pink-Ones') && rank === 1)
                                || (globals.variant.name.includes('Omni-Ones') && rank === 1)
                                || (globals.variant.name.includes('Pink-Fives') && rank === 5)
                                || (globals.variant.name.includes('Omni-Fives') && rank === 5)
                            ) {
                                continue;
                            }
                            this.removePossibility(suit, rank, true);
                        }
                    }
                }

                // If the rank of the card is not known yet,
                // change the rank pip that corresponds with this number to signify a positive clue
                const pip = this.rankPipsMap.get(clueRank)!;
                if (pip.visible()) {
                    pip.showPositiveClue();
                }
            } else {
                suitsRemoved = filterInPlace(
                    this.possibleSuits,
                    (suit: Suit) => suit.clueRanks !== 'all',
                );
            }
        } else if (clue.type === CLUE_TYPE.COLOR) {
            const clueColor = clue.value as Color;
            if (globals.variant.colorCluesTouchNothing) {
                // Some variants have color clues touch no cards
                // If this is the case, we cannot remove any suit pips from the card
            } else if (
                positive
                && (
                    (globals.variant.name.includes('Rainbow-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('Omni-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('Muddy-Rainbow-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('Rainbow-Fives') && this.possibleRanks.includes(5))
                    || (globals.variant.name.includes('Omni-Fives') && this.possibleRanks.includes(5))
                    || (globals.variant.name.includes('Muddy-Rainbow-Fives') && this.possibleRanks.includes(5))
                )
            ) {
                // In some variants, 1's or 5's are touched by all colors
                // So if this is a positive color clue,
                // we cannot remove any color pips from the card
            } else if (
                !positive
                && (
                    (globals.variant.name.includes('White-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('Null-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('Light-Pink-Ones') && this.possibleRanks.includes(1))
                    || (globals.variant.name.includes('White-Fives') && this.possibleRanks.includes(5))
                    || (globals.variant.name.includes('Null-Fives') && this.possibleRanks.includes(5))
                    || (globals.variant.name.includes('Light-Pink-Fives') && this.possibleRanks.includes(5))
                )
            ) {
                // In some variants, 1's or 5's are not touched by any colors
                // So if this is a negative color clue,
                // we cannot remove any color pips from the card
            } else {
                // Remove all possibilities that do not include this color
                suitsRemoved = filterInPlace(
                    this.possibleSuits,
                    (suit: Suit) => suit.clueColors.includes(clueColor) === positive,
                );
            }

            // Handle special ones and fives
            if (
                globals.variant.name.includes('Rainbow-Ones')
                || globals.variant.name.includes('Omni-Ones')
                || globals.variant.name.includes('Muddy-Rainbow-Ones')
            ) {
                if (positive) {
                    if (this.positiveColorClues.length >= 2) {
                        // Two positive color clues should "fill in" a 1
                        ranksRemoved = filterInPlace(
                            this.possibleRanks,
                            (rank: number) => rank === 1,
                        );
                    }
                } else {
                    // Negative color means that the card cannot be a 1
                    ranksRemoved = filterInPlace(
                        this.possibleRanks,
                        (rank: number) => rank !== 1,
                    );
                }
            } else if (
                globals.variant.name.includes('Rainbow-Fives')
                || globals.variant.name.includes('Omni-Fives')
                || globals.variant.name.includes('Muddy-Rainbow-Fives')
            ) {
                if (positive) {
                    if (this.positiveColorClues.length >= 2) {
                        // Two positive color clues should "fill in" a 5
                        ranksRemoved = filterInPlace(
                            this.possibleRanks,
                            (rank: number) => rank === 5,
                        );
                    }
                } else {
                    // Negative color means that the card cannot be a 5
                    ranksRemoved = filterInPlace(
                        this.possibleRanks,
                        (rank: number) => rank !== 5,
                    );
                }
            } else if (
                globals.variant.name.includes('White-Ones')
                || globals.variant.name.includes('Null-Ones')
                || globals.variant.name.includes('Light-Pink-Ones')
            ) {
                if (positive) {
                    // Positive color means that the card cannot be a 1
                    ranksRemoved = filterInPlace(
                        this.possibleRanks,
                        (rank: number) => rank !== 1,
                    );
                }
            } else if (
                globals.variant.name.includes('White-Fives')
                || globals.variant.name.includes('Null-Fives')
                || globals.variant.name.includes('Light-Pink-Fives')
            ) {
                if (positive) {
                    // Positive color means that the card cannot be a 5
                    ranksRemoved = filterInPlace(
                        this.possibleRanks,
                        (rank: number) => rank !== 5,
                    );
                }
            }
        }

        // Remove rank pips, if any
        for (const rank of ranksRemoved) {
            // Hide the rank pips
            this.rankPipsMap.get(rank)!.hide();
            this.rankPipsXMap.get(rank)!.hide();

            // Remove any card possibilities for this rank
            if (possibilitiesCheck()) {
                for (const suit of globals.variant.suits) {
                    this.removePossibility(suit, rank, true);
                }
            }

            if (
                (globals.variant.name.includes('Rainbow-Ones') && rank === 1)
                || (globals.variant.name.includes('Omni-Ones') && rank === 1)
                || (globals.variant.name.includes('Muddy-Rainbow-Ones') && rank === 1)
                || (globals.variant.name.includes('Rainbow-Fives') && rank === 5)
                || (globals.variant.name.includes('Omni-Fives') && rank === 5)
                || (globals.variant.name.includes('Muddy-Rainbow-Fives') && rank === 5)
            ) {
                // Mark to retroactively apply color clues when we return from this function
                this.reapplyColorClues = true;
            }
        }
        if (this.possibleRanks.length === 1) {
            [this.rank] = this.possibleRanks;

            // Don't record the rank or hide the pips if the card is unclued
            if (this.holder === null || this.isClued()) {
                globals.learnedCards[this.order].rank = this.rank;
                this.rankPipsMap.get(this.rank)!.hide();
                this.rankPips!.hide();
            }
        }

        // Remove suit pips, if any
        for (const suit of suitsRemoved) {
            // Hide the suit pips
            this.suitPipsMap.get(suit)!.hide();
            this.suitPipsXMap.get(suit)!.hide();

            // Remove any card possibilities for this suit
            if (possibilitiesCheck()) {
                for (const rank of globals.variant.ranks) {
                    this.removePossibility(suit, rank, true);
                }
            }

            if (suit.clueRanks !== 'normal') {
                // Mark to retroactively apply rank clues when we return from this function
                this.reapplyRankClues = true;
            }
        }
        if (this.possibleSuits.length === 1) {
            [this.suit] = this.possibleSuits;

            // Don't record the suit or hide the pips if the card is unclued
            if (this.holder === null || this.isClued()) {
                globals.learnedCards[this.order].suit = this.suit;
                this.suitPipsMap.get(this.suit)!.hide();
                this.suitPips!.hide();
            }
        }

        // Handle if this is the first time that the card is fully revealed to the holder
        const isFullyKnown = this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
        if (isFullyKnown && !wasFullyKnown) {
            this.updatePossibilitiesOnOtherCards(this.suit!, this.rank!);
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
            this.applyClue(new Clue(CLUE_TYPE.RANK, rank), true);
        }
        for (const rank of negativeRankClues) {
            this.applyClue(new Clue(CLUE_TYPE.RANK, rank), false);
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
            this.applyClue(new Clue(CLUE_TYPE.COLOR, color), true);
        }
        for (const color of negativeColorClues) {
            this.applyClue(new Clue(CLUE_TYPE.COLOR, color), false);
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
        if (
            globals.variant.name.startsWith('Throw It in a Hole')
            && !globals.replay
            && this.isPlayed
        ) {
            return;
        }

        // If the card was already fully-clued,
        // we already updated the possibilities for it on other cards
        if (this.possibleSuits.length > 1 || this.possibleRanks.length > 1) {
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
        if (
            this.holder === globals.playerUs
            && !globals.replay
            && !globals.spectating
        ) {
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
            || this.isPlayed
            || this.isDiscarded
            || this.needsToBePlayed()
        ) {
            return false;
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
            if (
                card.suit === this.suit
                && card.rank === this.rank
                && card.isPlayed
            ) {
                return false;
            }
        }

        // Determining if the card needs to be played in the "Up or Down" variants
        // is more complicated
        if (globals.variant.name.startsWith('Up or Down')) {
            return this.upOrDownNeedsToBePlayed();
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

    // upOrDownNeedsToBePlayed returns true if this card still needs to be played
    // in order to get the maximum score (taking into account the stack direction)
    // (before getting here, we already checked to see if the card has already been played)
    upOrDownNeedsToBePlayed() {
        // First, check to see if the stack is already finished
        const suit = suitToMsgSuit(this.suit!, globals.variant);
        if (globals.stackDirections[suit] === STACK_DIRECTION.FINISHED) {
            return false;
        }

        // Second, check to see if this card is dead
        // (meaning that all of a previous card in the suit have been discarded already)
        if (this.upOrDownIsDead()) {
            return false;
        }

        // All 2's, 3's, and 4's must be played
        if (this.rank === 2 || this.rank === 3 || this.rank === 4) {
            return true;
        }

        if (this.rank === 1) {
            // 1's do not need to be played if the stack is going up
            if (globals.stackDirections[suit] === STACK_DIRECTION.UP) {
                return false;
            }
        } else if (this.rank === 5) {
            // 5's do not need to be played if the stack is going down
            if (globals.stackDirections[suit] === STACK_DIRECTION.DOWN) {
                return false;
            }
        } else if (this.rank === START_CARD_RANK) {
            // START cards do not need to be played if there are any cards played on the stack
            const playStack = globals.elements.playStacks.get(this.suit!)!;
            const lastPlayedRank = playStack.getLastPlayedRank();
            if (lastPlayedRank !== STACK_BASE_RANK) {
                return false;
            }
        }

        return true;
    }

    // upOrDownIsDead returns true if it is no longer possible to play this card by
    // looking to see if all of the previous cards in the stack have been discarded
    // (taking into account the stack direction)
    upOrDownIsDead() {
        // Make a map that shows if all of some particular rank in this suit has been discarded
        const ranks = globals.variant.ranks.slice();
        const allDiscarded = new Map();
        for (const rank of ranks) {
            const num = getSpecificCardNum(this.suit!, rank);
            allDiscarded.set(rank, num.total === num.discarded);
        }

        // Start by handling the easy cases of up and down
        const suit = suitToMsgSuit(this.suit!, globals.variant);
        if (globals.stackDirections[suit] === STACK_DIRECTION.UP) {
            for (let rank = 2; rank < this.rank!; rank++) {
                if (allDiscarded.get(rank)) {
                    return true;
                }
            }
            return false;
        }
        if (globals.stackDirections[suit] === STACK_DIRECTION.DOWN) {
            for (let rank = 4; rank > this.rank!; rank--) {
                if (allDiscarded.get(rank)) {
                    return true;
                }
            }
            return false;
        }

        // If we got this far, the stack direction is undecided
        // (the previous function handles the case where the stack is finished)
        // Check to see if the entire suit is dead in the case where
        // all 3 of the start cards are discarded
        if (
            allDiscarded.get(1)
            && allDiscarded.get(5)
            && allDiscarded.get(START_CARD_RANK)
        ) {
            return true;
        }

        // If the "START" card is played on the stack,
        // then this card will be dead if all of the 2's and all of the 4's have been discarded
        // (this situation also applies to 3's when no cards have been played on the stack)
        const playStack = globals.elements.playStacks.get(this.suit!)!;
        const lastPlayedRank = playStack.getLastPlayedRank();
        if (lastPlayedRank === START_CARD_RANK || this.rank === 3) {
            if (allDiscarded.get(2) && allDiscarded.get(4)) {
                return true;
            }
        }

        return false;
    }

    isPotentiallyPlayable() {
        // Calculating this in an Up or Down variant is more complicated
        if (globals.variant.name.startsWith('Up or Down')) {
            return this.upOrDownIsPotentiallyPlayable();
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

    upOrDownIsPotentiallyPlayable() {
        let potentiallyPlayable = false;
        for (let i = 0; i < globals.variant.suits.length; i++) {
            const suit = globals.variant.suits[i];
            const playStack = globals.elements.playStacks.get(suit)!;
            const lastPlayedRank = playStack.getLastPlayedRank();

            if (globals.stackDirections[i] === STACK_DIRECTION.UNDECIDED) {
                if (lastPlayedRank === STACK_BASE_RANK) {
                    // The "START" card has not been played
                    for (const rank of [START_CARD_RANK, 1, 5]) {
                        const count = this.possibleCards.get(`${suit.name}${rank}`);
                        if (typeof count === 'undefined') {
                            throw new Error(`Failed to get an entry for ${suit.name}${rank} from the "possibleCards" map for card ${this.order}.`);
                        }
                        if (count > 0) {
                            potentiallyPlayable = true;
                            break;
                        }
                    }
                    if (potentiallyPlayable) {
                        break;
                    }
                } else if (lastPlayedRank === START_CARD_RANK) {
                    // The "START" card has been played
                    for (const rank of [2, 4]) {
                        const count = this.possibleCards.get(`${suit.name}${rank}`);
                        if (typeof count === 'undefined') {
                            throw new Error(`Failed to get an entry for ${suit.name}${rank} from the "possibleCards" map for card ${this.order}.`);
                        }
                        if (count > 0) {
                            potentiallyPlayable = true;
                            break;
                        }
                    }
                    if (potentiallyPlayable) {
                        break;
                    }
                }
            } else if (globals.stackDirections[i] === STACK_DIRECTION.UP) {
                const nextRankNeeded = lastPlayedRank + 1;
                const count = this.possibleCards.get(`${suit.name}${nextRankNeeded}`);
                if (typeof count === 'undefined') {
                    throw new Error(`Failed to get an entry for ${suit.name}${nextRankNeeded} from the "possibleCards" map for card ${this.order}.`);
                }
                if (count > 0) {
                    potentiallyPlayable = true;
                    break;
                }
            } else if (globals.stackDirections[i] === STACK_DIRECTION.DOWN) {
                const nextRankNeeded = lastPlayedRank - 1;
                const count = this.possibleCards.get(`${suit.name}${nextRankNeeded}`);
                if (typeof count === 'undefined') {
                    throw new Error(`Failed to get an entry for ${suit.name}${nextRankNeeded} from the "possibleCards" map for card ${this.order}.`);
                }
                if (count > 0) {
                    potentiallyPlayable = true;
                    break;
                }
            } else if (globals.stackDirections[i] === STACK_DIRECTION.FINISHED) {
                // Nothing can play on this stack because it is finished
                continue;
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
            // or if we saw someone draw aw copy of this card)
            cardsLeft = all ? 0 : cardsLeft - 1;
            this.possibleCards.set(mapIndex, cardsLeft);
            this.checkPipPossibilities(suit, rank);
        }

        // If we wrote a card identity note and all the possibilities for that note have been
        // eliminated, unmorph the card
        if (
            suit === this.noteSuit
            && rank === this.noteRank
            && cardsLeft === 0
        ) {
            this.noteSuit = null;
            this.noteRank = null;
            this.setBareImage();
            globals.layers.get('card')!.batchDraw();
        }
    }
}

/*
    Misc. functions
*/

const filterInPlace = (values: Array<any>, predicate: (value: any) => boolean) => {
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

// getSpecificCardNum returns the total cards in the deck of the specified suit and rank
// as well as how many of those that have been already discarded
// (this DOES NOT mirror the server function in "game.go",
// because the client does not have the full deck)
const getSpecificCardNum = (suit: Suit, rank: number) => {
    // First, find out how many of this card should be in the deck, based on the rules of the game
    let total = 0;
    if (rank === 1) {
        total = 3;
        if (globals.variant.name.startsWith('Up or Down')) {
            total = 1;
        }
    } else if (rank === 5) {
        total = 1;
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
