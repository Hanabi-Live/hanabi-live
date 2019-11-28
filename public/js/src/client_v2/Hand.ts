// Imports
import Phaser from 'phaser';
import { CARD_W, HAND_PADDING } from '../constants';
import { makeArray, transformToExitContainer } from './utils';

export default class Hand extends Phaser.GameObjects.Container {
    constructor(scene: any, config: any) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.rotation = config.rot;
        this.scale = config.scale;
    }

    mutate(cardsIn: any, cardsOut: any) {
        if (cardsOut != null) {
            this.remove(cardsOut);
            cardsOut = makeArray(cardsOut);
            cardsOut.forEach((card: any) => transformToExitContainer(card, this));
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
            const x = (i + 0.5 - (handSize / 2)) * horizSpacing;
            this.scene.tweens.add({
                targets: cards[i],
                props: {
                    x: { value: x, duration: 1000 },
                },
            });
        }
    }
}
