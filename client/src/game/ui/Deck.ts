import Konva from 'konva';
import { TOOLTIP_DELAY } from '../../constants';
import { timerFormatter, dateTimeFormatter, millisecondsToClockString } from '../../misc';
import { deckRules } from '../rules';
import ActionType from '../types/ActionType';
import ReplayArrowOrder from '../types/ReplayArrowOrder';
import * as arrows from './arrows';
import globals from './globals';
import * as tooltips from './tooltips';
import * as turn from './turn';

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
      listening: true,
    });
    this.add(this.cardBack);
    this.cardBack.on('dragend', this.dragEnd);

    // The text that shows the number of cards remaining in the deck
    this.numLeftText = new Konva.Text({
      fill: 'white',
      stroke: '#222222',
      strokeWidth: 0.0168 * this.height(),
      align: 'center',
      x: 0,
      y: 0.3 * this.height(),
      width: this.width(),
      height: 0.4 * this.height(),
      fontSize: 0.4 * this.height(),
      fontFamily: 'Verdana',
      fontStyle: 'bold',
      text: deckRules.totalCards(globals.variant).toString(),
      listening: false,
    });
    this.add(this.numLeftText);

    this.on('click tap', (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Deck, this);
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
    globals.elements.deckTurnsRemainingLabel1!.visible(
      count === 0
      && !globals.options.allOrNothing,
    );
    globals.elements.deckTurnsRemainingLabel2!.visible(
      count === 0
      && !globals.options.allOrNothing,
    );

    // If the game ID is showing,
    // we want to center the deck count between it and the other labels
    if (count === 0 && globals.elements.gameIDLabel!.isVisible()) {
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
      this.draggable(false);
      globals.elements.deckPlayAvailableLabel!.hide();

      globals.lobby.conn!.send('action', {
        tableID: globals.lobby.tableID,
        type: ActionType.Play,
        target: globals.deck.length - 1,
      });

      turn.hideClueUIAndDisableDragging();
    } else {
      // The deck was dragged to an invalid location, so animate the card back to where it was
      this.to({
        duration: 0.5,
        x: 0,
        y: 0,
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          const layer = globals.layers.UI;
          if (layer !== undefined) {
            layer.batchDraw();
          }
        },
      });
    }
  }

  // The deck tooltip shows the custom options for this game, if any
  initTooltip() {
    // If the user hovers over the deck, show a tooltip that shows extra game options, if any
    // (we don't use the "tooltip.init()" function because we need the extra condition in the
    // "mouseover" event)
    this.on('mouseover touchstart', function mouseOver(this: Deck) {
      // Don't do anything if we might be dragging the deck
      if (globals.elements.deckPlayAvailableLabel!.isVisible()) {
        return;
      }

      tooltips.resetActiveHover();
      globals.activeHover = this;
      setTimeout(() => {
        tooltips.show(this);
      }, TOOLTIP_DELAY);
    });
    this.on('mouseout touchend', () => {
      globals.activeHover = null;
      $('#tooltip-deck').tooltipster('close');
    });

    // The tooltip will show what the deck is, followed by the current game options
    let content = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> ';
    content += '&nbsp;This is the deck, which shows the number of cards remaining.</span>';
    content += '<br /><br />';
    content += '<strong>Game Info:</strong>';
    content += '<ul class="game-tooltips-ul">';

    // Disable this row in JSON replays
    if (globals.state.finished && globals.state.replay.databaseID !== null) {
      const formattedDatetimeFinished = dateTimeFormatter.format(
        new Date(globals.metadata.datetimeFinished),
      );
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-calendar"></i></span>';
      content += `&nbsp; Date Played: &nbsp;<strong>${formattedDatetimeFinished}</strong></li>`;

      const startedDate = new Date(globals.metadata.datetimeStarted);
      const finishedDate = new Date(globals.metadata.datetimeFinished);
      const elapsedMilliseconds = finishedDate.getTime() - startedDate.getTime();
      const clockString = millisecondsToClockString(elapsedMilliseconds);
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-stopwatch"></i></span>';
      content += `&nbsp; Game Length: &nbsp;<strong>${clockString}</strong></li>`;
    }

    if (globals.state.finished || globals.metadata.seeded) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-seedling"></i></span>';
      const seed = globals.metadata.seed === 'JSON' ? 'n/a' : globals.metadata.seed;
      content += `&nbsp; Seed: &nbsp;<strong>${seed}</strong>`;
      if (globals.metadata.seed === 'JSON') {
        content += ' (JSON game)';
      }
      content += '</li>';
    }

    content += '<li><span class="game-tooltips-icon"><i class="fas fa-rainbow"></i></span>';
    content += `&nbsp; Variant: &nbsp;<strong>${globals.variant.name}</strong></li>`;

    if (globals.options.timed) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-clock"></i></span>';
      content += '&nbsp; Timed: ';
      content += timerFormatter(globals.options.timeBase);
      content += ' + ';
      content += timerFormatter(globals.options.timePerTurn);
      content += '</li>';
    }

    if (globals.options.speedrun) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-running"></i></span>';
      content += '&nbsp; Speedrun</li>';
    }

    if (globals.options.cardCycle) {
      content += '<li><span class="game-tooltips-icon">';
      content += '<i class="fas fa-sync-alt" style="position: relative; left: 0.2em;"></i></span>';
      content += '&nbsp; Card Cycling</li>';
    }

    if (globals.options.deckPlays) {
      content += '<li><span class="game-tooltips-icon">';
      content += '<i class="fas fa-blind" style="position: relative; left: 0.2em;"></i></span>';
      content += '&nbsp; Bottom-Deck Blind Plays</li>';
    }

    if (globals.options.emptyClues) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-expand"></i></span>';
      content += '&nbsp; Empty Clues</li>';
    }

    if (globals.options.oneExtraCard) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-plus-circle"></i></span>';
      content += '&nbsp; One Extra Card</li>';
    }

    if (globals.options.oneLessCard) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-minus-circle"></i></span>';
      content += '&nbsp; One Less Card</li>';
    }

    if (globals.options.allOrNothing) {
      content += '<li><span class="game-tooltips-icon"><i class="fas fa-layer-group"></i></span>';
      content += '&nbsp; All or Nothing</li>';
    }

    if (globals.options.detrimentalCharacters) {
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
