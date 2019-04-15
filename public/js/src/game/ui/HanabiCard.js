/*
    The HanabiCard object represents a single card
    It has a LayoutChild parent
*/

// Imports
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const graphics = require('./graphics');
const HanabiCardInit = require('./HanabiCardInit');
const notes = require('./notes');

class HanabiCard extends graphics.Group {
    constructor(config) {
        // Cards should start off with a constant width and height
        config.width = constants.CARD_W;
        config.height = constants.CARD_H;
        config.x = constants.CARD_W / 2;
        config.y = constants.CARD_H / 2;
        config.offset = {
            x: constants.CARD_W / 2,
            y: constants.CARD_H / 2,
        };
        super(config);

        this.type = 'HanabiCard';

        // Most class variables are defined below in the "refresh()" function
        // Order is defined upon first initialization
        this.order = config.order;
        // The index of the player that holds this card (or null if played/discarded)
        this.holder = null;
        this.trueSuit = null;
        this.trueRank = null;
        // The name of the card image corresponding to the player-wrriten note on the card
        this.noteSuit = null;
        this.noteRank = null;

        // Initialize various elements/features of the card
        this.initImage();
        this.initBorder();
        this.initPips();
        this.initNote();
        this.initEmpathy();
        this.initClick();
    }

    isClued() {
        return this.numPositiveClues > 0;
    }

    hideClues() {
        this.cluedBorder.hide();
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
        this.hasPositiveColorClue = false;
        this.hasPositiveRankClue = false;
        // We have to add one to the turn drawn because
        // the "draw" command comes before the "turn" command
        // However, if it was part of the initial deal, then it will correctly be set as turn 0
        this.turnDrawn = globals.turn === 0 ? 0 : globals.turn + 1;
        this.isDiscarded = false;
        this.turnDiscarded = null;
        this.isPlayed = false;
        this.turnPlayed = null;
        this.isMisplayed = false;

        this.setListening(true);
        this.hideClues();

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
            }
        }
        if (this.rankPipsXMap) {
            for (const [, rankPipX] of this.rankPipsXMap) {
                rankPipX.hide();
            }
        }

        this.initPossibilities();
        this.setBareImage();
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
                suitToShow = constants.SUIT.UNKNOWN;
            }
        } else {
            // If we are not in Empathy mode, then show the suit if it is known
            suitToShow = learnedCard.suit || this.noteSuit || constants.SUIT.UNKNOWN;
        }

        // For whatever reason, "Card-Unknown" is never created, so use "NoPip-Gray"
        let prefix = 'Card';
        if (suitToShow === constants.SUIT.UNKNOWN) {
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
            rankToShow = learnedCard.rank || this.noteRank || 6;
        }

        // Set the name
        // (but in Real-Life mode or Duck variants,
        // always show the vanilla card back if the card is not fully revealed)
        if (
            (globals.lobby.settings.realLifeMode || globals.variant.name.startsWith('Duck'))
            && (suitToShow === constants.SUIT.UNKNOWN || rankToShow === 6)
        ) {
            this.bareName = 'deck-back';
        } else {
            this.bareName = `${prefix}-${suitToShow.name}-${rankToShow}`;
        }

        // Show or hide the pips
        if (globals.lobby.settings.realLifeMode) {
            this.suitPips.hide();
            this.rankPips.hide();
        } else {
            this.suitPips.setVisible(suitToShow === constants.SUIT.UNKNOWN);
            this.rankPips.setVisible(rankToShow === 6);
        }

        this.setFade();
    }

    // Fade this card if it is useless, fully revealed, and still in a player's hand
    setFade() {
        const oldOpacity = this.getOpacity();

        let newOpacity = 1;
        if (
            !globals.lobby.settings.realLifeMode
            && !this.suitPips.getVisible()
            && !this.rankPips.getVisible()
            && this.numPositiveClues === 0
            && !this.isPlayed
            && !this.isDiscarded
            && !this.needsToBePlayed()
        ) {
            newOpacity = constants.CARD_FADE;
        }

        if (oldOpacity !== newOpacity) {
            if (this.opacityTween) {
                this.opacityTween.destroy();
            }
            if (globals.animateFast || !this.getLayer()) {
                this.setOpacity(newOpacity);
            } else {
                this.opacityTween = new graphics.Tween({
                    node: this,
                    opacity: newOpacity,
                    duration: 0.5,
                }).play();
            }
        }
    }

    initImage() {
        return HanabiCardInit.image.call(this);
    }

    initBorder() {
        return HanabiCardInit.border.call(this);
    }

    initPips() {
        return HanabiCardInit.pips.call(this);
    }

    initNote() {
        return HanabiCardInit.note.call(this);
    }

    initEmpathy() {
        return HanabiCardInit.empathy.call(this);
    }

    initClick() {
        return HanabiCardInit.click.call(this);
    }

    initPossibilities() {
        return HanabiCardInit.possibilities.call(this);
    }

    // This card was touched by a positive or negative clue,
    // so remove pips and possibilities from the card
    applyClue(clue, positive) {
        const wasFullyKnown = this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
        if (wasFullyKnown) {
            return;
        }

        if (clue.type === constants.CLUE_TYPE.RANK) {
            const clueRank = clue.value;
            let removed;
            if (globals.variant.name.startsWith('Multi-Fives')) {
                removed = filterInPlace(
                    this.possibleRanks,
                    rank => (rank === clueRank || rank === 5) === positive,
                );
            } else {
                removed = filterInPlace(
                    this.possibleRanks,
                    rank => (rank === clueRank) === positive,
                );
            }
            removed.forEach((rank) => {
                // Hide the rank pips
                this.rankPipsMap.get(rank).hide();
                this.rankPipsXMap.get(rank).hide();

                // Remove any card possibilities for this rank
                for (const suit of globals.variant.suits) {
                    this.removePossibility(suit, rank, true);
                }
            });

            if (this.possibleRanks.length === 1) {
                [this.trueRank] = this.possibleRanks;

                // Don't record the rank or hide the pips if the card is unclued
                if (this.holder === null || this.isClued()) {
                    globals.learnedCards[this.order].rank = this.trueRank;
                    this.rankPipsMap.get(this.trueRank).hide();
                    this.rankPips.hide();
                }
            }
        } else if (clue.type === constants.CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            const removed = filterInPlace(
                this.possibleSuits,
                suit => suit.clueColors.includes(clueColor) === positive,
            );
            removed.forEach((suit) => {
                // Hide the suit pips
                this.suitPipsMap.get(suit).hide();
                this.suitPipsXMap.get(suit).hide();

                // Remove any card possibilities for this suit
                for (const rank of globals.variant.ranks) {
                    this.removePossibility(suit, rank, true);
                }
            });

            if (this.possibleSuits.length === 1) {
                [this.trueSuit] = this.possibleSuits;

                // Don't record the suitt or hide the pips if the card is unclued
                if (this.holder === null || this.isClued()) {
                    globals.learnedCards[this.order].suit = this.trueSuit;
                    this.suitPipsMap.get(this.trueSuit).hide();
                    this.suitPips.hide();
                }
            }
        } else {
            console.error('Clue type invalid.');
        }

        const isFullyKnown = this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
        if (isFullyKnown && !wasFullyKnown) {
            // Now that this card is fully revealed to the holder,
            // remove the possibilities from the rest of the cards in their hand
            const playerHand = globals.elements.playerHands[this.holder].children;
            for (const layoutChild of playerHand) {
                const card = layoutChild.children[0];
                if (card.order === this.order) {
                    // There is no need to update the card that was just revealed
                    continue;
                }
                card.removePossibility(this.trueSuit, this.trueRank, false);
            }
        }
    }

    // Check to see if we can put an X over this suit pip or this rank pip
    checkPipPossibilities(suit, rank) {
        // First, check to see if there are any possibilities remaining for this suit
        let suitPossible = false;
        for (const rank2 of globals.variant.ranks) {
            const count = this.possibleCards.get(`${suit.name}${rank2}`);
            if (count > 0) {
                suitPossible = true;
                break;
            }
        }
        if (!suitPossible) {
            // Do nothing if the normal pip is already hidden
            const pip = this.suitPipsMap.get(suit);
            if (pip.getVisible()) {
                // All the cards of this suit are seen, so put an X over the suit pip
                const x = this.suitPipsXMap.get(suit);
                x.setVisible(true);
            }
        }

        // Second, check to see if there are any possibilities remaining for this rank
        let rankPossible = false;
        for (const suit2 of globals.variant.suits) {
            const count = this.possibleCards.get(`${suit2.name}${rank}`);
            if (count > 0) {
                rankPossible = true;
                break;
            }
        }
        if (!rankPossible) {
            // There is no rank pip for "START" cards
            if (rank >= 1 && rank <= 5) {
                // Do nothing if the normal pip is already hidden
                const pip = this.rankPipsMap.get(rank);
                if (pip.getVisible()) {
                    // All the cards of this rank are seen, so put an X over the rank pip
                    const x = this.rankPipsXMap.get(rank);
                    x.setVisible(true);
                }
            }
        }
    }

    reveal(suit, rank) {
        // Local variables
        suit = convert.msgSuitToSuit(suit, globals.variant);

        // Update the possibilities for the player who played/discarded this card
        // (but we don't need to do anything if the card was already fully-clued)
        if (this.possibleSuits.length > 1 || this.possibleRanks.length > 1) {
            const playerHand = globals.elements.playerHands[this.holder].children;
            for (const layoutChild of playerHand) {
                const card = layoutChild.children[0];
                if (card.order === this.order) {
                    // There is no need to update the card that is being revealed
                    continue;
                }
                card.removePossibility(suit, rank, false);
            }
        }

        // Set the true suit/rank on the card
        this.trueSuit = suit;
        this.trueRank = rank;

        // Keep track of what this card is
        const learnedCard = globals.learnedCards[this.order];
        learnedCard.suit = suit;
        learnedCard.rank = rank;
        learnedCard.revealed = true;

        // Redraw the card
        if (this.noteSuit) {
            this.noteSuit = null;
            this.noteRank = null;
        }
        this.setBareImage();
    }

    removeFromParent() {
        // Remove the card from the player's hand in preparation of adding it to either
        // the play stacks or the discard pile
        const layoutChild = this.parent;
        if (!layoutChild.parent) {
            // If a tween is destroyed in the middle of animation,
            // it can cause a card to be orphaned
            return;
        }
        const pos = layoutChild.getAbsolutePosition();
        layoutChild.setRotation(layoutChild.parent.getRotation());
        layoutChild.remove();
        layoutChild.setAbsolutePosition(pos);

        // Mark that no player is now holding this card
        this.holder = null;
    }

    animateToPlayStacks() {
        // We add a LayoutChild to a CardStack
        const playStack = globals.elements.playStacks.get(this.trueSuit);
        playStack.add(this.parent);

        // We also want to move this stack to the top so that
        // cards do not tween behind the other play stacks when travelling to this stack
        playStack.moveToTop();
    }

    animateToDiscardPile() {
        // We add a LayoutChild to a CardLayout
        const discardStack = globals.elements.discardStacks.get(this.trueSuit);
        discardStack.add(this.parent);

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

    setNote(note) {
        notes.set(this.order, note);
        notes.update(this);
        notes.show(this);
    }

    getSlotNum() {
        const numCardsInHand = this.parent.parent.children.length;
        for (let i = 0; i < numCardsInHand; i++) {
            const layoutChild = this.parent.parent.children[i];
            if (layoutChild.children[0].order === this.order) {
                return numCardsInHand - i;
            }
        }

        return -1;
    }

    isRevealedToHolder() {
        return this.possibleSuits.length === 1 && this.possibleRanks.length === 1;
    }

    isCritical() {
        if (
            this.trueSuit === null
            || this.trueRank === null
            || this.isPlayed
            || this.isDiscarded
            || this.needsToBePlayed()
        ) {
            return false;
        }

        const num = getSpecificCardNum(this.trueSuit, this.trueRank);
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
                card.trueSuit === this.trueSuit
                && card.trueRank === this.trueRank
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
        for (let i = 1; i < this.trueRank; i++) {
            const num = getSpecificCardNum(this.trueSuit, i);
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
        const suit = convert.suitToMsgSuit(this.trueSuit, globals.variant);
        if (globals.stackDirections[suit] === constants.STACK_DIRECTION.FINISHED) {
            return false;
        }

        // Second, check to see if this card is dead
        // (meaning that all of a previous card in the suit have been discarded already)
        if (this.upOrDownIsDead()) {
            return false;
        }

        // All 2's, 3's, and 4's must be played
        if (this.trueRank === 2 || this.trueRank === 3 || this.trueRank === 4) {
            return true;
        }

        if (this.trueRank === 1) {
            // 1's do not need to be played if the stack is going up
            if (globals.stackDirections[suit] === constants.STACK_DIRECTION.UP) {
                return false;
            }
        } else if (this.trueRank === 5) {
            // 5's do not need to be played if the stack is going down
            if (globals.stackDirections[suit] === constants.STACK_DIRECTION.DOWN) {
                return false;
            }
        } else if (this.trueRank === constants.START_CARD_RANK) {
            // START cards do not need to be played if there are any cards played on the stack
            const playStack = globals.elements.playStacks.get(this.trueSuit);
            const lastPlayedCard = playStack.getLastPlayedCard();
            if (lastPlayedCard !== -1) {
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
        const ranks = [1, 2, 3, 4, 5, constants.START_CARD_RANK];
        const allDiscarded = new Map();
        for (const rank of ranks) {
            const num = getSpecificCardNum(this.trueSuit, rank);
            allDiscarded.set(rank, num.total === num.discarded);
        }

        // Start by handling the easy cases of up and down
        const suit = convert.suitToMsgSuit(this.trueSuit, globals.variant);
        if (globals.stackDirections[suit] === constants.STACK_DIRECTION.UP) {
            for (let rank = 2; rank < this.trueRank; rank++) {
                if (allDiscarded.get(rank)) {
                    return true;
                }
            }
            return false;
        }
        if (globals.stackDirections[suit] === constants.STACK_DIRECTION.DOWN) {
            for (let rank = 4; rank > this.trueRank; rank--) {
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
            && allDiscarded.get(constants.START_CARD_RANK)
        ) {
            return true;
        }

        // If the "START" card is played on the stack,
        // then this card will be dead if all of the 2's and all of the 4's have been discarded
        // (this situation also applies to 3's when no cards have been played on the stack)
        const lastPlayedCard = globals.elements.playStacks.get(this.trueSuit).getLastPlayedCard();
        if (lastPlayedCard === constants.START_CARD_RANK || this.trueRank === 3) {
            if (allDiscarded.get(2) && allDiscarded.get(4)) {
                return true;
            }
        }

        return false;
    }

    isPotentiallyPlayable() {
        // Don't bother calculating this for Up or Down variants
        if (globals.variant.name.startsWith('Up or Down')) {
            return true;
        }

        let potentiallyPlayable = false;
        for (const suit of globals.variant.suits) {
            const numCardsPlayed = globals.elements.playStacks.get(suit).children.length;
            const nextRankNeeded = numCardsPlayed + 1;
            const count = this.possibleCards.get(`${suit.name}${nextRankNeeded}`);
            if (count > 0) {
                potentiallyPlayable = true;
                break;
            }
        }

        return potentiallyPlayable;
    }

    removePossibility(suit, rank, all) {
        if (globals.lobby.settings.realLifeMode) {
            return;
        }

        // Every card has a possibility map that maps card identities to count
        // Remove one possibility for this card
        const mapIndex = `${suit.name}${rank}`;
        const cardsLeft = this.possibleCards.get(mapIndex);
        if (cardsLeft === 0) {
            return;
        }
        const newValue = all ? 0 : cardsLeft - 1;
        this.possibleCards.set(mapIndex, newValue);
        this.checkPipPossibilities(suit, rank);

        // If there is a specific identity note on the card, check to see if it is now invalid
        if (this.noteSuit === suit && this.noteRank === rank) {
            this.noteSuit = null;
            this.noteRank = null;
            this.setBareImage();
            globals.layers.card.batchDraw();
        }
    }
}

module.exports = HanabiCard;

/*
    Misc. functions
*/

const filterInPlace = (values, predicate) => {
    const removed = [];
    let i = values.length - 1;
    while (i >= 0) {
        if (!predicate(values[i], i)) {
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
const getSpecificCardNum = (suit, rank) => {
    // First, find out how many of this card should be in the deck, based on the rules of the game
    let total = 0;
    if (rank === 1) {
        total = 3;
        if (globals.variant.name.startsWith('Up or Down')) {
            total = 1;
        }
    } else if (rank === 5) {
        total = 1;
    } else if (rank === constants.START_CARD_RANK) {
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
        if (card.trueSuit === suit && card.trueRank === rank && card.isDiscarded) {
            discarded += 1;
        }
    }

    return { total, discarded };
};
