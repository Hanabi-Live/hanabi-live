// Imports
const graphics = require('./graphics');

const NumberButton = function NumberButton(config) {
    config.listening = true;
    graphics.Group.call(this, config);

    const w = this.getWidth();
    const h = this.getHeight();

    this.background = new graphics.Rect({
        name: 'background',
        x: 0,
        y: 0,
        width: w,
        height: h,
        cornerRadius: 0.12 * h,
        fill: 'black',
        opacity: 0.6,
    });
    this.add(this.background);

    const text = new graphics.Text({
        x: 0,
        y: 0.275 * h, // 0.25 is too high for some reason
        width: w,
        height: 0.5 * h,
        listening: false,
        fontSize: 0.5 * h,
        fontFamily: 'Verdana',
        fill: 'white',
        align: 'center',
        text: config.number.toString(),
    });
    this.add(text);

    this.pressed = false;

    this.clue = config.clue;

    const resetButton = () => {
        this.background.setFill('black');
        this.background.getLayer().batchDraw();

        this.background.off('mouseup');
        this.background.off('mouseout');
    };
    this.background.on('mousedown', () => {
        this.background.setFill('#888888');
        this.background.getLayer().batchDraw();

        this.background.on('mouseout', () => {
            resetButton();
        });
        this.background.on('mouseup', () => {
            resetButton();
        });
    });
};

graphics.Util.extend(NumberButton, graphics.Group);

NumberButton.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;
    this.background.setFill(pressed ? '#cccccc' : 'black');
    this.getLayer().batchDraw();
};

module.exports = NumberButton;
