/*
    The HanabiCard object, which represents a single card
*/

// Imports
const globals = require('../globals');
const constants = require('../constants');

// Constants
const {
    CARDH,
    CARDW,
    PHASER_DEMO_SCALE,
    SUIT,
} = constants;

class HanabiCard extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        // Initialize the Phaser container
        super(scene);

        this.x = config.x || 0;
        this.y = config.y || 0;

        // Card variables
        this.order = config.order;
        this.holder = config.holder;
        this.trueSuit = config.suit || undefined;
        this.trueRank = config.rank || undefined;
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

        /*
        // Create the "bare" card image, which is a gray card with all the pips
        this.bare.setSceneFunc(function setSceneFunc(context) {
            cardDraw.scaleCardImage(
                context,
                self.barename,
                this.getWidth(),
                this.getHeight(),
                this.getAbsoluteTransform(),
            );
        });
        this.add(this.bare);
        */
    }

    /*
        Some short helper methods
    */
    getImage() {
        this.setCardImageName();

        // const image = this.scene.add.image(CARDW / 2, CARDH / 2, this.imageName);
        const image = new Phaser.GameObjects.Image(
            this.scene,
            0,
            0,
            this.imageName,
        );
        image.setScale(PHASER_DEMO_SCALE);
        image.setInteractive();
        this.scene.input.setDraggable(image);
        return image;
    }

    doRotations(inverted) {
        this.setRotation(inverted ? 180 : 0);
        this.bare.setRotation(inverted ? 180 : 0);
        this.bare.setX(inverted ? CARDW : 0);
        this.bare.setY(inverted ? CARDH : 0);
    }

    suitKnown() {
        return this.trueSuit !== undefined;
    }

    rankKnown() {
        return this.trueRank !== undefined;
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
        let prefix = 'Card';

        const learnedCard = globals.state.learnedCards[this.order];

        const rank = (!this.showOnlyLearned && this.trueRank);
        const empathyPastRankUncertain = this.showOnlyLearned && this.possibleRanks.length > 1;

        const suit = (!this.showOnlyLearned && this.trueSuit);
        const empathyPastSuitUncertain = this.showOnlyLearned && this.possibleSuits.length > 1;

        let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
        if (empathyPastSuitUncertain) {
            suitToShow = SUIT.GRAY;
        }

        // "Card-Gray" is not created, so use "NoPip-Gray"
        if (suitToShow === SUIT.GRAY) {
            prefix = 'NoPip';
        }

        let name = `${prefix}-${suitToShow.name}-`;
        if (empathyPastRankUncertain) {
            name += '6';
        } else {
            name += rank || learnedCard.rank || '6';
        }

        this.imageName = name;
    }
}

module.exports = HanabiCard;
