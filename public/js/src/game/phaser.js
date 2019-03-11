/*
    A Phaser demo
*/

// Imports
const convert = require('./convert');
// const constants = require('../constants');
const globals = require('../globals');
const HanabiCard = require('./card');
const Hand = require('./hand');

exports.init = () => {
    const { width, height } = getGameSize();
    globals.phaser = new Phaser.Game({
        type: Phaser.AUTO, // "AUTO" picks "WEBGL" if available, otherwise "CANVAS"
        width,
        height,
        scene: {
            preload,
            create,
        },
    });
};

function preload() {
    const files = [
        'replay',
        'replay-disabled',
        'replay-back',
        'replay-back-disabled',
        'replay-back-full',
        'replay-back-full-disabled',
        'replay-forward',
        'replay-forward-disabled',
        'replay-forward-full',
        'replay-forward-full-disabled',
        'trashcan',
        'x',
    ];
    for (const file of files) {
        this.load.image(file, `/public/img/${file}.png`);
    }
    this.load.image('background', '/public/img/background.jpg');
}

function create() {
    // Set the background
    console.log(this.cameras);
    const background = this.add.sprite(
        this.sys.canvas.width / 2,
        this.sys.canvas.height / 2,
        'background',
    );
    background.setDisplaySize(this.sys.canvas.width, this.sys.canvas.height);

    // Convert all of the card canvases to textures
    for (const key in globals.ui.cardImages) {
        if (Object.prototype.hasOwnProperty.call(globals.ui.cardImages, key)) {
            const canvas = globals.ui.cardImages[key];
            this.textures.addCanvas(key, canvas);
        }
    }

    // Had to modify these since Phaser objects have default origin at their centres
    const handLayoutsRelative = [
        { x: 0.5, y: 0.9, rot: 0 },
        { x: 0.1, y: 0.5, rot: -78 * (Math.PI / 180) },
        { x: 0.5, y: 0.1, rot: 0 },
        { x: 0.9, y: 0.5, rot: 78 * (Math.PI / 180) },
    ];
    const handLayoutsAbsolute = handLayoutsRelative.map(handLayout => ({
        x: handLayout.x * this.sys.canvas.width,
        y: handLayout.y * this.sys.canvas.height,
        rot: handLayout.rot,
    }));
    const hands = handLayoutsAbsolute.map(handLayout => new Hand(this, handLayout));
    hands.map(hand => this.add.existing(hand));

    let order = 0;
    for (const hand of hands) {
        for (let i = 0; i <= 5; i++) {
            const suitNum = i;
            const rank = i;

            const suit = convert.msgSuitToSuit(suitNum, globals.init.variant);
            if (!globals.state.learnedCards[order]) {
                globals.state.learnedCards[order] = {
                    possibleSuits: globals.init.variant.suits.slice(),
                    possibleRanks: globals.init.variant.ranks.slice(),
                };
            }
            globals.ui.cards[order] = new HanabiCard(this, {
                suit,
                rank,
                order,
                suits: globals.init.variant.suits.slice(),
                ranks: globals.init.variant.ranks.slice(),
                holder: 0,
            });
            this.add.existing(globals.ui.cards[order]);

            this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
                gameObject.x = dragX;
                gameObject.y = dragY;
            });
            hand.draw(globals.ui.cards[order]);
            order += 1;
        }
    }
}

// We want the game stage to always be 16:9
const getGameSize = () => {
    const ratio = 16 / 9;

    let ww = window.innerWidth;
    let wh = window.innerHeight;

    if (ww < 640) {
        ww = 640;
    }
    if (wh < 360) {
        wh = 360;
    }

    let cw;
    let ch;
    if (ww < wh * ratio) {
        cw = ww;
        ch = ww / ratio;
    } else {
        ch = wh;
        cw = wh * ratio;
    }

    cw = Math.floor(cw);
    ch = Math.floor(ch);

    if (cw > 0.98 * ww) {
        cw = ww;
    }
    if (ch > 0.98 * wh) {
        ch = wh;
    }

    return {
        width: cw,
        height: ch,
    };
};
