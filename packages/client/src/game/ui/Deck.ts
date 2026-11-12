import type { CardOrder } from "@hanabi-live/game";
import {
  getDeckPossibilities,
  getTotalCardsInDeck,
  millisecondsToClockString,
  PipState,
  secondsToClockString,
  UNKNOWN_SUIT_NAME,
} from "@hanabi-live/game";
import Konva from "konva";
import { OptionIcons } from "../../enums/OptionIcons.ts";
import * as tooltips from "../../tooltips.ts";
import { dateTimeFormatter, escapeHtml } from "../../utils.ts";
import type { Pips } from "../types/Pips.ts";
import * as arrows from "./arrows.ts";
import {
  CARD_ANIMATION_LENGTH_SECONDS,
  CARD_W,
  EMPTY_DECK_COLOR,
  FONT_FAMILY,
  LEFT_MOUSE_BUTTON_HELD,
  STROKE_WIDTH_UNIT,
} from "./constants.ts";
import * as cursor from "./cursor.ts";
import { CARD_IMAGE_UNKNOWN_CARD_RANK_NAME } from "./drawCards.ts";
import { updatePip } from "./HanabiCard.ts";
import * as HanabiCardInit from "./HanabiCardInit.ts";
import { isOurTurn } from "./isOurTurn.ts";
import * as konvaTooltips from "./konvaTooltips.ts";
import { getOwnerName } from "./ownerName.ts";
import * as turn from "./turn.ts";
import { globals } from "./UiGlobals.ts";

/** The size of the count of cards left in the deck, as a fraction of the deck's height. */
const NUM_LEFT_SIZE = 0.4;

/** The color of the number of cards remaining in the deck, while it is not empty. */
const NUM_LEFT_COLOR = "white";

/** The dark gray outline of the number of cards remaining in the deck. */
const NUM_LEFT_STROKE_COLOR = "#222222";

/** The width of the outline around the number of cards left, as a fraction of the stage height. */
const NUM_LEFT_STROKE_WIDTH = 3 * STROKE_WIDTH_UNIT;

/** The top of the count of cards left, as a fraction of the deck's height. */
const NUM_LEFT_Y = 0.3;

/**
 * The top of the count of cards left once the deck is empty, as a fraction of the deck's height. It
 * moves up to make room for the labels that show the turns remaining.
 */
const EMPTY_DECK_NUM_LEFT_Y = 0.15;

/**
 * How far the count of cards left moves down on an empty deck to center it between the game ID and
 * the labels that show the turns remaining, as a fraction of the deck's height.
 */
const GAME_ID_NUM_LEFT_NUDGE = 0.07;

/** The image of a card with no pips, which the deck shows with its own pips during empathy. */
const UNKNOWN_CARD_IMAGE = `card-${UNKNOWN_SUIT_NAME}-${CARD_IMAGE_UNKNOWN_CARD_RANK_NAME}`;

export class Deck extends Konva.Group {
  cardBack: Konva.Image;
  empathy = false;
  numLeft: number;
  pips: Pips;
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
      fill: NUM_LEFT_COLOR,
      stroke: NUM_LEFT_STROKE_COLOR,
      strokeWidth: NUM_LEFT_STROKE_WIDTH * globals.stage.height(),
      align: "center",
      x: 0,
      y: NUM_LEFT_Y * this.height(),
      width: this.width(),
      height: NUM_LEFT_SIZE * this.height(),
      fontSize: NUM_LEFT_SIZE * this.height(),
      fontFamily: FONT_FAMILY,
      fontStyle: "bold",
      text: this.numLeft.toString(),
      listening: false,
    });
    this.add(this.numLeftText);

    // The pips that show which cards can still be in the deck. The pips are drawn at the size of a
    // card image, so they scale with the deck.
    this.pips = HanabiCardInit.pips(globals.variant);
    const pipsScale = this.width() / CARD_W;
    const pipsGroup = new Konva.Group({
      scale: { x: pipsScale, y: pipsScale },
      listening: false,
    });
    pipsGroup.add(this.pips.suitPips, this.pips.rankPips);
    this.add(pipsGroup);

    // Right-click on the deck to highlight it with an arrow.
    this.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, "deck");
    });

    this.initDeckTooltip();
    this.initCursors();
    this.initEmpathy();
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
        type: "play",
        order: cardOrder,
      });
    } else if (draggedTo === "discardArea" && globals.variant.hasInverted) {
      // Inverted suit needs discard whenever play is available.
      const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
      const cardOrder = (totalCardsInDeck - 1) as CardOrder;
      turn.end({
        type: "discard",
        order: cardOrder,
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

      this.updateDeckTooltip();
      konvaTooltips.setActiveHover(this);
      setTimeout(() => {
        konvaTooltips.show(this);
      }, tooltips.TOOLTIP_DELAY_IN_MILLISECONDS);
    });
    this.on("mouseout touchend", () => {
      konvaTooltips.resetActiveHover(this);
      tooltips.close("#tooltip-deck");
    });

    this.updateDeckTooltip();
  }

  updateDeckTooltip(): void {
    // We store the content as a class variable so that it can be reused for the faded background
    // rectangle behind the card (so that the tooltip will work when there are 0 cards left in the
    // deck).
    this.tooltipContent = getTooltipContent();
    tooltips.setContent("#tooltip-deck", this.tooltipContent);
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
      if (this.canDragDeck() && event.evt.buttons === LEFT_MOUSE_BUTTON_HELD) {
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

  // Click and hold the left mouse button on the deck to show which cards can still be in it.
  initEmpathy(): void {
    this.on("mousedown", (event: Konva.KonvaEventObject<MouseEvent>) => {
      if (
        event.evt.buttons === LEFT_MOUSE_BUTTON_HELD
        && !event.evt.shiftKey
        && !event.evt.altKey
        && !event.evt.metaKey
        && !this.canDragDeck()
      ) {
        // The game info tooltip would cover the pips.
        konvaTooltips.resetActiveHover(this);
        tooltips.close("#tooltip-deck");
        this.setEmpathy(true);
      }
    });
    const stopEmpathy = () => {
      if (!globals.globalEmpathyEnabled) {
        this.setEmpathy(false);
      }
    };
    this.on("mouseup mouseleave", stopEmpathy);
  }

  setEmpathy(enabled: boolean): void {
    if (enabled === this.empathy) {
      return;
    }

    this.empathy = enabled;
    this.updateEmpathy();
  }

  /** Redraws the deck for the current empathy setting and game state. */
  updateEmpathy(): void {
    const showEmpathy = this.empathy && this.numLeft > 0;
    this.cardBack.image(
      globals.cardImages.get(showEmpathy ? UNKNOWN_CARD_IMAGE : "deck-back"),
    );
    this.numLeftText.visible(!showEmpathy);
    this.pips.suitPips.visible(showEmpathy);
    this.pips.rankPips.visible(showEmpathy);
    // The game info icon would cover the rank pips.
    globals.elements.gameInfoImage?.visible(!showEmpathy && this.numLeft > 0);
    globals.layers.arrow.batchDraw();

    if (showEmpathy && globals.state.visibleState !== undefined) {
      const possibilities = getDeckPossibilities(
        globals.state.visibleState.deck,
        globals.metadata,
      );
      for (const [suitIndex, pip] of this.pips.suitPipsMap) {
        const possible = possibilities.some(([s]) => s === suitIndex);
        updatePip(
          possible ? PipState.Visible : PipState.Eliminated,
          false,
          pip,
          this.pips.suitPipsXMap.get(suitIndex)!,
          this.pips.suitPipsPositiveMap.get(suitIndex),
        );
      }
      for (const [rank, pip] of this.pips.rankPipsMap) {
        const possible = possibilities.some(([, r]) => r === rank);
        updatePip(
          possible ? PipState.Visible : PipState.Eliminated,
          false,
          pip,
          this.pips.rankPipsXMap.get(rank)!,
        );
      }
    }

    globals.layers.card.batchDraw();
  }

  canDragDeck(): boolean {
    return globals.options.deckPlays && this.numLeft === 1 && isOurTurn();
  }

  setCount(count: number): void {
    this.numLeft = count;
    this.numLeftText.text(count.toString());
    this.numLeftText.fill(count === 0 ? EMPTY_DECK_COLOR : NUM_LEFT_COLOR);

    // When there are no cards left in the deck, remove the card-back and show a label that
    // indicates how many turns are left before the game ends.
    this.cardBack.visible(count > 0);
    const numLeftY = count === 0 ? EMPTY_DECK_NUM_LEFT_Y : NUM_LEFT_Y;
    this.numLeftText.y(numLeftY * this.height());
    globals.elements.deckTurnsRemainingLabel1!.visible(
      count === 0 && !globals.options.allOrNothing,
    );
    globals.elements.deckTurnsRemainingLabel2!.visible(
      count === 0 && !globals.options.allOrNothing,
    );

    // If the game ID is showing, we want to center the deck count between it and the other labels.
    if (count === 0 && globals.elements.gameIdLabel!.isVisible() === true) {
      this.nudgeCountDownwards();
    }

    this.updateEmpathy();
  }

  nudgeCountDownwards(): void {
    const nudgeAmount = GAME_ID_NUM_LEFT_NUDGE * this.height();
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

  const currentTable = globals.lobby.getTable(globals.lobby.joinedTableId);
  if (currentTable !== undefined) {
    content += tooltipField(
      "fas fa-signature",
      "Table name",
      escapeHtml(currentTable.settings.name),
    );

    const ownerName = getOwnerName(currentTable.ownerId) ?? "Unknown";
    content += tooltipField("fas fa-crown", "Owner", escapeHtml(ownerName));
  }

  if (globals.state.finished && globals.state.replay.gameId !== undefined) {
    content += tooltipField(
      "fas fa-fingerprint",
      "Database ID",
      `<strong>${globals.state.replay.gameId}</strong>`,
    );
  }

  if (globals.state.finished || globals.metadata.customSeed) {
    const { seed } = globals.metadata;
    const suffix = seed === undefined ? " (JSON game)" : "";
    content += tooltipField(
      "fas fa-seedling",
      "Seed",
      `<strong>${escapeHtml(seed ?? "n/a")}</strong>${suffix}`,
    );
  }

  if (globals.state.finished && globals.state.datetimeFinished !== undefined) {
    const datetimeFinishedDate = new Date(globals.state.datetimeFinished);
    const formattedDatetimeFinished =
      dateTimeFormatter.format(datetimeFinishedDate);
    content += tooltipField(
      "fas fa-calendar",
      "Date Played",
      `<strong>${formattedDatetimeFinished}</strong>`,
    );
  }

  // "datetimeStarted" and "datetimeFinished" are initialized to strings during the "init" command,
  // so they should never be undefined.
  if (
    globals.state.datetimeStarted !== undefined
    && globals.state.datetimeFinished !== undefined
  ) {
    const startedDate = new Date(globals.state.datetimeStarted);
    const finishedDate = globals.state.finished
      ? new Date(globals.state.datetimeFinished)
      : new Date();
    const elapsedMilliseconds = finishedDate.getTime() - startedDate.getTime();
    const clockString = millisecondsToClockString(elapsedMilliseconds);
    content += tooltipField(
      "fas fa-stopwatch",
      "Game Length",
      `<strong>${clockString}</strong>`,
    );
  }

  const sharedReplay = globals.state.replay.shared;
  if (sharedReplay !== undefined) {
    const startedDate = new Date(sharedReplay.datetimeReplayStarted);
    const elapsedMilliseconds = Date.now() - startedDate.getTime();
    const clockString = millisecondsToClockString(elapsedMilliseconds);
    content += tooltipField(
      "fas fa-hourglass-half",
      "Shared Replay Length",
      `<strong>${clockString}</strong>`,
    );
  }

  content += tooltipField(
    "fas fa-rainbow",
    "Variant",
    `<strong>${globals.variant.name}</strong>`,
  );

  const { timeControl } = globals.options;
  if (timeControl !== undefined) {
    const timeBase = secondsToClockString(timeControl.baseSeconds);
    const timePerTurn = secondsToClockString(timeControl.perTurnSeconds);
    content += tooltipItem(
      OptionIcons.Timed,
      `Timed: ${timeBase} + ${timePerTurn}`,
    );
  }

  if (globals.options.speedrun) {
    content += tooltipItem(OptionIcons.Speedrun, "Speedrun");
  }

  if (globals.options.deckPlays) {
    content += tooltipItem(OptionIcons.DeckPlays, "Bottom-Deck Blind Plays");
  }

  if (globals.options.emptyClues) {
    content += tooltipItem(OptionIcons.EmptyClues, "Empty Clues");
  }

  if (globals.options.oneExtraCard) {
    content += tooltipItem(OptionIcons.OneExtraCard, "One Extra Card");
  }

  if (globals.options.oneLessCard) {
    content += tooltipItem(OptionIcons.OneLessCard, "One Less Card");
  }

  if (globals.options.allOrNothing) {
    content += tooltipItem(OptionIcons.AllOrNothing, "All or Nothing");
  }

  if (globals.options.detrimentalCharacters) {
    content += tooltipItem(
      OptionIcons.DetrimentalCharacters,
      "Detrimental Characters",
    );
  }

  content += "</ul>";

  return content;
}

function tooltipItem(iconClass: string, html: string) {
  return `<li><span class="game-tooltips-icon"><i class="${iconClass}"></i></span>${html}</li>`;
}

function tooltipField(iconClass: string, label: string, valueHtml: string) {
  return tooltipItem(iconClass, `${label}: &nbsp;${valueHtml}`);
}
