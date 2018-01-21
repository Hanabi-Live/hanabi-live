const pixi = require('pixi.js');
const globals = require('../globals');

exports.drawClues = (clues) => {
    const text = new pixi.Text(`Clues: ${clues}`, new pixi.TextStyle({
        fontFamily: 'Verdana',
        fontSize: 0.03 * globals.ui.h,
        fill: 'white',
        dropShadow: true,
        dropShadowAlpha: 0.5,
        dropShadowBlur: 10,
        dropShadowDistance: 3,
    }));

    const textSprite = globals.ui.objects.scoreAreaClues;
    textSprite.texture = globals.app.renderer.generateTexture(text);
    textSprite.x = 0.01 * globals.ui.w;
    textSprite.y = 0.015 * globals.ui.h;

    // Center the text
    textSprite.x += (0.11 * globals.ui.w / 2) - (textSprite.width / 2);
};

exports.drawScore = (score) => {
    const text = new pixi.Text(`Score: ${score}`, new pixi.TextStyle({
        fontFamily: 'Verdana',
        fontSize: 0.03 * globals.ui.h,
        fill: 'white',
        dropShadow: true,
        dropShadowAlpha: 0.5,
        dropShadowBlur: 10,
        dropShadowDistance: 3,
    }));

    const textSprite = globals.ui.objects.scoreAreaScore;
    textSprite.texture = globals.app.renderer.generateTexture(text);
    textSprite.x = 0.01 * globals.ui.w;
    textSprite.y = 0.055 * globals.ui.h;

    // Center the text
    textSprite.x += (0.11 * globals.ui.w / 2) - (textSprite.width / 2);
};
