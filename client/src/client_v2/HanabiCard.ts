/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// TODO: fix typing issues in client_v2

// The HanabiCard object, which represents a single card
// TODO this object has to be re-copied over due to lots of new changes in the Konva UI

// Imports
import Phaser from 'phaser';
import { CARD_H, CARD_W } from '../constants';
import { SUITS } from '../game/data/gameData';
import Suit from '../game/types/Suit';

export default class HanabiCard extends Phaser.GameObjects.Container {
  order: number;
  holder: number;
  suit: Suit | undefined;
  rank: number | undefined;
  possibleSuits: number[];
  possibleRanks: number[];
  tweening: boolean = false;
  imageName: string | undefined = undefined;
  showOnlyLearned: boolean = false;
  numPositiveClues = 0;
  isDiscarded: boolean = false;
  turnDiscarded: number | null = null;
  isPlayed: boolean = false;
  turnPlayed: number | null = null;
  bare: any;

  constructor(scene: any, config: any) {
    // Initialize the Phaser container
    super(scene);

    this.x = config.x || 0;
    this.y = config.y || 0;
    if (!config.scale) config.scale = 1;
    this.scale = config.scale;
    this.setSize(CARD_W * config.scale, CARD_H * config.scale);

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

    const image = this.getImage();
    this.add(image);
  }

  getImage() {
    this.setCardImageName();

    // const image = this.scene.add.image(CARD_W / 2, CARD_H / 2, this.imageName);
    if (typeof this.imageName === 'undefined') {
      throw new Error('"this.imageName" is undefined in the "getImage()" function.');
    }
    const image = new Phaser.GameObjects.Image(this.scene, 0, 0, this.imageName);
    image.setScale(this.scale);
    return image;
  }

  doRotations(inverted: boolean) {
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

  setCardImageName() {
    const unknownSuit = SUITS.get('Unknown');
    if (typeof unknownSuit === 'undefined') {
      throw new Error('Failed to get the "Unknown" suit.');
    }

    const rank = this.rank;
    const empathyPastRankUncertain = this.showOnlyLearned && this.possibleRanks.length > 1;

    const suit = this.suit;
    const empathyPastSuitUncertain = this.showOnlyLearned && this.possibleSuits.length > 1;

    let suitToShow = suit || unknownSuit;
    if (empathyPastSuitUncertain) {
      suitToShow = unknownSuit;
    }

    // "Card-Unknown" is not created, so use "NoPip-Unknown"
    let prefix = 'Card';
    if (suitToShow === SUITS.get('Unknown')) {
      prefix = 'NoPip';
    }

    let name = `${prefix}-${suitToShow.name}-`;
    if (rank === 0) {
      name += '0';
    } else if (empathyPastRankUncertain) {
      name += '6';
    } else {
      name += rank || '6';
    }

    this.imageName = name;
  }
}
