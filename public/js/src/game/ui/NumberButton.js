// Imports
const graphics = require('./graphics');

class NumberButton extends graphics.Group {
    constructor(config) {
        config.listening = true;
        super(config);

        // Class variables
        this.pressed = false;
        this.clue = config.clue;

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

        const text = new graphics.Text({
            x: 0,
            y: 0.275 * h, // 0.25 is too high for some reason
            width: w,
            height: 0.5 * h,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            align: 'center',
            text: config.number.toString(),
            listening: false,
        });
        this.add(text);

        const resetButton = () => {
            this.background.setFill('black');
            const layer = this.getLayer();
            if (layer) {
                layer.batchDraw();
            }

            this.background.off('mouseup');
            this.background.off('mouseout');
        };
        this.background.on('mousedown', () => {
            this.background.setFill('#888888');
            const layer = this.getLayer();
            if (layer) {
                layer.batchDraw();
            }

            this.background.on('mouseout', () => {
                resetButton();
            });
            this.background.on('mouseup', () => {
                resetButton();
            });
        });
    }

    setPressed(pressed) {
        this.pressed = pressed;
        this.background.setFill(pressed ? '#cccccc' : 'black');
        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }
}

module.exports = NumberButton;
