const pixi = require('pixi.js');
const globals = require('../globals');

function Button(config) {
    const button = new pixi.Container();
    button.x = config.x;
    button.y = config.y;
    button.interactive = true;

    // First, draw the black background
    const background = new pixi.Graphics();
    const drawArgs = [
        0,
        0,
        config.width,
        config.height,
        0.12 * config.height,
    ];
    const resetButton = (evt) => {
        // Draw the original black fill
        background.clear();
        background.beginFill(0, 0.6); // Black with some transparency
        background.drawRoundedRect(...drawArgs);
        background.endFill();
    };
    resetButton();
    button.addChild(background);

    // Add either text or an image, depending on what kind of button it is
    if (config.text) {
        const text = new pixi.Text(config.text, new pixi.TextStyle({
            fontFamily: 'Verdana',
            fontSize: 0.5 * config.height,
            fill: 'white',
        }));
        const textSprite = new pixi.Sprite(globals.app.renderer.generateTexture(text));
        textSprite.x = (config.width / 2) - (textSprite.width / 2);
        textSprite.y = 0.2 * config.height;
        textSprite.height = 0.6 * config.height;
        button.addChild(textSprite);
    } else if (config.image) {
        const img = new pixi.Sprite(globals.resources[config.image].texture);
        img.x = 0.2 * config.width;
        img.y = 0.2 * config.height;
        img.width = 0.6 * config.width;
        img.height = 0.6 * config.height;
        button.addChild(img);
    }

    // Event handlers
    button.on('pointerdown', (evt) => {
        // Draw a white-ish color fill
        background.clear();
        background.beginFill(0x888888, 0.6);
        background.drawRoundedRect(...drawArgs);
        background.endFill();

        config.clickFunc();
    });
    button.on('pointerout', resetButton);
    button.on('pointerup', resetButton);

    return button;
}
module.exports = Button;
