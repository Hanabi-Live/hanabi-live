const constants = require('../constants');
const HanabiCard = require('./HanabiCard');

// Constants
const {
    CARD_W,
    PHASER_DEMO_SCALE,
} = constants;

// Phaser devs warned against using too many levels of nested containers, so I didn't design
// containers for play stacks. This means we lose the ability to independently position them, but
// that's probably not something we will want to do.
class PlayArea extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.suits = config.suits;
        const cardsToAdd = this.suits.map(suit => new HanabiCard(scene, {
            suit,
            rank: 0,
        }));
        this.addToPlayStacks(cardsToAdd);
    }

    addToPlayStacks(cards) {
        // Cards are rendered in the order of the container, so cards at the end of the container
        // will be the front of the scene
        console.log(cards);
        this.add(cards);
        this.addCardTweensToScene(cards);
    }

    addCardTweensToScene(cards) {
        if (!Array.isArray(cards)) { cards = [cards]; }
        const padding = 1.15;
        const horizSpacing = CARD_W * PHASER_DEMO_SCALE * padding;
        const nSuits = this.suits.length;

        for (const card of cards) {
            const suitIdx = this.suits.findIndex(suit => suit === card.suit);
            // eslint pls, this is way more readable than if I threw in a bunch of parens
            /* eslint-disable no-mixed-operators, space-infix-ops */
            const x = (suitIdx + 1/2 - nSuits/2) * horizSpacing;
            console.log(x);
            this.scene.tweens.add({
                targets: card,
                x,
                y: 0,
                duration: 1000,
            });
        }
    }
}

module.exports = PlayArea;
