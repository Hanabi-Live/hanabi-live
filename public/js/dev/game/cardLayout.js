/*
    For each player's hand and the discard pile, we group cards into CardLayouts.
    This object will automatically handle the spacing between the cards and tweening.
*/

const PIXI = require('pixi.js');
const misc = require('../misc');
const tween = require('./tween');

function CardLayout(config) {
    this.x = config.x;
    this.y = config.y;
    this.width = config.width;
    this.height = config.height;

    this.rotation = (config.rotation || 0);
    this.align = (config.align || 'left');
    this.reverse = (config.reverse || false);
    this.invertCards = (config.invertCards || false);

    this.cards = []; // An array of card sprites
}

CardLayout.prototype.add = function add(card) {
    this.cards.push(card);

    /*
    child.children.forEach((c) => {
        if (c.doRotations) {
            c.doRotations(this.invertCards);
        }
    });
    const pos = child.getAbsolutePosition();
    Kinetic.Group.prototype.add.call(this, child);
    child.setAbsolutePosition(pos);
    */

    this.doLayout();
};

CardLayout.prototype.doLayout = function doLayout() {
    let uw = 0;
    let dist = 0;
    let x = 0;

    const lw = this.width;
    const lh = this.height;

    const n = this.cards.length;

    for (let i = 0; i < n; i++) {
        const card = this.cards[i];
        const scale = lh / card.height;
        uw += scale * card.width;
    }

    if (n > 1) {
        dist = (lw - uw) / (n - 1);
    }

    if (dist > 10) {
        dist = 10;
    }

    uw += dist * (n - 1);

    if (this.align === 'center' && uw < lw) {
        x = (lw - uw) / 2;
    }

    if (this.reverse) {
        x = lw - x;
    }

    for (let i = 0; i < n; i++) {
        const card = this.cards[i];
        const scale = lh / card.height;

        // TODO
        /*
        if (card.tween) {
            card.tween.destroy();
        }
        */

        /*
        if (ui.animateFast) {
            card.x = x - (this.reverse ? scale * card.width : 0);
            card.y = 0;
            card.setScaleX(scale);
            card.setScaleY(scale);
            card.setRotation(0);
        } else {
        */

        const drawTween = PIXI.tweenManager.createTween(card);
        drawTween.stop().clear();

        drawTween.time = 500;
        drawTween.easing = PIXI.tween.Easing.linear();
        drawTween.to({
            x: this.x - x - (this.reverse ? scale * card.width : 0),
            y: this.y,
            rotation: misc.toRadians(this.rotation),
        });
        drawTween.start();
        tween.animate();

        // OLD
        /*
        node.tween = new Kinetic.Tween({
            node,
            duration: 0.5,
            x: ,
            y: 0,
            scaleX: scale,
            scaleY: scale,
            rotation: 0,
            runonce: true,
        }).play();
        */

        // }

        x += (scale * card.width + dist) * (this.reverse ? -1 : 1);
    }
};

module.exports = CardLayout;
