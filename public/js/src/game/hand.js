const constants = require('../constants');

// Constants
const {
    CARDW,
    PHASER_DEMO_SCALE,
} = constants;

class Hand extends Phaser.GameObjects.Container {
    constructor(scene, config) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.rotation = config.rot;
    }

    draw(card) {
        this.add(card);
        const cards = this.list;
        const handSize = cards.length;
        const padding = 1.05;
        const horizSpacing = CARDW * PHASER_DEMO_SCALE * padding;
        for (let i = 0; i < handSize; i++) {
            // eslint pls, this is way more readable than if I threw in a bunch of parens
            /* eslint-disable no-mixed-operators, space-infix-ops */
            const x = (i + 1/2 - handSize/2) * horizSpacing;
            cards[i].setPosition(x, 0);
        }
    }
}

module.exports = Hand;
