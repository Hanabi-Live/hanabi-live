// Imports
const arrows = require('./arrows');
const constants = require('../../constants');
const globals = require('./globals');
const graphics = require('./graphics');
const LayoutChild = require('./LayoutChild');
const misc = require('../../misc');
const tooltips = require('./tooltips');
const ui = require('./ui');

class Deck extends graphics.Group {
    constructor(config) {
        config.listening = true;
        super(config);

        this.cardBack = new graphics.Image({
            x: 0,
            y: 0,
            width: this.getWidth(),
            height: this.getHeight(),
            image: globals.cardImages['deck-back'],
        });
        this.add(this.cardBack);
        this.cardBack.on('dragend', this.dragEnd);

        this.numLeftText = new graphics.Text({
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
            text: globals.deckSize.toString(),
            listening: false,
        });
        this.add(this.numLeftText);

        this.on('click', (event) => {
            arrows.click(event, constants.REPLAY_ARROW_ORDER.DECK, this);
        });

        this.initTooltip();
    }

    add(child) {
        graphics.Group.prototype.add.call(this, child);

        if (!(child instanceof LayoutChild)) {
            return;
        }

        child.remove();
    }

    doLayout() {
        this.cardBack.setPosition({
            x: 0,
            y: 0,
        });
    }

    setCount(count) {
        this.numLeftText.setText(count.toString());

        // When there are no cards left in the deck, remove the card-back
        // and show a label that indicates how many turns are left before the game ends
        this.cardBack.setVisible(count > 0);
        let h = 0.3;
        if (count === 0) {
            h = 0.15;
        }
        this.numLeftText.setY(h * this.getHeight());
        globals.elements.deckTurnsRemainingLabel1.setVisible(count === 0);
        globals.elements.deckTurnsRemainingLabel2.setVisible(count === 0);

        // If the game ID is showing,
        // we want to center the deck count between it and the other labels
        if (count === 0 && globals.elements.gameIDLabel.getVisible()) {
            this.nudgeCountDownwards();
        }
    }

    nudgeCountDownwards() {
        const nudgeAmount = 0.07 * this.getHeight();
        this.numLeftText.setY(this.numLeftText.getY() + nudgeAmount);
    }

    dragEnd() {
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
            globals.elements.deckPlayAvailableLabel.hide();

            globals.lobby.conn.send('action', {
                type: constants.ACT.DECKPLAY,
            });

            ui.stopAction();
        } else {
            // The deck was dragged to an invalid location, so animate the card back to where it was
            new graphics.Tween({
                node: this,
                duration: 0.5,
                x: 0,
                y: 0,
                easing: graphics.Easings.EaseOut,
                onFinish: () => {
                    if (globals.layers.UI) {
                        globals.layers.UI.batchDraw();
                    }
                },
            }).play();
        }
    }

    // The deck tooltip shows the custom options for this game, if any
    initTooltip() {
        // If the user hovers over the deck, show a tooltip that shows extra game options, if any
        // (we don't use the "tooltip.init()" function because we need the extra condition in the
        // "mousemove" event)
        this.tooltipName = 'deck';
        this.on('mousemove', function mouseMove() {
            // Don't do anything if we might be dragging the deck
            if (globals.elements.deckPlayAvailableLabel.getVisible()) {
                return;
            }

            globals.activeHover = this;
            setTimeout(() => {
                tooltips.show(this);
            }, constants.TOOLTIP_DELAY);
        });
        this.on('mouseout', () => {
            globals.activeHover = null;
            $('#tooltip-deck').tooltipster('close');
        });

        // The tooltip will show what the deck is, followed by the current game options
        let content = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;This is the deck, which shows the number of cards remaining.</span><br /><br />';
        content += '<strong>Game Options:</strong>';
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

        if (globals.correspondence) {
            content += '<li><span class="game-tooltips-icon"><i class="fas fa-envelope"></i></span>';
            content += '&nbsp; Correspondence</li>';
        }

        if (globals.characterAssignments.length > 0) {
            content += '<li><span class="game-tooltips-icon">';
            content += '<span style="position: relative; right: 0.4em;">🤔</span></span>';
            content += '&nbsp; Detrimental Characters</li>';
        }

        content += '</ul>';
        $('#tooltip-deck').tooltipster('instance').content(content);

        // Store the content so it can be accessed by the faded rectangle tooltip
        this.tooltipContent = content;
    }
}

module.exports = Deck;
