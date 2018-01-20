const pixi = require('pixi.js');
const globals = require('../globals');

function Button(config) {
    const button = new pixi.Container();
    button.x = config.x;
    button.y = config.y;

    const background = new pixi.Graphics();
    background.beginFill(0, 0.6); // Black with some transparency
    background.drawRoundedRect(
        0,
        0,
        config.width,
        config.height,
        0.12 * config.height,
    );
    background.endFill();
    background.interactive = true;
    button.addChild(background);

    if (config.text) {
        /*
        const text = new Kinetic.Text({
            name: 'text',
            x: 0,
            y: 0.2 * h,
            width: w,
            height: 0.6 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            align: 'center',
            text: config.text,
        });

        this.setText = display => text.setText(display);

        this.add(text);
        */
    } else if (config.image) {
        const img = new pixi.Sprite(globals.resources[config.image].texture);
        img.x = 0.2 * config.width;
        img.y = 0.2 * config.height;
        img.width = 0.6 * config.width;
        img.height = 0.6 * config.height;
        button.addChild(img);
    }

    /*
    this.enabled = true;
    this.pressed = false;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().draw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().draw();

            background.off('mouseup');
            background.off('mouseout');
        };

        background.on('mouseout', () => {
            resetButton();
        });
        background.on('mouseup', () => {
            resetButton();
        });
    });
    */

    return button;
}

/*
Button.prototype.setEnabled = function setEnabled(enabled) {
    this.enabled = enabled;

    this.get('.text')[0].setFill(enabled ? 'white' : '#444444');

    this.get('.background')[0].setListening(enabled);

    this.getLayer().draw();
};

Button.prototype.getEnabled = function getEnabled() {
    return this.enabled;
};

Button.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};
*/

module.exports = Button;
