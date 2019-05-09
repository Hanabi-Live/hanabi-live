const constants = require('../constants');
const utils = require('./utils');

// Constants
const {
    CARD_W,
    HAND_PADDING,
} = constants;

class Hand extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.rotation = config.rot;
        this.scale = config.scale;
    }

    mutate(cardsIn, cardsOut) {
        if (cardsOut != null) {
            this.remove(cardsOut);
            cardsOut = utils.makeArray(cardsOut);
            cardsOut.forEach(card => utils.transformToExitContainer(card, this));
        }
        if (cardsIn != null) {
            // Adds any number of cards at the front of the container, i.e. the left side of the
            // hand
            this.addAt(cardsIn, 0);
            this.addCardTweensToScene();
        }
    }

    addCardTweensToScene() {
        const cards = this.list;
        const handSize = cards.length;
        const horizSpacing = CARD_W * this.scale * HAND_PADDING;


        for (let i = 0; i < handSize; i++) {
            /* eslint-disable space-infix-ops */
            const x = (i + 1/2 - handSize/2) * horizSpacing;
            this.scene.tweens.add({
                targets: cards[i],
                props: {
                    x: { value: x, duration: 1000 },
                },
            });
        }
    }
}

module.exports = Hand;
