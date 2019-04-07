// Imports
const FitText = require('./FitText');
const globals = require('./globals');
const graphics = require('./graphics');

class Button extends graphics.Group {
    constructor(config) {
        config.listening = true;
        super(config);

        // Class variables
        this.enabled = true;
        this.pressed = false;

        // Local variables
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

        this.text = null;
        this.img = null;
        if (config.text) {
            this.text = new FitText({
                name: 'text',
                x: 0,
                y: 0.275 * h,
                width: w,
                height: 0.5 * h,
                fontSize: 0.5 * h,
                fontFamily: 'Verdana',
                fill: 'white',
                align: 'center',
                text: config.text,
                listening: false,
            });
            this.setText = newText => this.text.setText(newText);
            this.setFill = newFill => this.text.setFill(newFill);
            this.add(this.text);
        } else if (config.image) {
            this.img = new graphics.Image({
                name: 'image',
                x: 0.2 * w,
                y: 0.2 * h,
                width: 0.6 * w,
                height: 0.6 * h,
                image: globals.ImageLoader.get(config.image),
                listening: false,
            });
            this.add(this.img);
            this.imageName = config.image; // Store this for later in case we disable the button
        }

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
    }

    setEnabled(enabled) {
        if (enabled === this.enabled) {
            return;
        }
        this.enabled = enabled;

        if (this.text !== null) {
            this.text.setFill(enabled ? 'white' : '#444444');
        }

        if (this.img !== null) {
            const imageName = (enabled ? this.imageName : `${this.imageName}-disabled`);
            this.img.setImage(globals.ImageLoader.get(imageName));
        }

        this.background.setListening(enabled);

        const layer = this.getLayer();
        if (layer !== null) {
            layer.batchDraw();
        }
    }

    setPressed(pressed) {
        this.pressed = pressed;
        this.background.setFill(pressed ? '#cccccc' : 'black');
        const layer = this.getLayer();
        if (layer !== null) {
            layer.batchDraw();
        }
    }
}

module.exports = Button;
