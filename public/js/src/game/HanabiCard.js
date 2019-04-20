/*
    The HanabiCard object, which represents a single card
    TODO this object has to be re-copied over due to lots of new changes in the Konva UI
*/

// Imports
const constants = require('../constants');
const globals = require('../globals');

// Constants
const {
    CARD_H,
    CARD_W,
    PHASER_DEMO_SCALE,
    SUITS,
} = constants;

class HanabiCard extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        // Initialize the Phaser container
        super(scene);

        this.x = config.x || 0;
        this.y = config.y || 0;
        this.setSize(CARD_W * PHASER_DEMO_SCALE, CARD_H * PHASER_DEMO_SCALE);

        // Card variables
        this.order = config.order;
        this.holder = config.holder;
        this.suit = config.suit || undefined;
        // Rank 0 is the stack base, and it's false-y, so the undefined check has to be more nuanced
        this.rank = typeof config.rank !== 'undefined' ? config.rank : undefined;
        // Possible suits and ranks (based on clues given) are tracked separately from
        // knowledge of the true suit and rank
        this.possibleSuits = config.suits;
        this.possibleRanks = config.ranks;
        this.tweening = false;
        this.imageName = undefined;
        this.showOnlyLearned = false;
        this.numPositiveClues = 0;
        this.turnDrawn = globals.state.turn;
        this.isDiscarded = false;
        this.turnDiscarded = null;
        this.isPlayed = false;
        this.turnPlayed = null;

        const image = this.getImage();
        this.add(image);
    }

    /*
        Some short helper methods
    */
    getImage() {
        this.setCardImageName();

        // const image = this.scene.add.image(CARD_W / 2, CARD_H / 2, this.imageName);
        const image = new Phaser.GameObjects.Image(
            this.scene,
            0,
            0,
            this.imageName,
        );
        image.setScale(PHASER_DEMO_SCALE);
        return image;
    }

    doRotations(inverted) {
        this.setRotation(inverted ? 180 : 0);
        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? CARD_W : 0);
        this.bare.setY(inverted ? CARD_H : 0);
    }

    suitKnown() {
        return this.suit !== undefined;
    }

    rankKnown() {
        return this.rank !== undefined;
    }

    identityKnown() {
        return this.suitKnown() && this.rankKnown();
    }

    isClued() {
        return this.numPositiveClues > 0;
    }

    isInPlayerHand() {
        // TODO BROKEN
        return globals.elements.playerHands.indexOf(this.parent.parent) !== -1;
    }

    hideClues() {
        this.cluedBorder.hide();
    }

    /*
        Major card methods
    */

    setCardImageName() {
        const learnedCard = globals.state.learnedCards[this.order];

        const rank = (!this.showOnlyLearned && this.rank);
        const empathyPastRankUncertain = this.showOnlyLearned && this.possibleRanks.length > 1;

        const suit = (!this.showOnlyLearned && this.suit);
        const empathyPastSuitUncertain = this.showOnlyLearned && this.possibleSuits.length > 1;

        let suitToShow = suit || learnedCard.suit || SUITS.Unknown;
        if (empathyPastSuitUncertain) {
            suitToShow = SUITS.Unknown;
        }

        // "Card-Unknown" is not created, so use "NoPip-Unknown"
        let prefix = 'Card';
        if (suitToShow === SUITS.Unknown) {
            prefix = 'NoPip';
        }

        let name = `${prefix}-${suitToShow.name}-`;
        if (rank === 0) {
            name += '0';
        } else if (empathyPastRankUncertain) {
            name += '6';
        } else {
            name += rank || learnedCard.rank || '6';
        }

        this.imageName = name;
    }
}

module.exports = HanabiCard;
