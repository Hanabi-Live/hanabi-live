const pixi = require('pixi.js');
const globals = require('../globals');

exports.setCount = (count) => {
    const text = new pixi.Text(count, new pixi.TextStyle({
        fontFamily: 'Verdana',
        fontSize: 0.4 * globals.ui.objects.deckArea.height,
        fill: 'white',
        fontWeight: 'bold',
        strokeThickness: 3,
    }));

    const textSprite = globals.ui.objects.deckCount;
    textSprite.texture = globals.app.renderer.generateTexture(text);

    // Center the text on the deck
    textSprite.x = (globals.ui.objects.deckArea.width / 2) - (textSprite.width / 2);
    textSprite.y = (globals.ui.objects.deckArea.height / 2) - (textSprite.height / 2);
};

/*
CardDeck.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);

    if (child instanceof LayoutChild) {
        if (ui.animateFast) {
            child.remove();
            return;
        }

        child.tween = new Kinetic.Tween({
            node: child,
            x: 0,
            y: 0,
            scaleX: 0.01,
            scaleY: 0.01,
            rotation: 0,
            duration: 0.5,
            runonce: true,
        }).play();

        child.tween.onFinish = () => {
            if (child.parent === self) {
                child.remove();
            }
        };
    }
};

CardDeck.prototype.setCardBack = function setCardBack(cardback) {
    this.cardback.setImage(ImageLoader.get(cardback));
};

CardDeck.prototype.setCount = function setCount(count) {
    this.count.setText(count.toString());

    this.cardback.setVisible(count > 0);
};

CardDeck.prototype.getCount = function getCount() {
    return this.count.getText();
};

CardDeck.prototype.doLayout = function doLayout() {
    this.cardback.setPosition({
        x: 0,
        y: 0,
    });
};
*/

/*
drawDeck.cardback.on('dragend.play', function drawDeckDragendPlay() {
    const pos = this.getAbsolutePosition();

    pos.x += this.getWidth() * this.getScaleX() / 2;
    pos.y += this.getHeight() * this.getScaleY() / 2;

    if (overPlayArea(pos)) {
        ui.postAnimationLayout = () => {
            drawDeck.doLayout();
            ui.postAnimationLayout = null;
        };

        this.setDraggable(false);
        deckPlayAvailableLabel.setVisible(false);

        ui.sendMsg({
            type: 'action',
            resp: {
                type: ACT.DECKPLAY,
            },
        });

        self.stopAction();

        savedAction = null;
    } else {
        new Kinetic.Tween({
            node: this,
            duration: 0.5,
            x: 0,
            y: 0,
            runonce: true,
            onFinish: () => {
                UILayer.draw();
            },
        }).play();
    }
});

cardLayer.add(drawDeck);
*/
