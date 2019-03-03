/*
    A Phaser demo
*/

// Imports
const globals = require('../globals');

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

    function preload() {
        const files = [
            'x',
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
        ];
        for (const file of files) {
            this.load.image(file, `/public/img/${file}.png`);
        }
    }

    function create() {
        const cardTexture = this.textures.createCanvas('card');
        cardTexture.setDataSource(globals.ui.cardImages['Card-Forest-1']);
        cardTexture.refresh();
        const card = this.add.image(150, 200, 'card');
        // const logo = this.add.image(100, 100, 'logo');
        card.setInteractive();
        this.input.setDraggable(card);
        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            gameObject.x = dragX;
            gameObject.y = dragY;
        });
    }
};

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
