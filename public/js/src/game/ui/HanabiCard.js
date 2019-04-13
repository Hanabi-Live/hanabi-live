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
const ui = require('./ui');

// Constants
const sharedReplayArrowColor = '#ffdf00'; // Yellow

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

        // Most class variables are defined below in the "refresh()" function
        // Order is defined upon first initialization
        this.order = config.order;
        // The index of the player that holds this card (or null if played/discarded)
        this.holder = null;
        this.trueSuit = null;
        this.trueRank = null;

        // Initialize various elements/features of the card
        this.initImage();
        this.initBorder();
        this.initPips();
        this.initArrow();
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
                suitPip.setVisible(!globals.lobby.settings.realLifeMode);
            }
        }
        if (this.suitPipsXMap) {
            for (const [, suitPipX] of this.suitPipsXMap) {
                suitPipX.hide();
            }
        }
        if (this.rankPipsMap) {
            for (const [, rankPip] of this.rankPipsMap) {
                rankPip.setVisible(!globals.lobby.settings.realLifeMode);
            }
        }
        if (this.rankPipsXMap) {
            for (const [, rankPipX] of this.rankPipsXMap) {
                rankPipX.hide();
            }
        }

        // Hide the clue arrow
        if (this.arrow) {
            this.arrow.hide();
        }

        this.initPossibilities();
        this.setBareImage();
    }

    setBareImage() {
        const learnedCard = globals.learnedCards[this.order];

        // Find out the suit to display
        // (Gray is a colorless suit used for unclued cards)
        let suitToShow;
        if (this.empathy) {
            // If we are in Empathy mode, only show the suit if there is only one possibility left
            // and the card has one or more clues on it
            if (this.possibleSuits.length === 1 && this.isClued()) {
                [suitToShow] = this.possibleSuits;
            } else {
                suitToShow = constants.SUIT.GRAY;
            }
        } else {
            // If we are not in Empathy mode, then show the suit if it is known
            suitToShow = learnedCard.suit || constants.SUIT.GRAY;
        }

        // But don't show the full suit if the card is not yet revealed and it has no clues on it
        if (
            suitToShow !== constants.SUIT.GRAY
            && !learnedCard.revealed
            && !this.isClued()
            && (this.holder === globals.playerUs || this.empathy)
        ) {
            suitToShow = constants.SUIT.GRAY;
        }

        // For whatever reason, "Card-Gray" is never created, so use "NoPip-Gray"
        let prefix = 'Card';
        if (suitToShow === constants.SUIT.GRAY) {
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
            rankToShow = learnedCard.rank || 6;
        }

        // But don't show the full rank if the card is not yet revealed and it has no clues on it
        if (
            rankToShow !== 6
            && !learnedCard.revealed
            && !this.isClued()
            && (this.holder === globals.playerUs || this.empathy)
        ) {
            rankToShow = 6;
        }

        // Set the name
        // (but in Real-Life mode,
        // always show the vanilla card back if the card is not fully revealed)
        if (
            globals.lobby.settings.realLifeMode
            && (suitToShow === constants.SUIT.GRAY || rankToShow === 6)
        ) {
            this.bareName = 'deck-back';
        } else {
            this.bareName = `${prefix}-${suitToShow.name}-${rankToShow}`;
        }

        // Show or hide the pips
        this.suitPips.setVisible(suitToShow === constants.SUIT.GRAY);
        this.rankPips.setVisible(rankToShow === 6);

        // Fade the card if it fully revealed and already played
        let opacity = 1;
        if (
            !globals.lobby.settings.realLifeMode
            && suitToShow !== constants.SUIT.GRAY
            && rankToShow !== 6
            // (we can't use trueSuit/trueRank because
            // we don't want to fade the cards in Empathy-mode)
            && this.numPositiveClues === 0
            && !this.isPlayed
            && !this.isDiscarded
            && this.isAlreadyPlayed()
        ) {
            opacity = constants.CARD_FADE;
        }
        this.setOpacity(opacity);
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

    initArrow() {
        return HanabiCardInit.arrow.call(this);
    }

    initArrowLocation() {
        return HanabiCardInit.arrowLocation.call(this);
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

    setArrow(visible, giver, clue) {
        this.arrow.setVisible(visible);
        if (visible) {
            if (clue === null) {
                // This is a shared replay arrow, so don't draw the circle
                this.arrow.circle.hide();
                this.arrow.text.hide();
                const color = sharedReplayArrowColor;
                this.arrow.base.setStroke(color);
                this.arrow.base.setFill(color);
            } else {
                // Change the color of the arrow
                let color;
                if (this.numPositiveClues >= 2) {
                    // "Non-freshly touched" cards use a different color
                    color = '#737373'; // Dark gray
                } else {
                    // "Freshly touched" cards use the default arrow color
                    color = 'white'; // The default color
                }
                this.arrow.base.setStroke(color);
                this.arrow.base.setFill(color);

                // Clue arrows are white with a circle that shows the type of clue given
                if (globals.variant.name.startsWith('Duck')) {
                    // Don't show the circle in Duck variants,
                    // since the clue types are supposed to be hidden
                    this.arrow.circle.hide();
                } else {
                    this.arrow.circle.show();
                    if (clue.type === constants.CLUE_TYPE.RANK) {
                        this.arrow.circle.setFill('black');
                        this.arrow.text.setText(clue.value.toString());
                        this.arrow.text.show();
                    } else if (clue.type === constants.CLUE_TYPE.COLOR) {
                        this.arrow.circle.setFill(clue.value.hexCode);
                        this.arrow.text.hide();
                    }
                }

                if (this.arrowTween) {
                    this.arrowTween.destroy();
                }
                if (globals.animateFast) {
                    // Just set the arrow in position
                    this.arrow.setX(constants.CARD_W / 2);
                    this.arrow.setY(this.arrow.originalY);
                } else if (giver !== null) {
                    this.animateArrow(giver, globals.turn);
                }
            }

            if (this.isDiscarded) {
                // The cards in the discard pile are packed together tightly
                // So, if the arrows are hovering over a card,
                // it will not be clear which card the arrow is pointing to
                // Thus, move the arrow to be flush with the card
                this.arrow.setY(0.02 * globals.stage.getHeight());
            } else {
                // Fix the bug where the arrows can be hidden by other cards
                // (but ignore the discard pile because it has to be in a certain order)
                const hand = this.getParent().getParent();
                if (hand) {
                    hand.moveToTop();
                }
            }
        }

        if (!globals.animateFast) {
            globals.layers.card.batchDraw();
        }
    }

    // Animate the arrow to fly from the player who gave the clue to the card
    animateArrow(giver, turn) {
        // Don't bother doing the animation if it is delayed by more than one turn
        if (globals.turn > turn + 1) {
            return;
        }

        // Don't bother doing the animation if we are no longer part of a hand
        // (which can happen rarely when jumping quickly through a replay)
        if (!this.parent.parent) {
            return;
        }

        // Delay the animation if the card is currently tweening to avoid buggy behavior
        if (this.tweening) {
            this.arrow.setVisible(false);
            setTimeout(() => {
                this.animateArrow(giver, turn);
            }, 10);
            return;
        }
        this.arrow.setVisible(true);

        // Start the arrow at the center position of the clue giver's hand
        const centerPos = globals.elements.playerHands[giver].getAbsoluteCenterPos();
        this.arrow.setAbsolutePosition(centerPos);

        this.arrowTween = new graphics.Tween({
            node: this.arrow,
            duration: 0.5,
            x: constants.CARD_W / 2,
            y: this.arrow.originalY,
            easing: graphics.Easings.EaseOut,
        }).play();
    }

    // This card was touched by a positive or negative clue,
    // so remove pips and possibilities from the card
    applyClue(clue, positive) {
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
                globals.learnedCards[this.order].rank = this.trueRank;

                // Don't hide the pips if the card is unclued
                if (this.holder === null || this.isClued()) {
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
                globals.learnedCards[this.order].suit = this.trueSuit;

                // Don't hide the pips if the card is unclued
                if (this.holder === null || this.isClued()) {
                    this.suitPipsMap.get(this.trueSuit).hide();
                    this.suitPips.hide();
                }
            }
        } else {
            console.error('Clue type invalid.');
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

    // Toggle the yellow arrow that the leader uses in shared replays
    toggleSharedReplayArrow() {
        const visible = !(
            this.arrow.visible()
            && this.arrow.base.getFill() === sharedReplayArrowColor
        );
        // (if the arrow is showing but is a different kind of arrow,
        // then just overwrite the existing arrow)
        ui.hideAllArrows();
        this.setArrow(visible, null, null);
    }

    reveal(suit, rank) {
        // Local variables
        suit = convert.msgSuitToSuit(suit, globals.variant);

        // Update the possibilities for the player who played/discarded this card
        // (but we don't need to do anything if the card was already fully-clued)
        if (this.possibleSuits.length > 1 || this.possibleRanks.length > 1) {
            const hand = globals.elements.playerHands[this.holder];
            for (const layoutChild of hand.children) {
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
        learnedCard.revealed = true;
        learnedCard.suit = suit;
        learnedCard.rank = rank;

        // Redraw the card
        this.setBareImage();

        ui.hideAllArrows();

        // Unflip the arrow, if it is flipped
        this.initArrowLocation();
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
            !this.trueSuit || !this.trueSuit
            || this.isPlayed
            || this.isDiscarded
            || !needsToBePlayed(this.trueSuit, this.trueRank)
        ) {
            return false;
        }

        const num = getSpecificCardNum(this.trueSuit, this.trueRank);
        return num.total === num.discarded + 1;
    }

    isAlreadyPlayed() {
        // Don't bother calculating this for Up or Down variants,
        // since all cards do not need to be played
        if (globals.variant.name.startsWith('Up or Down')) {
            return false;
        }

        if (!this.trueSuit || !this.trueRank) {
            return false;
        }
        const key = `${this.trueSuit.name}${this.trueRank}`;
        return globals.playedCardsMap[key];
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

// needsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
// (this mirrors the server function in "card.go")
const needsToBePlayed = (suit, rank) => {
    // First, check to see if a copy of this card has already been played
    for (const card of globals.deck) {
        if (card.trueSuit === suit && card.trueRank === rank && card.isPlayed) {
            return false;
        }
    }

    // Determining if the card needs to be played in the "Up or Down" variants is more complicated
    if (globals.variant.name.startsWith('Up or Down')) {
        return false;
    }

    // Second, check to see if it is still possible to play this card
    // (the preceding cards in the suit might have already been discarded)
    for (let i = 1; i < rank; i++) {
        const num = getSpecificCardNum(suit, i);
        if (num.total === num.discarded) {
            // The suit is "dead", so this card does not need to be played anymore
            return false;
        }
    }

    // By default, all cards not yet played will need to be played
    return true;
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
    } else if (rank === 7) { // The "START" card
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
