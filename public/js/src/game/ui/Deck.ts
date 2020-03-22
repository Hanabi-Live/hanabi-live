// Imports
import Konva from 'konva';
import * as action from './action';
import * as arrows from './arrows';
import { ACTION, REPLAY_ARROW_ORDER, TOOLTIP_DELAY } from '../../constants';
import globals from './globals';
import { timerFormatter } from '../../misc';
import * as tooltips from './tooltips';

export default class Deck extends Konva.Group {
    cardBack: Konva.Image;
    numLeftText: Konva.Text;
    tooltipName: string = 'deck';
    tooltipContent: string = '';

    constructor(config: Konva.ContainerConfig) {
        super(config);
        this.listening(true);

        this.cardBack = new Konva.Image({
            x: 0,
            y: 0,
            width: this.width(),
            height: this.height(),
            image: globals.cardImages.get('deck-back')!,
        });
        this.add(this.cardBack);
        this.cardBack.on('dragend', this.dragEnd);

        // The text that shows the number of cards remaining in the deck
        this.numLeftText = new Konva.Text({
            fill: 'white',
            stroke: '#222222',
            strokeWidth: 3,
            align: 'center',
            x: 0,
            y: 0.3 * this.height(),
            width: this.width(),
            height: 0.4 * this.height(),
            fontSize: 0.4 * this.height(),
            fontFamily: 'Verdana',
            fontStyle: 'bold',
            text: globals.deckSize.toString(),
            listening: false,
        });
        this.add(this.numLeftText);

        this.on('click', (event) => {
            arrows.click(event, REPLAY_ARROW_ORDER.DECK, this);
        });

        this.initTooltip();
    }

    doLayout() {
        this.cardBack.position({
            x: 0,
            y: 0,
        });
    }

    setCount(count: number) {
        this.numLeftText.text(count.toString());

        // When there are no cards left in the deck, remove the card-back
        // and show a label that indicates how many turns are left before the game ends
        this.cardBack.visible(count > 0);
        let h = 0.3;
        if (count === 0) {
            h = 0.15;
        }
        this.numLeftText.y(h * this.height());
        globals.elements.deckTurnsRemainingLabel1!.visible(count === 0);
        globals.elements.deckTurnsRemainingLabel2!.visible(count === 0);

        // If the game ID is showing,
        // we want to center the deck count between it and the other labels
        if (count === 0 && globals.elements.gameIDLabel!.visible()) {
            this.nudgeCountDownwards();
        }
    }

    nudgeCountDownwards() {
        const nudgeAmount = 0.07 * this.height();
        this.numLeftText.y(this.numLeftText.y() + nudgeAmount);
    }

    dragEnd() {
        const pos = this.getAbsolutePosition();

        pos.x += this.width() * this.scaleX() / 2;
        pos.y += this.height() * this.scaleY() / 2;

        if (globals.elements.playArea!.isOver(pos)) {
            // We need to remove the card from the screen once the animation is finished
            // (otherwise, the card will be stuck in the in-game replay)
            globals.postAnimationLayout = () => {
                (this.parent as unknown as Deck).doLayout();
                globals.postAnimationLayout = null;
            };

            this.draggable(false);
            globals.elements.deckPlayAvailableLabel!.hide();

            globals.lobby.conn.send('action', {
                type: ACTION.DECKPLAY,
            });

            action.stop();
        } else {
            // The deck was dragged to an invalid location, so animate the card back to where it was
            new Konva.Tween({
                node: this,
                duration: 0.5,
                x: 0,
                y: 0,
                easing: Konva.Easings.EaseOut,
                onFinish: () => {
                    const layer = globals.layers.get('UI');
                    if (typeof layer !== 'undefined') {
                        layer.batchDraw();
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
        this.on('mousemove', function mouseMove() {
            // Don't do anything if we might be dragging the deck
            if (globals.elements.deckPlayAvailableLabel!.visible()) {
                return;
            }

            globals.activeHover = this;
            setTimeout(() => {
                tooltips.show(this);
            }, TOOLTIP_DELAY);
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
            content += timerFormatter(globals.baseTime * 1000);
            content += ' + ';
            content += timerFormatter(globals.timePerTurn * 1000);
            content += '</li>';
        }

        if (globals.speedrun) {
            content += '<li><span class="game-tooltips-icon"><i class="fas fa-running"></i></span>';
            content += '&nbsp; Speedrun</li>';
        }

        if (globals.cardCycle) {
            content += '<li><span class="game-tooltips-icon">';
            content += '<i class="fas fa-sync-alt" style="position: relative; left: 0.2em;"></i></span>';
            content += '&nbsp; Card Cycling</li>';
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

        // Store the content so it can be accessed by the faded rectangle tooltip
        this.tooltipContent = content;
    }
}
