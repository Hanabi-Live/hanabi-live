/*
    We define a button class so that we can easily redraw buttons that look similar.
    This is an extension of a Pixi.js container;
    when adding variables/methods to the class, we use double underscores to ensure that
    we don't interfere with any Pixi.js variables/methods.
*/

const pixi = require('pixi.js');
const globals = require('../globals');

function Button(config) {
    const button = new pixi.Container();
    button.x = config.x;
    button.y = config.y;
    button.interactive = true;

    // Define the two different background states for the button
    const background = new pixi.Graphics();
    const drawArgs = [
        0,
        0,
        config.width,
        config.height,
        0.12 * config.height,
    ];
    button.__press = () => {
        // Draw a white-ish color fill
        background.clear();
        background.beginFill(0x888888, 0.6);
        background.drawRoundedRect(...drawArgs);
        background.endFill();

        // Keep track of whether it is pressed or not
        button.__pressed = true;
    };
    button.__reset = () => {
        // Draw the original black fill
        background.clear();
        background.beginFill(0, 0.6); // Black with some transparency
        background.drawRoundedRect(...drawArgs);
        background.endFill();

        // Keep track of whether it is pressed or not
        button.__pressed = false;
    };
    button.__reset(); // Draw the unpressed background by default
    button.addChild(background);

    // Add either color, text, or an image, depending on what kind of button it is
    if (config.color && !globals.settings.showColorblindUI) {
        const color = new pixi.Graphics();
        color.beginFill(config.color, 0.9); // Slightly faded color
        color.drawRoundedRect(
            0.1 * config.width,
            0.1 * config.height,
            0.8 * config.width,
            0.8 * config.height,
            0.12 * 0.8 * config.height,
        );
        color.endFill();
        button.addChild(color);
    } else if (config.text) {
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
        button.__press();

        if (config.clickFunc) {
            config.clickFunc();
        }

        if (config.stayPressed) {
            button.__pressed = true;
        }
    });
    if (!config.stayPressed) {
        button.on('pointerout', button.__reset);
        button.on('pointerup', button.__reset);
    }

    return button;
}
module.exports = Button;
