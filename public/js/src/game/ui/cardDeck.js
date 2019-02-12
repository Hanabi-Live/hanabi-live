// Imports
const globals = require('./globals');
const constants = require('../../constants');
const LayoutChild = require('./layoutChild');
const misc = require('../../misc');
const replay = require('./replay');

const CardDeck = function CardDeck(config) {
    Kinetic.Group.call(this, config);

    this.cardback = new Kinetic.Image({
        x: 0,
        y: 0,
        width: this.getWidth(),
        height: this.getHeight(),
        image: globals.cardImages[config.cardback],
    });
    this.add(this.cardback);

    this.cardback.on('dragend.play', function dragendPlay() {
        const pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        if (globals.elements.playArea.isOver(pos)) {
            // We need to remove the card from the screen once the animtion is finished
            // (otherwise, the card will be stuck in the in-game replay)
            globals.postAnimationLayout = () => {
                this.parent.doLayout();
                globals.postAnimationLayout = null;
            };

            this.setDraggable(false);
            globals.elements.deckPlayAvailableLabel.setVisible(false);

            globals.lobby.conn.send('action', {
                type: constants.ACT.DECKPLAY,
            });

            globals.lobby.ui.stopAction();

            globals.savedAction = null;
        } else {
            // The card was dragged to an invalid location,
            // so animate the card back to where it was
            new Kinetic.Tween({
                node: this,
                duration: 0.5,
                x: 0,
                y: 0,
                runonce: true,
                onFinish: () => {
                    globals.layers.UI.draw();
                },
            }).play();
        }
    });

    this.cardback.on('click', replay.promptTurn);

    this.count = new Kinetic.Text({
        fill: 'white',
        stroke: 'black',
        strokeWidth: 1,
        align: 'center',
        x: 0,
        y: 0.3 * this.getHeight(),
        width: this.getWidth(),
        height: 0.4 * this.getHeight(),
        fontSize: 0.4 * this.getHeight(),
        fontFamily: 'Verdana',
        fontStyle: 'bold',
        text: '0',
        listening: false,
    });
    this.add(this.count);

    // If the user hovers over the deck, show a tooltip that shows extra game options, if any
    this.initTooltip();
    this.on('mousemove', function mouseMove() {
        if (globals.elements.deckPlayAvailableLabel.isVisible()) {
            // Disable the tooltip if the user might be dragging the deck
            return;
        }

        const tooltip = $('#tooltip-deck');
        globals.activeHover = this;
        const tooltipX = this.getWidth() / 2 + this.attrs.x;
        tooltip.css('left', tooltipX);
        tooltip.css('top', this.attrs.y);
        tooltip.tooltipster('open');
    });
    this.on('mouseout', () => {
        $('#tooltip-deck').tooltipster('close');
    });
};

Kinetic.Util.extend(CardDeck, Kinetic.Group);

CardDeck.prototype.add = function add(child) {
    const self = this;

    Kinetic.Group.prototype.add.call(this, child);

    if (child instanceof LayoutChild) {
        if (globals.animateFast) {
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
    this.cardback.setImage(globals.ImageLoader.get(cardback));
};

CardDeck.prototype.setCount = function setCount(count) {
    this.count.setText(count.toString());

    this.cardback.setVisible(count > 0);
};

CardDeck.prototype.doLayout = function doLayout() {
    this.cardback.setPosition({
        x: 0,
        y: 0,
    });
};

// The deck tooltip shows the custom options for this game, if any
CardDeck.prototype.initTooltip = function initTooltip() {
    if (
        globals.variant.name === 'No Variant'
        && !globals.timed
        && !globals.deckPlays
        && !globals.emptyClues
        && globals.characterAssignments.length === 0
    ) {
        return;
    }

    let content = '<strong>Game Options:</strong>';
    content += '<ul class="game-tooltips-ul">';
    if (globals.variant.name !== 'No Variant') {
        content += `<li>Variant: ${globals.variant.name}</li>`;
    }
    if (globals.timed) {
        content += '<li>Timed: ';
        content += misc.timerFormatter(globals.baseTime * 1000);
        content += ' + ';
        content += misc.timerFormatter(globals.timePerTurn * 1000);
        content += '</li>';
    }
    if (globals.deckPlays) {
        content += '<li>Bottom-Deck Blind Plays</li>';
    }
    if (globals.emptyClues) {
        content += '<li>Empty Clues</li>';
    }
    if (globals.characterAssignments.length > 0) {
        content += '<li>Detrimental Characters</li>';
    }
    content += '</ul>';
    $('#tooltip-deck').tooltipster('instance').content(content);
};

module.exports = CardDeck;
