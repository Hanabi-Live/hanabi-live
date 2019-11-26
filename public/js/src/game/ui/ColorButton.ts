// Imports
import Konva from 'konva';
import Clue from './Clue';

export default class ColorButton extends Konva.Group {
    pressed: boolean = false;
    clue: Clue;

    background: Konva.Rect;

    constructor(config: Konva.ContainerConfig, showColorblindUI: boolean) {
        super(config);
        this.listening(true);

        this.clue = config.clue;

        // Local variables
        const w = this.width();
        const h = this.height();

        this.background = new Konva.Rect({
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

        const color = new Konva.Rect({
            x: 0.1 * w,
            y: 0.1 * h,
            width: 0.8 * w,
            height: 0.8 * h,
            cornerRadius: 0.12 * 0.8 * h,
            fill: config.color,
            opacity: 0.9,
            listening: false,
        });
        this.add(color);

        const text = new Konva.Text({
            x: 0,
            y: 0.2 * h,
            width: w,
            height: 0.6 * h,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            stroke: 'black',
            strokeWidth: 1,
            align: 'center',
            text: config.text,
            visible: showColorblindUI,
            listening: false,
        });
        this.add(text);

        const resetButton = () => {
            this.background.fill('black');
            const layer = this.getLayer();
            if (layer) {
                layer.batchDraw();
            }

            this.background.off('mouseup');
            this.background.off('mouseout');
        };
        this.background.on('mousedown', () => {
            this.background.fill('#888888');
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

    setPressed(pressed: boolean) {
        this.pressed = pressed;
        this.background.fill(pressed ? '#cccccc' : 'black');
        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }
}
