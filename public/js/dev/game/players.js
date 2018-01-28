const pixi = require('pixi.js');
const constants = require('../constants');
const globals = require('../globals');

exports.draw = (seat) => {
    const nump = globals.init.names.length;

    for (let i = 0; i < nump; i++) {
        let j = i - globals.init.seat;
        if (j < 0) {
            j += nump;
        }

        // Remove all of the existing elements and redraw everything
        globals.ui.objects.nameFrames[i].removeChildren();

        const width = constants.NAME_POS[nump][j].w * globals.ui.w;
        const height = constants.NAME_POS[nump][j].h * globals.ui.h;
        const activePlayer = globals.state.activeIndex === i;

        const text = new pixi.Text(globals.init.names[i], new pixi.TextStyle({
            fontFamily: 'Verdana',
            fontSize: height,
            fill: 0xD8D5EF,
            fontWeight: (activePlayer ? 'bold' : 'normal'),
            dropShadow: activePlayer,
            dropShadowAlpha: 0.5,
            dropShadowBlur: 10,
            dropShadowDistance: 3,
        }));
        const textSprite = new pixi.Sprite(globals.app.renderer.generateTexture(text));
        textSprite.x = (width / 2) - (textSprite.width / 2);
        globals.ui.objects.nameFrames[i].addChild(textSprite);

        /*
        // TODO
        // Draw the tooltips on the player names that show the time
        if (!this.replayOnly) {
            nameFrames[i].on('mousemove', function nameFramesMouseMove() {
                ui.activeHover = this;

                const tooltipX = this.getWidth() / 2 + this.attrs.x;
                const tooltip = $(`#tooltip-player-${i}`);
                tooltip.css('left', tooltipX);
                tooltip.css('top', this.attrs.y);
                tooltip.tooltipster('open');
            });
            nameFrames[i].on('mouseout', () => {
                const tooltip = $(`#tooltip-player-${i}`);
                tooltip.tooltipster('close');
            });
        }
        */

        // The name frame is bolded to signify that they are the active player
        let lineThickness = 1;
        if (activePlayer) {
            lineThickness = 3;
        }
        const spacing = (textSprite.width / 2) * 1.4;

        const leftLine = new pixi.Graphics();
        leftLine.lineStyle(lineThickness, 0xD8D5EF);
        leftLine.moveTo(0, 0);
        leftLine.lineTo(0, height / 2);
        leftLine.lineTo(width / 2 - spacing, height / 2);
        globals.ui.objects.nameFrames[i].addChild(leftLine);

        const rightLine = new pixi.Graphics();
        rightLine.lineStyle(lineThickness, 0xD8D5EF);
        rightLine.moveTo(width / 2 + spacing, height / 2);
        rightLine.lineTo(width, height / 2);
        rightLine.lineTo(width, 0);
        globals.ui.objects.nameFrames[i].addChild(rightLine);
    }
};
