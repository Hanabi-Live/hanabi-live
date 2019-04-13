const constants = require('../constants');

// Constants
const {
    CARD_W,
    PHASER_DEMO_SCALE,
} = constants;

class Hand extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.rotation = config.rot;
    }

    mutate(cardsIn, cardsOut) {
        if (cardsOut != null) {
            this.remove(cardsOut);
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
        const padding = 1.05;
        const horizSpacing = CARD_W * PHASER_DEMO_SCALE * padding;

        for (let i = 0; i < handSize; i++) {
            // eslint pls, this is way more readable than if I threw in a bunch of parens
            /* eslint-disable no-mixed-operators, space-infix-ops */
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
