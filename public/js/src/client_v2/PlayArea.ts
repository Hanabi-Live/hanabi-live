// Imports
import Phaser from 'phaser';
import { CARD_H, CARD_W, PLAY_AREA_PADDING } from '../constants';
import HanabiCard from './HanabiCard';
import Suit from '../Suit';
import * as utils from './utils';

// Phaser devs warned against using too many levels of nested containers, so I didn't design
// containers for play stacks. This means we lose the ability to independently position them, but
// that's probably not something we will want to do.
export default class PlayArea extends Phaser.GameObjects.Container {
    suits: any;
    horizSpacing: number;
    zone: any;

    constructor(scene: any, config: any) {
        super(scene);
        this.x = config.x;
        this.y = config.y;
        this.suits = config.suits;
        this.scale = config.scale;
        this.horizSpacing = CARD_W * config.scale * PLAY_AREA_PADDING;

        this.zone = new Phaser.GameObjects.Zone(
            scene,
            config.x,
            config.y,
            this.horizSpacing * config.suits.length,
            CARD_H * config.scale,
        );
        this.zone.zoneContainer = this;
        this.zone.setRectangleDropZone(
            this.horizSpacing * config.suits.length,
            CARD_H * config.scale,
        );
        const cardsToAdd = this.suits.map((suit: Suit) => new HanabiCard(scene, {
            suit,
            rank: 0,
            scale: config.scale,
        }));
        this.addCards(cardsToAdd);
    }

    addCards(cards: any) {
        // Cards are rendered in the order of the container, so cards at the end of the container
        // will be the front of the scene
        cards = utils.makeArray(cards);
        this.add(cards);
        cards.forEach((card: any) => utils.transformToEnterContainer(card, this));
        this._addCardTweensToScene(cards);
    }

    _addCardTweensToScene(cards: any) {
        cards = utils.makeArray(cards);
        const nSuits = this.suits.length;

        for (const card of cards) {
            const suitIdx = this.suits.findIndex((suit: Suit) => suit === card.suit);
            const x = (suitIdx + (1 / 2) - (nSuits / 2)) * this.horizSpacing;
            this.scene.tweens.add({
                targets: card,
                x,
                y: 0,
                duration: 1000,
            });
        }
    }
}
