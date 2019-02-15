// Imports
const globals = require('./globals');
const constants = require('../../constants');
const graphics = require('./graphics');
const LayoutChild = require('./layoutChild');
const misc = require('../../misc');

const CardDeck = function CardDeck(config) {
    graphics.Group.call(this, config);

    this.cardback = new graphics.Image({
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
            // We need to remove the card from the screen once the animation is finished
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
            // The deck was dragged to an invalid location,
            // so animate the card back to where it was
            new graphics.Tween({
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

    this.count = new graphics.Text({
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

graphics.Util.extend(CardDeck, graphics.Group);

CardDeck.prototype.add = function add(child) {
    graphics.Group.prototype.add.call(this, child);

    if (!(child instanceof LayoutChild)) {
        return;
    }

    if (globals.animateFast) {
        child.remove();
        return;
    }

    console.log('PLAYING UNKNOWN TWEEN');
    child.tween = new graphics.Tween({
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
        console.log('FINISHED UNKNOWN TWEEN');
        if (child.parent === this) {
            child.remove();
        }
    };
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
    let content = '<strong>Game Options:</strong>';
    content += '<ul class="game-tooltips-ul">';
    content += '<li><span class="game-tooltips-icon"><i class="fas fa-rainbow"></i></span>';
    content += `&nbsp; Variant: &nbsp;<strong>${globals.variant.name}</strong></li>`;

    if (globals.timed) {
        content += '<li><span class="game-tooltips-icon"><i class="fas fa-clock"></i></span>';
        content += '&nbsp; Timed: ';
        content += misc.timerFormatter(globals.baseTime * 1000);
        content += ' + ';
        content += misc.timerFormatter(globals.timePerTurn * 1000);
        content += '</li>';
    }

    if (globals.speedrun) {
        content += '<li><span class="game-tooltips-icon"><i class="fas fa-running"></i></span>';
        content += '&nbsp; Speedrun</li>';
    }

    if (globals.deckPlays) {
        content += '<li><span class="game-tooltips-icon">';
        content += '<i class="fas fa-blind" style="position: relative; left: 0.2em;"></i></span>';
        content += '&nbsp; Bottom-Deck Blind Plays</li>';
    }

    if (globals.emptyClues) {
        content += '<li><span class="game-tooltips-icon"><i class="fas fa-expand"></i></span>';
        content += '&nbsp; Empty Clues</li>';
    }

    if (globals.characterAssignments.length > 0) {
        content += '<li><span class="game-tooltips-icon">';
        content += '<span style="position: relative; right: 0.4em;">🤔</span></span>';
        content += '&nbsp; Detrimental Characters</li>';
    }

    content += '</ul>';
    $('#tooltip-deck').tooltipster('instance').content(content);
};

module.exports = CardDeck;
