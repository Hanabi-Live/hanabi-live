// Imports
const globals = require('./globals');
const graphics = require('./graphics');

const ColorButton = function ColorButton(config) {
    graphics.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    const background = new graphics.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        listening: true,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });

    this.add(background);

    const color = new graphics.Rect({
        x: 0.1 * w,
        y: 0.1 * h,
        width: 0.8 * w,
        height: 0.8 * h,
        listening: false,
        cornerRadius: 0.12 * 0.8 * h,
        fill: config.color,
        opacity: 0.9,
    });

    this.add(color);

    const text = new graphics.Text({
        x: 0,
        y: 0.2 * h,
        width: w,
        height: 0.6 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        text: config.text,
        visible: globals.lobby.settings.showColorblindUI,
    });

    this.add(text);

    this.pressed = false;

    this.clue = config.clue;

    background.on('mousedown', () => {
        background.setFill('#888888');
        background.getLayer().batchDraw();

        const resetButton = () => {
            background.setFill('black');
            background.getLayer().batchDraw();

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
};

graphics.Util.extend(ColorButton, graphics.Group);

ColorButton.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = ColorButton;
