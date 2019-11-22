// Imports
import Konva from 'konva';
import FitText from './FitText';
import globals from './globals';

export default class Button extends Konva.Group {
    enabled: boolean = true;
    pressed: boolean = false;

    background: Konva.Rect;
    textElement: FitText | null = null;
    imageElement: Konva.Image | null = null;
    imageName: string = '';

    constructor(config: Konva.ContainerConfig) {
        super(config);
        this.listening(true);

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

        this.textElement = null;
        this.imageElement = null;
        if (config.text) {
            this.textElement = new FitText({
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
            this.add(this.textElement);
        } else if (config.image) {
            this.imageElement = new Konva.Image({
                name: 'image',
                x: 0.2 * w,
                y: 0.2 * h,
                width: 0.6 * w,
                height: 0.6 * h,
                image: globals.ImageLoader.get(config.image),
                listening: false,
            });
            this.add(this.imageElement);
            this.imageName = config.image; // Store this for later in case we disable the button
        }

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

    setEnabled(enabled: boolean) {
        if (enabled === this.enabled) {
            return;
        }
        this.enabled = enabled;

        if (this.textElement) {
            this.textElement.fill(enabled ? 'white' : '#444444');
        }

        if (this.imageElement) {
            const imageName = (enabled ? this.imageName : `${this.imageName}-disabled`);
            this.imageElement.image(globals.ImageLoader.get(imageName));
        }

        this.background.listening(enabled);

        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }

    setPressed(pressed: boolean) {
        this.pressed = pressed;
        this.background.fill(pressed ? '#cccccc' : 'black');
        const layer = this.getLayer();
        if (layer) {
            layer.batchDraw();
        }
    }

    setText(newText: string) {
        if (this.textElement) {
            this.textElement.fitText(newText);
        }
    }

    setFill(newFill: string) {
        if (this.textElement) {
            this.textElement.fill(newFill);
        }
    }
}
