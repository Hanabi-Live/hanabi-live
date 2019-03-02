/*
    A Phaser demo
*/

exports.init = () => {
    const { width, height } = getGameSize();
    const game = new Phaser.Game({ // eslint-disable-line
        type: Phaser.AUTO, // AUTO picks WEBGL if available, otherwise CANVAS
        width,
        height,
        scene: {
            preload,
            create,
        },
    });

    function preload() {
        this.load.image('logo', '/public/img/unused/5.png');
    }

    function create() {
        const logo = this.add.image(100, 100, 'logo');
        logo.setInteractive();
        this.input.setDraggable(logo);
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
