import type { CardOrder } from "@hanabi-live/game";
import {
  getTotalCardsInDeck,
  millisecondsToClockString,
} from "@hanabi-live/game";
import Konva from "konva";
import { OptionIcons } from "../../enums/OptionIcons";
import * as tooltips from "../../tooltips";
import { dateTimeFormatter, timerFormatter } from "../../utils";
import { ActionType } from "../types/ActionType";
import { ReplayArrowOrder } from "../types/ReplayArrowOrder";
import { globals } from "./UIGlobals";
import * as arrows from "./arrows";
import { CARD_ANIMATION_LENGTH_SECONDS } from "./constants";
import * as cursor from "./cursor";
import { isOurTurn } from "./isOurTurn";
import * as konvaTooltips from "./konvaTooltips";
import * as turn from "./turn";

export class Deck extends Konva.Group {
  cardBack: Konva.Image;
  numLeft: number;
  numLeftText: Konva.Text;
  tooltipName = "deck";
  tooltipContent = "";

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true);

    this.cardBack = new Konva.Image({
      x: 0,
      y: 0,
      width: this.width(),
      height: this.height(),
      image: globals.cardImages.get("deck-back")!,
      listening: true,
    });
    this.add(this.cardBack);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    this.cardBack.on("dragend", this.dragEnd);

    // The text that shows the number of cards remaining in the deck.
    this.numLeft = getTotalCardsInDeck(globals.variant);
    this.numLeftText = new Konva.Text({
      fill: "white",
      stroke: "#222222",
      strokeWidth: 0.0168 * this.height(),
      align: "center",
      x: 0,
      y: 0.3 * this.height(),
      width: this.width(),
      height: 0.4 * this.height(),
      fontSize: 0.4 * this.height(),
      fontFamily: "Verdana",
      fontStyle: "bold",
      text: this.numLeft.toString(),
      listening: false,
    });
    this.add(this.numLeftText);

    // Right-click on the deck to highlight it with an arrow.
    this.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Deck);
    });

    this.initDeckTooltip();
    this.initCursors();
  }

  // Most of this function is copy-pasted from "LayoutChild.dragEnd()". It contains a subset of the
  // real card features in order to minimize complexity.
  dragEnd(): void {
    const draggedTo = cursor.getElementDragLocation(this);

    if (draggedTo === "playArea") {
      // Card orders start at 0, so the final card order is the length of the deck - 1.
      const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
      const cardOrder = (totalCardsInDeck - 1) as CardOrder;
      turn.end({
        type: ActionType.Play,
        target: cardOrder,
      });
    } else if (draggedTo === "discardArea") {
      // Inverted suit needs discard whenever play is available.
      const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
      const cardOrder = (totalCardsInDeck - 1) as CardOrder;
      turn.end({
        type: ActionType.Discard,
        target: cardOrder,
      });
    } else {
      // The card was dragged to an invalid location; tween it back to the hand.
      this.to({
        // Tween
        duration: CARD_ANIMATION_LENGTH_SECONDS,
        x: 0,
        y: 0,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        easing: Konva.Easings.EaseOut,
        onFinish: () => {
          const layer = globals.layers.UI;
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (layer !== undefined) {
            layer.batchDraw();
          }
        },
      });
    }
  }

  // The deck tooltip shows the custom options for this game, if any.
  initDeckTooltip(): void {
    // If the user hovers over the deck, show a tooltip that shows extra game options, if any. (We
    // do not use the "tooltip.init()" function because we need the extra condition in the
    // "mouseover" event.)
    this.on("mouseover touchstart", function mouseOver(this: Deck) {
      // Do not do anything if we might be dragging the deck.
      if (globals.elements.deckPlayAvailableLabel!.isVisible() === true) {
        return;
      }

      konvaTooltips.resetActiveHover();
      globals.activeHover = this;
      setTimeout(() => {
        konvaTooltips.show(this);
      }, tooltips.TOOLTIP_DELAY_IN_MILLISECONDS);
    });
    this.on("mouseout touchend", () => {
      globals.activeHover = null;
      tooltips.close("#tooltip-deck");
    });

    this.updateDeckTooltip();
  }

  updateDeckTooltip(): void {
    // We store the content as a class variable so that it can be reused for the faded background
    // rectangle behind the card (so that the tooltip will work when there are 0 cards left in the
    // deck).
    this.tooltipContent = getTooltipContent();
    tooltips.setInstanceContent("#tooltip-deck", this.tooltipContent);
  }

  // When dragging the deck, change the cursor to emulate the behavior when dragging a card. It does
  // not emulate the full cursor behavior in order to minimum complexity.
  initCursors(): void {
    this.on("mouseenter", () => {
      if (this.canDragDeck()) {
        cursor.set("hand");
      }
    });
    this.on("mouseleave", () => {
      if (this.canDragDeck()) {
        cursor.set("default");
      }
    });
    this.on("mousedown", (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (this.canDragDeck() && event.evt.buttons === 1) {
        // Left-click is being held down.
        cursor.set("dragging");
      }
    });
    this.on("mouseup", () => {
      if (this.canDragDeck()) {
        cursor.set("hand");
      }
    });
  }

  canDragDeck(): boolean {
    return globals.options.deckPlays && this.numLeft === 1 && isOurTurn();
  }

  setCount(count: number): void {
    this.numLeft = count;
    this.numLeftText.text(count.toString());

    // When there are no cards left in the deck, remove the card-back and show a label that
    // indicates how many turns are left before the game ends.
    this.cardBack.visible(count > 0);
    let h = 0.3;
    if (count === 0) {
      h = 0.15;
    }
    this.numLeftText.y(h * this.height());
    globals.elements.deckTurnsRemainingLabel1!.visible(
      count === 0 && !globals.options.allOrNothing,
    );
    globals.elements.deckTurnsRemainingLabel2!.visible(
      count === 0 && !globals.options.allOrNothing,
    );

    // If the game ID is showing, we want to center the deck count between it and the other labels.
    if (count === 0 && globals.elements.gameIDLabel!.isVisible() === true) {
      this.nudgeCountDownwards();
    }
  }

  nudgeCountDownwards(): void {
    const nudgeAmount = 0.07 * this.height();
    this.numLeftText.y(this.numLeftText.y() + nudgeAmount);
  }

  resetCardBack(): void {
    this.cardBack.position({
      x: 0,
      y: 0,
    });
    globals.layers.card.batchDraw();
  }
}

/** The tooltip will show information about the game and the current options. */
function getTooltipContent(): string {
  let content = "<strong>Game Info:</strong>";
  content += '<ul class="game-tooltips-ul">';

  const currentTable = globals.lobby.tableMap.get(globals.lobby.tableID);
  if (currentTable !== undefined) {
    content +=
      '<li><span class="game-tooltips-icon"><i class="fas fa-signature"></i></span>';
    content += `&nbsp; Table name: &nbsp;${currentTable.name}</li>`;
  }

  if (
    globals.state.finished &&
    globals.state.replay.databaseID !== null &&
    // JSON replays are hard-coded to have a database ID of 0.
    globals.state.replay.databaseID !== 0
  ) {
    content +=
      '<li><span class="game-tooltips-icon"><i class="fas fa-fingerprint"></i></span>';
    content += `&nbsp; Database ID: &nbsp;<strong>${globals.state.replay.databaseID}</strong></li>`;
  }

  if (globals.state.finished || globals.metadata.hasCustomSeed) {
    content +=
      '<li><span class="game-tooltips-icon"><i class="fas fa-seedling"></i></span>';
    const seed =
      globals.metadata.seed === "JSON" ? "n/a" : globals.metadata.seed;
    content += `&nbsp; Seed: &nbsp;<strong>${seed}</strong>`;
    if (globals.metadata.seed === "JSON") {
      content += " (JSON game)";
    }
    content += "</li>";
  }

  if (globals.state.finished && globals.state.datetimeFinished !== null) {
    const datetimeFinishedDate = new Date(globals.state.datetimeFinished);
    const formattedDatetimeFinished =
      dateTimeFormatter.format(datetimeFinishedDate);
    content +=
      '<li><span class="game-tooltips-icon"><i class="fas fa-calendar"></i></span>';
    content += `&nbsp; Date Played: &nbsp;<strong>${formattedDatetimeFinished}</strong></li>`;
  }

  // "datetimeStarted" and "datetimeFinished" are initialized to strings during the "init" command,
  // so they should never be null.
  if (
    globals.state.datetimeStarted !== null &&
    globals.state.datetimeFinished !== null
  ) {
    const startedDate = new Date(globals.state.datetimeStarted);
    const finishedDate = globals.state.finished
      ? new Date(globals.state.datetimeFinished)
      : new Date();
    const elapsedMilliseconds = finishedDate.getTime() - startedDate.getTime();
    const clockString = millisecondsToClockString(elapsedMilliseconds);
    content +=
      '<li><span class="game-tooltips-icon"><i class="fas fa-stopwatch"></i></span>';
    content += `&nbsp; Game Length: &nbsp;<strong>${clockString}</strong></li>`;
  }

  content +=
    '<li><span class="game-tooltips-icon"><i class="fas fa-rainbow"></i></span>';
  content += `&nbsp; Variant: &nbsp;<strong>${globals.variant.name}</strong></li>`;

  if (globals.options.timed) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.Timed}"></i></span>`;
    content += "&nbsp; Timed: ";
    content += timerFormatter(globals.options.timeBase);
    content += " + ";
    content += timerFormatter(globals.options.timePerTurn);
    content += "</li>";
  }

  if (globals.options.speedrun) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.Speedrun}"></i></span>`;
    content += "&nbsp; Speedrun</li>";
  }

  if (globals.options.cardCycle) {
    content += '<li><span class="game-tooltips-icon">';
    content += `<i class="${OptionIcons.CardCycle}"></i></span>`;
    content += "&nbsp; Card Cycling</li>";
  }

  if (globals.options.deckPlays) {
    content += '<li><span class="game-tooltips-icon">';
    content += `<i class="${OptionIcons.DeckPlays}" style="position: relative; left: 0.2em;"></i></span>`;
    content += "&nbsp; Bottom-Deck Blind Plays</li>";
  }

  if (globals.options.emptyClues) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.EmptyClues}"></i></span>`;
    content += "&nbsp; Empty Clues</li>";
  }

  if (globals.options.oneExtraCard) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.OneExtraCard}"></i></span>`;
    content += "&nbsp; One Extra Card</li>";
  }

  if (globals.options.oneLessCard) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.OneLessCard}"></i></span>`;
    content += "&nbsp; One Less Card</li>";
  }

  if (globals.options.allOrNothing) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.AllOrNothing}"></i></span>`;
    content += "&nbsp; All or Nothing</li>";
  }

  if (globals.options.detrimentalCharacters) {
    content += `<li><span class="game-tooltips-icon"><i class="${OptionIcons.DetrimentalCharacters}"></i></span>`;
    content += "&nbsp; Detrimental Characters</li>";
  }

  content += "</ul>";

  return content;
}
