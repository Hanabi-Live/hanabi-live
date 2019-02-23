// Imports
const globals = require('./globals');
const FitText = require('./fitText');
const graphics = require('./graphics');

const Button = function Button(config) {
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

    if (config.text) {
        const text = new FitText({
            name: 'text',
            x: 0,
            y: 0.275 * h,
            width: w,
            height: 0.5 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            align: 'center',
            text: config.text,
        });

        this.setText = newText => text.setText(newText);
        this.setFill = newFill => text.setFill(newFill);

        this.add(text);
    } else if (config.image) {
        const img = new graphics.Image({
            name: 'image',
            x: 0.2 * w,
            y: 0.2 * h,
            width: 0.6 * w,
            height: 0.6 * h,
            listening: false,
            image: globals.ImageLoader.get(config.image),
        });

        this.add(img);
    }

    this.enabled = true;
    this.pressed = false;

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

graphics.Util.extend(Button, graphics.Group);

Button.prototype.setEnabled = function setEnabled(enabled) {
    this.enabled = enabled;

    this.get('.text')[0].setFill(enabled ? 'white' : '#444444');

    this.get('.background')[0].setListening(enabled);

    this.getLayer().batchDraw();
};

Button.prototype.getEnabled = function getEnabled() {
    return this.enabled;
};

Button.prototype.setPressed = function setPressed(pressed) {
    this.pressed = pressed;

    this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

    this.getLayer().batchDraw();
};

module.exports = Button;
