const constants = require('../constants');
const HanabiCard = require('./HanabiCard');

// Constants
const {
    CARD_H,
    CARD_W,
    PHASER_DEMO_SCALE,
    PLAY_AREA_PADDING,
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
        this.zone = new Phaser.GameObjects.Zone(
            scene,
            config.x,
            config.y,
            CARD_W * PHASER_DEMO_SCALE * PLAY_AREA_PADDING * config.suits.length,
            CARD_H,
        );
        this.zone.zoneContainer = this;
        this.zone.setRectangleDropZone(
            CARD_W * PHASER_DEMO_SCALE * PLAY_AREA_PADDING * config.suits.length,
            CARD_H,
        );
        const cardsToAdd = this.suits.map(suit => new HanabiCard(scene, {
            suit,
            rank: 0,
        }));
        this.addCards(cardsToAdd);
    }

    addCards(cards) {
        // Cards are rendered in the order of the container, so cards at the end of the container
        // will be the front of the scene
        if (!Array.isArray(cards)) { cards = [cards]; }
        this.add(cards);
        cards.forEach((card) => {
            card.x -= this.x;
            card.y -= this.y;
            const sinRot = Math.sin(this.rotation);
            const cosRot = Math.cos(this.rotation);
            const { x, y } = card;
            card.x = (x * cosRot) + (y * sinRot);
            card.y = (y * cosRot) - (x * sinRot);
        });
        this.addCardTweensToScene(cards);
    }

    addCardTweensToScene(cards) {
        if (!Array.isArray(cards)) { cards = [cards]; }
        const horizSpacing = CARD_W * PHASER_DEMO_SCALE * PLAY_AREA_PADDING;
        const nSuits = this.suits.length;

        for (const card of cards) {
            const suitIdx = this.suits.findIndex(suit => suit === card.suit);
            // eslint pls, this is way more readable than if I threw in a bunch of parens
            /* eslint-disable no-mixed-operators, space-infix-ops */
            const x = (suitIdx + 1/2 - nSuits/2) * horizSpacing;
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
