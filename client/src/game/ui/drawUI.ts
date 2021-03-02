// This function draws the UI when going into a game for the first time

import Konva from "konva";
import * as debug from "../../debug";
import { parseIntSafe } from "../../misc";
import * as modals from "../../modals";
import * as deck from "../rules/deck";
import * as variantRules from "../rules/variant";
import { colorClue, rankClue } from "../types/Clue";
import { STACK_BASE_RANK } from "../types/constants";
import ReplayArrowOrder from "../types/ReplayArrowOrder";
import * as arrows from "./arrows";
import backToLobby from "./backToLobby";
import ButtonGroup from "./ButtonGroup";
import CardLayout from "./CardLayout";
import ClueLog from "./ClueLog";
import * as clues from "./clues";
import ColorButton from "./ColorButton";
import { CARD_ANIMATION_LENGTH, LABEL_COLOR } from "./constants";
import Arrow from "./controls/Arrow";
import Button from "./controls/Button";
import CheckButton from "./controls/CheckButton";
import CurrentPlayerArea from "./controls/CurrentPlayerArea";
import FitText from "./controls/FitText";
import ImageWithTooltip from "./controls/ImageWithTooltip";
import PlayerButton from "./controls/PlayerButton";
import RectWithTooltip from "./controls/RectWithTooltip";
import SlidableGroup from "./controls/SlidableGroup";
import StrikeSquare from "./controls/StrikeSquare";
import StrikeX from "./controls/StrikeX";
import TextWithTooltip from "./controls/TextWithTooltip";
import TimerDisplay from "./controls/TimerDisplay";
import * as cursor from "./cursor";
import Deck from "./Deck";
import drawHands from "./drawHands";
import drawReplayArea from "./drawReplayArea";
import FullActionLog from "./FullActionLog";
import getCardOrStackBase from "./getCardOrStackBase";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import * as hypothetical from "./hypothetical";
import MultiFitText from "./MultiFitText";
import PlayStack from "./PlayStack";
import RankButton from "./RankButton";
import * as replay from "./replay";
import * as stats from "./stats";
import * as timer from "./timer";
import * as tooltips from "./tooltips";

interface Values {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

// Variables
let winW: number;
let winH: number;
let basicTextLabel: Konva.Text;
let basicNumberLabel: Konva.Text;
let actionLogValues: Values;
let playAreaValues: Values;
let cardWidth;
let cardHeight;
let bottomLeftButtonValues: Values;
let deckValues: Values;
let scoreAreaValues: Values;
let clueAreaValues: Values;
let lowerClueAreaValues: Values;
let clueLogValues: Values;
let giveClueValues: Values;
let spectatorsLabelValues: Values;

export default function drawUI(): void {
  // Constants
  winW = globals.stage.width();
  winH = globals.stage.height();

  // Create the various Konva layers upon which all graphic elements reside
  drawBackground();

  // We can reuse some UI elements
  initReusableObjects();

  // The top-left
  drawActionLog();
  drawPlayStacks();

  // The bottom-left
  drawBottomLeftButtons();
  drawDeck();
  drawScoreArea();
  drawSpectators();
  drawSharedReplay();
  drawYourTurn();

  // The middle column
  drawHands(winW, winH);

  // The right column
  drawClueLog();
  drawStatistics();
  drawDiscardArea();
  drawDiscardStacks();

  // Conditional elements
  drawArrows();
  drawTimers();
  drawClueArea();
  drawCurrentPlayerArea();
  drawPreplayArea();
  drawReplayArea(winW, winH);
  drawHypotheticalArea();
  drawPauseArea();
  drawExtraAnimations();

  // Just in case, delete all existing layers
  globals.stage.getLayers().each((layer) => {
    layer.remove();
  });

  for (const layer of Object.values(globals.layers)) {
    globals.stage.add(layer);
  }
}

function drawBackground() {
  // Draw a green background behind everything
  const background = new Konva.Image({
    x: 0,
    y: 0,
    width: winW,
    height: winH,
    image: globals.imageLoader!.get("background")!,
    listening: true,
  });
  background.on("mousemove", () => {
    cursor.set("default");
  });

  globals.layers.UI.add(background);

  // The dark overlay that appears when you click the action log is clicked,
  // when a player's name is clicked, when the game is paused, etc.
  globals.elements.stageFade = new Konva.Rect({
    x: 0,
    y: 0,
    width: winW,
    height: winH,
    opacity: 0.3,
    fill: "black",
    visible: false,
    listening: true,
  });
  globals.layers.UI2.add(globals.elements.stageFade);
}

function initReusableObjects() {
  // Create some default objects
  basicTextLabel = new Konva.Text({
    x: 0.01 * winW,
    y: 0.01 * winH,
    width: 0.11 * winW,
    height: 0.03 * winH,
    fontSize: 0.026 * winH,
    fontFamily: "Verdana",
    align: "left",
    text: "Placeholder text",
    fill: LABEL_COLOR,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    listening: false,
  });
  basicNumberLabel = basicTextLabel.clone() as Konva.Text;
  basicNumberLabel.text("0");
  basicNumberLabel.width(0.03 * winW);
}

function drawActionLog() {
  if (!globals.lobby.settings.keldonMode) {
    actionLogValues = {
      x: 0.01,
      y: 0.01,
      w: 0.4,
      h: 0.25,
    };
  } else {
    actionLogValues = {
      x: 0.2,
      y: 0.235,
      w: 0.4,
      h: 0.098,
    };
  }

  const actionLogGroup = new Konva.Group({
    x: actionLogValues.x * winW,
    y: actionLogValues.y * winH,
    listening: false,
  });
  globals.layers.UI.add(actionLogGroup);

  // The faded rectangle around the action log
  const actionLogRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: actionLogValues.w! * winW,
    height: actionLogValues.h! * winH,
    fill: "black",
    opacity: 0.3,
    cornerRadius: 0.01 * winH,
    listening: true,
  });
  actionLogGroup.add(actionLogRect);
  actionLogRect.on("click tap", () => {
    globals.elements.fullActionLog!.show();
    globals.elements.stageFade!.show();
    globals.layers.UI2.batchDraw();

    globals.elements.stageFade!.on("click tap", () => {
      globals.elements.stageFade!.off("click tap");
      globals.elements.fullActionLog!.hide();
      globals.elements.stageFade!.hide();
      globals.layers.UI2.batchDraw();
    });
  });

  // The action log
  let maxLines = 8;
  if (globals.lobby.settings.keldonMode) {
    maxLines = 3;
  }
  globals.elements.actionLog = new MultiFitText(
    {
      align: "center",
      fontSize: 0.028 * winH,
      fontFamily: "Verdana",
      fill: LABEL_COLOR,
      shadowColor: "black",
      shadowBlur: 10,
      shadowOffset: {
        x: 0,
        y: 0,
      },
      shadowOpacity: 0.9,
      x: 0.01 * winW,
      y: 0.003 * winH,
      width: (actionLogValues.w! - 0.02) * winW,
      height: (actionLogValues.h! - 0.003) * winH,
      listening: false,
    },
    maxLines,
  );
  actionLogGroup.add((globals.elements.actionLog as unknown) as Konva.Group);

  // The full action log (that appears when you click on the action log)
  globals.elements.fullActionLog = new FullActionLog(winW, winH);
  globals.layers.UI2.add(
    (globals.elements.fullActionLog as unknown) as Konva.Group,
  );
}

function drawPlayStacks() {
  // Local variables
  let yOffset;

  if (globals.variant.suits.length === 6 || globals.variant.showSuitNames) {
    cardWidth = 0.06;
    cardHeight = 0.151;
    yOffset = 0.019;
  } else {
    // 3, 4, or 5 stacks
    cardWidth = 0.075;
    cardHeight = 0.189;
    yOffset = 0;
  }
  const playStackValues = {
    x: 0.183,
    y: 0.345 + yOffset,
    w: 0, // Is set below
    spacing: 0.015,
  };
  if (globals.variant.showSuitNames) {
    playStackValues.y -= 0.018;
  }
  if (!globals.lobby.settings.keldonMode) {
    playStackValues.x = actionLogValues.x;
    playStackValues.y = actionLogValues.y + actionLogValues.h! + 0.02;
    if (globals.variant.suits.length > 4) {
      playStackValues.spacing = actionLogValues.w!;
      playStackValues.spacing -= cardWidth * globals.variant.suits.length;
      playStackValues.spacing /= globals.variant.suits.length - 1;
    } else {
      playStackValues.spacing = 0.006;
    }
  }
  playStackValues.w = cardWidth * globals.variant.suits.length;
  playStackValues.w +=
    playStackValues.spacing * (globals.variant.suits.length - 1);

  // Variants with less than 5 stacks will be left-aligned instead of centered
  // unless we manually adjust them
  if (
    (globals.variant.suits.length === 4 && !globals.variant.showSuitNames) ||
    (globals.variant.suits.length === 5 &&
      globals.variant.showSuitNames &&
      globals.lobby.settings.keldonMode)
  ) {
    playStackValues.x += (cardWidth + playStackValues.spacing) / 2;
  } else if (
    globals.variant.suits.length === 4 &&
    globals.variant.showSuitNames
  ) {
    playStackValues.x += cardWidth + playStackValues.spacing;
  } else if (
    globals.variant.suits.length === 3 &&
    !globals.variant.showSuitNames
  ) {
    playStackValues.x += ((cardWidth + playStackValues.spacing) / 2) * 2;
  } else if (
    globals.variant.suits.length === 3 &&
    globals.variant.showSuitNames
  ) {
    playStackValues.x += (cardWidth + playStackValues.spacing) * 1.5;
  }

  // Make the invisible "hole" play stack for "Throw It in a Hole" variants
  // (centered in the middle of the rest of the stacks)
  if (variantRules.isThrowItInAHole(globals.variant) && globals.state.playing) {
    const playStackX =
      playStackValues.x + playStackValues.w / 2 - cardWidth / 2;
    const playStack = new PlayStack({
      x: playStackX * winW,
      y: playStackValues.y * winH,
      width: cardWidth * winW,
      height: cardHeight * winH,
      listening: false,
    });
    globals.elements.playStacks.set("hole", playStack);
    globals.layers.card.add((playStack as unknown) as Konva.Group);
  }

  for (let i = 0; i < globals.variant.suits.length; i++) {
    const suit = globals.variant.suits[i];

    // Make the play stack for this suit
    const playStackX =
      playStackValues.x + (cardWidth + playStackValues.spacing) * i;
    const playStack = new PlayStack({
      x: playStackX * winW,
      y: playStackValues.y * winH,
      width: cardWidth * winW,
      height: cardHeight * winH,
      listening: false,
    });
    globals.elements.playStacks.set(suit, playStack);
    globals.layers.card.add((playStack as unknown) as Konva.Group);

    // Add the stack base to the play stack
    const order = deck.totalCards(globals.variant) + i;
    // Stack bases use card orders after the final card in the deck
    const stackBase = new HanabiCard(
      order,
      i,
      STACK_BASE_RANK,
      globals.variant,
    );
    globals.stackBases.push(stackBase);

    playStack.addChild(stackBase.layout);

    // Draw the suit name next to each suit
    // (a text description of the suit)
    if (globals.variant.showSuitNames) {
      let text = suit.displayName;
      if (
        globals.lobby.settings.colorblindMode &&
        suit.clueColors.length === 2
      ) {
        const colorList = suit.clueColors
          .map((color) => color.abbreviation)
          .join("/");
        text += ` [${colorList}]`;
      }
      if (variantRules.isUpOrDown(globals.variant)) {
        text = "";
      }
      if (variantRules.isSudoku(globals.variant)) {
        // Show the initial rank
        text += " [x]";
      }
      const suitLabelText = new FitText({
        x:
          (playStackValues.x -
            0.01 +
            (cardWidth + playStackValues.spacing) * i) *
          winW,
        y: (playStackValues.y + 0.155) * winH,
        width: 0.08 * winW,
        height: 0.051 * winH,
        fontSize: 0.02 * winH,
        fontFamily: "Verdana",
        align: "center",
        text,
        fill: LABEL_COLOR,
        listening: false,
      });
      globals.layers.UI.add(suitLabelText);
      globals.elements.suitLabelTexts.push(suitLabelText);
    }
  }

  // This is the invisible rectangle that players drag cards to in order to play them
  // Make it a little big bigger than the stacks
  const overlap = 0.03;
  let w = cardWidth * globals.variant.suits.length;
  w += playStackValues.spacing * (globals.variant.suits.length - 1);
  playAreaValues = {
    x: playStackValues.x,
    y: playStackValues.y,
    w,
    h: cardHeight,
  };
  globals.elements.playArea = new Konva.Rect({
    x: (playAreaValues.x - overlap) * winW,
    y: (playAreaValues.y - overlap) * winH,
    width: (playAreaValues.w! + overlap * 2) * winW,
    height: (playAreaValues.h! + overlap * 2) * winH,
    listening: false,
  });
}

function drawDiscardStacks() {
  // Local variables
  let discardStackSpacing;
  if (globals.variant.suits.length === 6) {
    discardStackSpacing = 0.04;
  } else {
    // 3, 4, or 5 stacks
    discardStackSpacing = 0.05;
  }

  for (let i = 0; i < globals.variant.suits.length; i++) {
    const suit = globals.variant.suits[i];

    // Make the discard stack for this suit
    const discardStack = new CardLayout({
      x: 0.81 * winW,
      y: (0.61 + discardStackSpacing * i) * winH,
      width: 0.17 * winW,
      height: 0.17 * winH,
      listening: false,
    });
    globals.elements.discardStacks.set(suit, discardStack);
    globals.layers.card.add((discardStack as unknown) as Konva.Group);
  }
}

function drawBottomLeftButtons() {
  bottomLeftButtonValues = {
    x: 0.01,
    y: 0.8,
    w: 0.07,
    h: 0.0563,
  };

  // The toggle in-game replay button
  const replayButton = new Button(
    {
      x: bottomLeftButtonValues.x * winW,
      y: bottomLeftButtonValues.y * winH,
      width: bottomLeftButtonValues.w! * winW,
      height: bottomLeftButtonValues.h! * winH,
      visible: !globals.state.finished,
    },
    [globals.imageLoader!.get("replay")!],
  );
  replayButton.on("click tap", () => {
    if (globals.state.replay.active) {
      replay.exit();
    } else {
      replay.enter();
    }
  });
  globals.layers.UI.add((replayButton as unknown) as Konva.Group);
  replayButton.tooltipName = "replay";
  replayButton.tooltipContent =
    "Toggle the in-game replay, where you can rewind the game to see what happened on a specific turn.";
  tooltips.init(replayButton, true, false);
  globals.elements.replayButton = replayButton;

  // The restart button
  // (to go into a new game with the same settings as the current shared replay)
  const restartButton = new Button({
    x: bottomLeftButtonValues.x * winW,
    y: bottomLeftButtonValues.y * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: bottomLeftButtonValues.h! * winH,
    text: "Restart",
    visible: false,
  });
  globals.layers.UI.add((restartButton as unknown) as Konva.Group);
  restartButton.on("click tap", () => {
    if (
      globals.options.speedrun ||
      debug.amTestUser(globals.metadata.ourUsername) ||
      globals.lobby.totalGames >= 1000 ||
      window.confirm("Are you sure you want to restart the game?")
    ) {
      globals.lobby.conn!.send("tableRestart", {
        tableID: globals.lobby.tableID,
      });
    }
  });
  restartButton.tooltipName = "restart";
  restartButton.tooltipContent =
    "Automatically go into a new game with the current members of the shared replay (using the same game settings as this one).";
  tooltips.init(restartButton, true, false);
  globals.elements.restartButton = restartButton;

  // The chat button
  const chatButton = new Button({
    x: bottomLeftButtonValues.x * winW,
    y: (bottomLeftButtonValues.y + bottomLeftButtonValues.h! + 0.01) * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: bottomLeftButtonValues.h! * winH,
    text: "💬",
    visible: !globals.state.finished || globals.state.replay.shared !== null,
  });
  globals.layers.UI.add((chatButton as unknown) as Konva.Group);
  chatButton.on("click tap", () => {
    globals.game!.chat.toggle();
  });
  chatButton.tooltipName = "chat";
  chatButton.tooltipContent = "Toggle the in-game chat.";
  tooltips.init(chatButton, true, false);
  globals.elements.chatButton = chatButton;

  // The lobby button (which takes the user back to the lobby)
  const lobbyButtonValues = {
    x: bottomLeftButtonValues.x,
    y: bottomLeftButtonValues.y + 2 * bottomLeftButtonValues.h! + 0.02,
    h: bottomLeftButtonValues.h,
  };
  const lobbyButton = new Button({
    x: lobbyButtonValues.x * winW,
    y: lobbyButtonValues.y * winH,
    width: bottomLeftButtonValues.w! * winW,
    height: lobbyButtonValues.h! * winH,
    text: "Lobby",
  });
  globals.layers.UI.add((lobbyButton as unknown) as Konva.Group);
  lobbyButton.on("click tap", lobbyButtonClick);
  lobbyButton.tooltipName = "lobby";
  lobbyButton.tooltipContent = "Return to the lobby.";
  tooltips.init(lobbyButton, true, false);
  globals.elements.lobbyButton = lobbyButton;
}

function drawDeck() {
  deckValues = {
    x: bottomLeftButtonValues.x + bottomLeftButtonValues.w! + 0.01,
    y: bottomLeftButtonValues.y,
    w: 0.075,
    h: 0.189,
  };

  // This is the faded rectangle that is hidden until all of the deck has been depleted
  // (this has to be separate from the Deck object since it exists on a separate layer)
  const deckRect = new RectWithTooltip({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    fill: "black",
    opacity: 0.2,
    cornerRadius: 0.006 * winW,
    listening: true,
  });
  globals.layers.UI.add(deckRect);

  // Near the top of the deck, draw the database ID for the respective game
  // (in an ongoing game, this will not show)
  globals.elements.gameIDLabel = new FitText({
    text: `ID: ${globals.state.replay.databaseID ?? 0}`,
    x: deckValues.x * winW,
    y: (deckValues.y + 0.01) * winH,
    width: deckValues.w! * winW,
    fontFamily: "Verdana",
    fill: "white",
    align: "center",
    fontSize: 0.019 * winH,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    visible: globals.state.finished && globals.state.replay.databaseID !== null,
    listening: false,
  });
  // We draw the label on the arrow layer because it is on top of the card but
  // not on top of the black second layer
  globals.layers.arrow.add(globals.elements.gameIDLabel);

  // At the bottom of the deck, draw a thing hinting that the user can mouse over the deck for
  // detailed information about the current game
  globals.elements.gameInfoImage = new Konva.Image({
    x: (deckValues.x + 0.004) * winW,
    y: (deckValues.y + 0.161) * winH,
    width: deckValues.w! * 0.15 * winW,
    height: deckValues.w! * 0.15 * winW,
    image: globals.imageLoader!.get("question-mark")!,
    shadowColor: "black",
    shadowBlur: 2,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
  });
  // This goes on the same layer as the gameIDLabel
  globals.layers.arrow.add(globals.elements.gameInfoImage);

  globals.elements.deck = new Deck({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    cardBack: "deck-back",
    suits: globals.variant.suits,
    listening: false,
  });
  globals.layers.card.add((globals.elements.deck as unknown) as Konva.Group);

  // Also apply the card deck tooltip to the faded background rectangle
  deckRect.tooltipName = "deck";
  deckRect.tooltipContent = globals.elements.deck.tooltipContent;
  tooltips.init(deckRect, true, true);

  // When there are no cards left in the deck,
  // show a label that indicates how many turns are left before the game ends
  const xOffset = 0.017;
  const fontSize = 0.025;
  globals.elements.deckTurnsRemainingLabel1 = basicTextLabel.clone({
    text: "Turns",
    x: (deckValues.x + xOffset) * winW,
    y: (deckValues.y + deckValues.h! - 0.07) * winH,
    fontSize: fontSize * winH,
    visible: false,
  }) as Konva.Text;
  globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel1);
  globals.elements.deckTurnsRemainingLabel2 = basicTextLabel.clone({
    text: "left: #",
    x: (deckValues.x + xOffset) * winW,
    y: (deckValues.y + deckValues.h! - 0.04) * winH,
    fontSize: fontSize * winH,
    visible: false,
  }) as Konva.Text;
  globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel2);

  // This is a yellow border around the deck that will appear when only one card is left
  // (if the "Bottom-Deck Blind-Plays" game option is enabled)
  globals.elements.deckPlayAvailableLabel = new Konva.Rect({
    x: deckValues.x * winW,
    y: deckValues.y * winH,
    width: deckValues.w! * winW,
    height: deckValues.h! * winH,
    stroke: "yellow",
    cornerRadius: 0.01 * winH,
    strokeWidth: 0.01056 * winH,
    visible: false,
  });
  globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);
}

function drawScoreArea() {
  // The rectangle that holds the turn, score, and clue count
  const scoreAreaHeight = 0.18;
  scoreAreaValues = {
    x: 0.66,
    y: deckValues.y + (deckValues.h! - scoreAreaHeight) / 2,
    w: 0.13,
    h: scoreAreaHeight,
  };
  if (!globals.lobby.settings.keldonMode) {
    scoreAreaValues.x = deckValues.x + deckValues.w! + 0.01;
    scoreAreaValues.y = 0.81;
  }
  globals.elements.scoreArea = new Konva.Group({
    x: scoreAreaValues.x * winW,
    y: scoreAreaValues.y * winH,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.scoreArea);

  // The border that surrounds the score area when the team is at X clues
  globals.elements.scoreAreaBorder = new Konva.Rect({
    x: scoreAreaValues.x * winW,
    y: scoreAreaValues.y * winH,
    width: scoreAreaValues.w! * winW,
    height: scoreAreaValues.h! * winH,
    stroke: "#df1c2d",
    strokeWidth: 0.003 * winW,
    cornerRadius: 0.01 * winW,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.scoreAreaBorder);

  // The faded rectangle around the score area
  const scoreAreaRect = new Konva.Rect({
    x: 0,
    y: 0,
    width: scoreAreaValues.w! * winW,
    height: scoreAreaValues.h! * winH,
    fill: "black",
    opacity: 0.2,
    cornerRadius: 0.01 * winW,
    listening: false,
  });
  globals.elements.scoreArea.add(scoreAreaRect);

  const labelX = 0.02;
  const labelSpacing = 0.06;

  const turnTextLabel = basicTextLabel.clone({
    text: "Turn",
    x: labelX * winW,
    y: 0.01 * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(turnTextLabel);
  turnTextLabel.on("click", (event: Konva.KonvaEventObject<MouseEvent>) => {
    // "event.evt.buttons" is always 0 here
    if (event.evt.button === 0) {
      // Left-click
      // We want to be able to left-click the turn number to go to a specific turn in the replay
      replay.promptTurn();
    } else if (event.evt.button === 2) {
      // Right-click
      arrows.click(event, ReplayArrowOrder.Clues);
    }
  });
  turnTextLabel.on("dbltap", replay.promptTurn);

  globals.elements.turnNumberLabel = basicNumberLabel.clone({
    text: "1",
    x: (labelX + labelSpacing) * winW,
    y: 0.01 * winH,
    listening: true,
  }) as TextWithTooltip;
  globals.elements.scoreArea.add(globals.elements.turnNumberLabel);
  globals.elements.turnNumberLabel.tooltipName = "turn-number";
  globals.elements.turnNumberLabel.on(
    "click",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      // "event.evt.buttons" is always 0 here
      if (event.evt.button === 0) {
        // Left-click
        // We want to be able to left-click the turn number to go to a specific turn in the replay
        replay.promptTurn();
      } else if (event.evt.button === 2) {
        // Right-click
        arrows.click(event, ReplayArrowOrder.Clues);
      }
    },
  );
  globals.elements.turnNumberLabel.on("tap", replay.promptTurn);

  globals.elements.scoreTextLabel = basicTextLabel.clone({
    text: "Score",
    x: labelX * winW,
    y: 0.045 * winH,
    listening: true,
    visible:
      !variantRules.isThrowItInAHole(globals.variant) || !globals.state.playing,
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.scoreTextLabel);
  globals.elements.scoreTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Score);
    },
  );

  globals.elements.scoreNumberLabel = basicNumberLabel.clone({
    text: "0",
    x: (labelX + labelSpacing) * winW,
    y: 0.045 * winH,
    listening: true,
    visible:
      !variantRules.isThrowItInAHole(globals.variant) || !globals.state.playing,
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.scoreNumberLabel);
  globals.elements.scoreNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Score);
    },
  );

  globals.elements.maxScoreNumberLabel = basicNumberLabel.clone({
    text: "",
    x: (labelX + labelSpacing) * winW,
    y: 0.05 * winH,
    fontSize: 0.017 * winH,
    listening: true,
    visible:
      !variantRules.isThrowItInAHole(globals.variant) || !globals.state.playing,
  }) as Konva.Text;
  globals.elements.scoreArea.add(globals.elements.maxScoreNumberLabel);
  globals.elements.maxScoreNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.MaxScore);
    },
  );

  if (variantRules.isThrowItInAHole(globals.variant) && globals.state.playing) {
    globals.elements.playsTextLabel = basicTextLabel.clone({
      text: "Plays",
      x: labelX * winW,
      y: 0.045 * winH,
      listening: true,
    }) as Konva.Text;
    globals.elements.scoreArea.add(globals.elements.playsTextLabel);
    globals.elements.playsTextLabel.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        arrows.click(event, ReplayArrowOrder.Clues);
      },
    );

    globals.elements.playsNumberLabel = basicNumberLabel.clone({
      text: "0",
      x: (labelX + labelSpacing) * winW,
      y: 0.045 * winH,
      listening: true,
    }) as Konva.Text;
    globals.elements.scoreArea.add(globals.elements.playsNumberLabel);
    globals.elements.playsNumberLabel.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        arrows.click(event, ReplayArrowOrder.Clues);
      },
    );
  }

  const cluesTextLabel = basicTextLabel.clone({
    text: "Clues",
    x: labelX * winW,
    y: 0.08 * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(cluesTextLabel);
  cluesTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Clues);
    },
  );

  const cluesNumberLabel = basicNumberLabel.clone({
    text: "8",
    x: (labelX + labelSpacing) * winW,
    y: 0.08 * winH,
    listening: true,
  }) as Konva.Text;
  globals.elements.scoreArea.add(cluesNumberLabel);
  globals.elements.cluesNumberLabel = cluesNumberLabel;
  cluesNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Clues);
    },
  );

  // Add an animation to signify that discarding at 8 clues is illegal
  globals.elements.cluesNumberLabelPulse = new Konva.Tween({
    node: cluesNumberLabel,
    fontSize: 0.04 * winH,
    fill: "#df1c2d",
    offsetX: 0.001 * winH,
    offsetY: 0.01 * winH,
    duration: CARD_ANIMATION_LENGTH,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    easing: Konva.Easings.EaseInOut,
    onFinish: () => {
      if (
        globals.elements.cluesNumberLabelPulse !== undefined &&
        globals.elements.cluesNumberLabelPulse !== null
      ) {
        globals.elements.cluesNumberLabelPulse.reverse();
      }
    },
  });
  globals.elements.cluesNumberLabelPulse.anim.addLayer(globals.layers.UI);

  // Draw the 3 strike (bomb) black squares / X's
  function strikeClick(
    this: StrikeSquare | StrikeX,
    event: Konva.KonvaEventObject<MouseEvent>,
  ) {
    if (variantRules.isThrowItInAHole(globals.variant)) {
      return;
    }

    switch (event.evt.button) {
      case 0: {
        // Left-click
        // Left-clicking a strike X or a strike square takes us to the turn that the strike happened
        const { strikes } = globals.state.ongoingGame;
        const strike = strikes[this.num];
        if (strike === undefined) {
          // There is no strike yet that corresponds to this square / X, so do nothing
          return;
        }

        replay.goToSegment(strike.segment, true);

        // Highlight the card
        const card = getCardOrStackBase(strike.order);
        arrows.toggle(card.state.order, true);

        break;
      }

      case 2: {
        // Right-click
        // Right-clicking a strike X or a strike square shows an arrow over the strike square
        let order;
        if (this.num === 0) {
          order = ReplayArrowOrder.Strike1;
        } else if (this.num === 1) {
          order = ReplayArrowOrder.Strike2;
        } else if (this.num === 2) {
          order = ReplayArrowOrder.Strike3;
        } else {
          throw new Error(`Unknown strike number of ${this.num}".`);
        }

        arrows.click(event, order);

        break;
      }

      default: {
        break;
      }
    }
  }
  for (let i = 0; i < 3; i++) {
    // Draw the background square
    const strikeSquare = new StrikeSquare(
      {
        x: (0.01 + 0.04 * i) * winW,
        y: 0.115 * winH,
        width: 0.03 * winW,
        height: 0.053 * winH,
        stroke: "black",
        strokeWidth: 0.00211 * winH,
        cornerRadius: 0.005 * winW,
        listening: true,
      },
      i,
    );
    globals.elements.scoreArea.add(strikeSquare);
    globals.elements.strikeSquares.push(strikeSquare);

    // Draw the red X that indicates the strike
    const strikeX = new StrikeX(
      {
        x: (0.015 + 0.04 * i) * winW,
        y: 0.125 * winH,
        width: 0.02 * winW,
        height: 0.036 * winH,
        image: globals.imageLoader!.get("x")!,
        opacity: 0,
        listening: true,
      },
      i,
    );
    globals.elements.scoreArea.add(strikeX);
    globals.elements.strikeXs.push(strikeX);

    // For variants where the strikes are hidden, draw a "?"
    if (
      variantRules.isThrowItInAHole(globals.variant) &&
      globals.state.playing
    ) {
      const questionMarkLabel = basicTextLabel.clone({
        text: "?",
        fontSize: 0.032 * winH,
        x: (0.0205 + 0.04 * i) * winW,
        y: 0.128 * winH,
        listening: false,
      }) as Konva.Text;
      globals.elements.scoreArea.add(questionMarkLabel);
      globals.elements.questionMarkLabels.push(questionMarkLabel);
    }

    // Handle the tooltips
    strikeSquare.tooltipName = "strikes";
    strikeX.tooltipName = strikeSquare.tooltipName;
    strikeSquare.tooltipContent =
      "This shows how many strikes (bombs) the team currently has.";
    strikeX.tooltipContent = strikeSquare.tooltipContent;
    tooltips.init(strikeSquare, true, false);
    tooltips.init(strikeX, true, false);

    // Click on the strike to go to the turn that the strike happened, if any
    // (and highlight the card that misplayed)
    strikeSquare.on("click tap", strikeClick);
    strikeX.on("click tap", strikeClick);
  }

  // The terminate button (which immediately ends the current game)
  // This is placed on top of the 3rd strike
  if (globals.state.playing) {
    globals.elements.strikeSquares[2].hide();
    globals.elements.strikeXs[2].hide();
    const questionMarkLabel = globals.elements.questionMarkLabels[2];
    if (questionMarkLabel !== undefined) {
      questionMarkLabel.hide();
    }

    const terminateButton = new Button(
      {
        x: (0.01 + 0.04 * 2) * winW,
        y: 0.115 * winH,
        width: 0.03 * winW,
        height: 0.053 * winH,
        visible: globals.state.playing,
      },
      [globals.imageLoader!.get("skull")!],
    );
    globals.elements.scoreArea.add((terminateButton as unknown) as Konva.Group);
    terminateButton.on("click tap", () => {
      if (
        globals.options.speedrun ||
        debug.amTestUser(globals.metadata.ourUsername) ||
        globals.lobby.totalGames >= 1000 ||
        window.confirm("Are you sure you want to terminate the game?")
      ) {
        globals.lobby.conn!.send("tableTerminate", {
          tableID: globals.lobby.tableID,
        });
      }
    });
    terminateButton.tooltipName = "kill";
    terminateButton.tooltipContent =
      "Terminate the game, ending it immediately.";
    tooltips.init(terminateButton, true, false);
    globals.elements.terminateButton = terminateButton;
  }
}

// The "eyes" symbol to show that one or more people are spectating the game
function drawSpectators() {
  // Position it to the bottom-left of the score area
  spectatorsLabelValues = {
    x: scoreAreaValues.x - 0.037,
    y: scoreAreaValues.y + 0.09,
  };
  if (!globals.lobby.settings.keldonMode) {
    // Position it to the bottom-right of the score area
    spectatorsLabelValues.x = scoreAreaValues.x + scoreAreaValues.w! + 0.01;
  }
  const imageSize = 0.02;
  const spectatorsLabel = new ImageWithTooltip({
    x: (spectatorsLabelValues.x + 0.005) * winW,
    y: spectatorsLabelValues.y * winH,
    width: imageSize * winW,
    height: imageSize * winW,
    // (this is not a typo; we want it to have the same width and height)
    align: "center",
    image: globals.imageLoader!.get("eyes")!,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    visible: false,
    listening: true,
  });
  globals.layers.UI.add(spectatorsLabel);
  spectatorsLabel.tooltipName = "spectators";
  spectatorsLabel.tooltipContent = ""; // This will be filled in later by the "spectators" command
  tooltips.init(spectatorsLabel, false, true);
  globals.elements.spectatorsLabel = spectatorsLabel;

  globals.elements.spectatorsNumLabel = new Konva.Text({
    x: spectatorsLabelValues.x * winW,
    y: (spectatorsLabelValues.y + 0.04) * winH,
    width: 0.03 * winW,
    height: 0.03 * winH,
    fontSize: 0.03 * winH,
    fontFamily: "Verdana",
    align: "center",
    text: "0",
    fill: LABEL_COLOR,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.spectatorsNumLabel);
}

// The "crown" symbol to show that we are in a shared replay
function drawSharedReplay() {
  const sharedReplayLeaderLabelValues = {
    x: spectatorsLabelValues.x,
    y: spectatorsLabelValues.y - 0.06,
  };

  // A circle around the crown indicates that we are the current replay leader
  // (we want the icon to be on top of this so that it does not interfere with mouse events)
  globals.elements.sharedReplayLeaderCircle = new Konva.Circle({
    x: (sharedReplayLeaderLabelValues.x + 0.015) * winW,
    y: (sharedReplayLeaderLabelValues.y + 0.015) * winH,
    radius: 0.028 * winH,
    stroke: "#ffe03b", // Yellow
    strokeWidth: 0.00211 * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.sharedReplayLeaderCircle);

  // The crown
  const size = 0.025 * winW;
  const sharedReplayLeaderLabel = new ImageWithTooltip({
    x: (sharedReplayLeaderLabelValues.x + 0.0025) * winW,
    y: (sharedReplayLeaderLabelValues.y - 0.007) * winH,
    width: size,
    height: size,
    image: globals.imageLoader!.get("crown")!,
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    visible: false,
    listening: true,
  });
  globals.layers.UI.add(sharedReplayLeaderLabel);
  globals.elements.sharedReplayLeaderLabel = sharedReplayLeaderLabel;

  // Add an animation to alert everyone when shared replay leadership has been transferred
  globals.elements.sharedReplayLeaderLabelPulse = new Konva.Tween({
    node: sharedReplayLeaderLabel,
    width: size * 2,
    height: size * 2,
    offsetX: 0.025 * winH,
    offsetY: 0.025 * winH,
    duration: CARD_ANIMATION_LENGTH,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    easing: Konva.Easings.EaseInOut,
    onFinish: () => {
      if (
        globals.elements.sharedReplayLeaderLabelPulse !== undefined &&
        globals.elements.sharedReplayLeaderLabelPulse !== null
      ) {
        globals.elements.sharedReplayLeaderLabelPulse.reverse();
      }
    },
  });
  globals.elements.sharedReplayLeaderLabelPulse.anim.addLayer(
    globals.layers.UI,
  );

  // Tooltip for the crown
  sharedReplayLeaderLabel.tooltipName = "leader";
  // This will get filled in later by the "replayLeader" command
  sharedReplayLeaderLabel.tooltipContent = "";
  tooltips.init(sharedReplayLeaderLabel, false, true);

  // The user can click on the crown to pass the replay leader to an arbitrary person
  // Require a double tap to prevent accidentally opening the dialog when hovering over the crown
  sharedReplayLeaderLabel.on("click dbltap", () => {
    if (
      globals.state.replay.shared === null ||
      !globals.state.replay.shared.amLeader
    ) {
      return;
    }

    if (globals.state.spectators.length === 1) {
      modals.warningShow(
        "You are the only person in the shared replay, so you cannot pass the leader to someone else.",
      );
      return;
    }

    const spectatorMap = new Map<number, string>();

    let msg =
      "What is the number of the person that you want to pass the replay leader to?\n\n";
    let i = 1;
    for (const spectator of globals.state.spectators) {
      if (spectator.name === globals.metadata.ourUsername) {
        continue;
      }

      spectatorMap.set(i, spectator.name);
      msg += `${i} - ${spectator.name}\n`;
      i += 1;
    }
    const targetString = window.prompt(msg);
    if (targetString === null) {
      // Don't do anything if they pressed the cancel button
      return;
    }
    const target = parseIntSafe(targetString);
    if (Number.isNaN(target)) {
      // Don't do anything if they entered something that is not a number
      return;
    }
    const selectedSpectator = spectatorMap.get(target);
    if (selectedSpectator === undefined) {
      // Don't do anything if they entered an invalid spectator number
      return;
    }

    globals.lobby.conn!.send("tableSetLeader", {
      tableID: globals.lobby.tableID,
      name: selectedSpectator,
    });
  });
}

// A notification that shows it is your turn
function drawYourTurn() {
  if (globals.lobby.settings.keldonMode) {
    return;
  }

  globals.elements.yourTurn = new Konva.Group({
    x: (spectatorsLabelValues.x + 0.052) * winW,
    y: (spectatorsLabelValues.y - 0.01) * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.yourTurn);

  const circle = new Konva.Ellipse({
    radiusX: 0.039 * winW,
    radiusY: 0.05 * winH,
    fill: "black",
    opacity: 0.5,
    stroke: "black",
    strokeWidth: 0.00422 * winH,
    offset: {
      x: -0.025 * winW,
      y: -0.036 * winH,
    },
    listening: false,
  });
  globals.elements.yourTurn.add(circle);

  const text = new Konva.Text({
    x: 0.003 * winW,
    y: 0.003 * winH,
    fontSize: 0.034 * winH,
    fontFamily: "Verdana",
    fill: "yellow",
    align: "center",
    text: "Your\nTurn",
    listening: false,
  });
  globals.elements.yourTurn.add(text);
}

function drawClueLog() {
  clueLogValues = {
    x: 0.8,
    y: 0.01,
    w: 0.19,
    h: 0.51,
  };
  const clueLogRect = new Konva.Rect({
    x: clueLogValues.x * winW,
    y: clueLogValues.y * winH,
    width: clueLogValues.w! * winW,
    height: clueLogValues.h! * winH,
    fill: "black",
    opacity: 0.2,
    cornerRadius: 0.01 * winW,
    listening: false,
  });
  globals.layers.UI.add(clueLogRect);

  const spacing = 0.01;
  globals.elements.clueLog = new ClueLog({
    x: (clueLogValues.x + spacing) * winW,
    y: (clueLogValues.y + spacing) * winH,
    width: (clueLogValues.w! - spacing * 2) * winW,
    height: (clueLogValues.h! - spacing * 2) * winH,
    listening: false,
  });
  globals.layers.UI.add((globals.elements.clueLog as unknown) as Konva.Group);
}

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log)
function drawStatistics() {
  const statsRect = new Konva.Rect({
    x: clueLogValues.x * winW,
    y: 0.53 * winH,
    width: clueLogValues.w! * winW,
    height: 0.06 * winH,
    fill: "black",
    opacity: 0.2,
    cornerRadius: 0.01 * winW,
    listening: false,
  });
  globals.layers.UI.add(statsRect);

  const paceTextLabel = basicTextLabel.clone({
    text: "Pace",
    x: 0.825 * winW,
    y: 0.54 * winH,
    fontSize: 0.02 * winH,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(paceTextLabel);
  paceTextLabel.tooltipName = "pace";
  let paceContent =
    "Pace is a measure of how many discards can happen while<br />";
  paceContent += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
  paceContent += "still having a chance to get the maximum score.<br />";
  paceContent += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
  paceContent +=
    '(For more information, click on the "Help" button in the lobby.)';
  globals.layers.UI.add(paceTextLabel);
  paceTextLabel.tooltipContent = paceContent;
  tooltips.init(paceTextLabel, true, false);

  const paceNumberLabel = basicNumberLabel.clone({
    text: "-",
    x: 0.9 * winW,
    y: 0.54 * winH,
    fontSize: 0.02 * winH,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(paceNumberLabel);
  globals.elements.paceNumberLabel = paceNumberLabel;

  paceTextLabel.on("click tap", (event: Konva.KonvaEventObject<MouseEvent>) => {
    arrows.click(event, ReplayArrowOrder.Pace);
  });
  paceNumberLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Pace);
    },
  );

  const efficiencyTextLabel = basicTextLabel.clone({
    text: "Efficiency",
    x: 0.825 * winW,
    y: 0.56 * winH,
    fontSize: 0.02 * winH,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(efficiencyTextLabel);
  efficiencyTextLabel.tooltipName = "efficiency-text";
  const padding = "&nbsp; &nbsp; &nbsp; &nbsp; ";
  const efficiencyTextLabelContent = `
    Efficiency is calculated by: <br />
    ${padding}&nbsp; &nbsp; <em>(number of cards played +<br />
    ${padding}&nbsp; &nbsp; number of touched cards) /<br />
    ${padding}&nbsp; &nbsp; number of clues given or lost</em><br />
    ${padding}The first number is the minimum amount of efficiency needed from <br />
    ${padding}this turn onward in order to win (i.e. future required efficiency).<br />
    ${padding}The second number shows the minimum possible efficiency needed<br />
    ${padding}to win with the current number of players and the current variant.<br />
    ${padding}(For more information, click on the "Help" button in the lobby.)
  `;
  efficiencyTextLabel.tooltipContent = efficiencyTextLabelContent;
  tooltips.init(efficiencyTextLabel, true, false);
  efficiencyTextLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.Efficiency);
    },
  );

  const efficiencyNumberLabel = basicNumberLabel.clone({
    text: "-",
    x: 0.9 * winW,
    y: 0.56 * winH,
    fontSize: 0.02 * winH,
    listening: true,
  }) as TextWithTooltip;
  globals.layers.UI.add(efficiencyNumberLabel);
  globals.elements.efficiencyNumberLabel = efficiencyNumberLabel;
  efficiencyNumberLabel.on("click tap", stats.efficiencyLabelClick);
  efficiencyNumberLabel.tooltipName = "efficiency-number";
  // The tooltip will be filled in later in the "statsView.onEfficiencyChanged()" function

  const efficiencyPipeLabel = basicNumberLabel.clone({
    text: " | ",
    x: 0.905 * winW,
    y: 0.56 * winH,
    fontSize: 0.02 * winH,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyPipeLabel);
  globals.elements.efficiencyPipeLabel = efficiencyPipeLabel;

  const efficiencyMinNeededLabel = basicNumberLabel.clone({
    text: globals.metadata.minEfficiency.toFixed(2), // Convert it to a string and round to 2 decimal places
    x: 0.918 * winW,
    y: 0.56 * winH,
    fontSize: 0.02 * winH,
    // "Easy" variants use the default color (off-white)
    // "Hard" variants use pink
    fill:
      globals.metadata.hardVariant &&
      globals.lobby.settings.hyphenatedConventions
        ? "#ffb2b2"
        : LABEL_COLOR,
    listening: true,
  }) as Konva.Text;
  globals.layers.UI.add(efficiencyMinNeededLabel);
  efficiencyMinNeededLabel.on(
    "click tap",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      arrows.click(event, ReplayArrowOrder.MinEfficiency);
    },
  );
  globals.elements.efficiencyMinNeededLabel = efficiencyMinNeededLabel;
}

function drawDiscardArea() {
  // The red border that surrounds the discard pile when the team is at 8 clues
  globals.elements.noDiscardBorder = new Konva.Rect({
    x: 0.8 * winW,
    y: 0.6 * winH,
    width: 0.19 * winW,
    height: 0.39 * winH,
    stroke: "#df1c2d",
    strokeWidth: 0.005 * winW,
    cornerRadius: 0.01 * winW,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.noDiscardBorder);

  // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
  globals.elements.noDoubleDiscardBorder = new Konva.Rect({
    x: 0.8 * winW,
    y: 0.6 * winH,
    width: 0.19 * winW,
    height: 0.39 * winH,
    stroke: "yellow",
    strokeWidth: 0.004 * winW,
    cornerRadius: 0.01 * winW,
    opacity: 0.75,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.noDoubleDiscardBorder);

  // The faded rectangle around the trash can
  const discardAreaRect = new Konva.Rect({
    x: 0.8 * winW,
    y: 0.6 * winH,
    width: 0.19 * winW,
    height: 0.39 * winH,
    fill: "black",
    opacity: 0.2,
    cornerRadius: 0.01 * winW,
  });
  globals.layers.UI.add(discardAreaRect);

  // The trash can icon over the discard pile
  const trashcan = new Konva.Image({
    x: 0.82 * winW,
    y: 0.62 * winH,
    width: 0.15 * winW,
    height: 0.35 * winH,
    opacity: 0.2,
    image: globals.imageLoader!.get("trashcan")!,
    listening: false,
  });
  globals.layers.UI.add(trashcan);

  // This is the invisible rectangle that players drag cards to in order to discard them
  globals.elements.discardArea = new Konva.Rect({
    x: 0.8 * winW,
    y: 0.6 * winH,
    width: 0.2 * winW,
    height: 0.4 * winH,
    listening: false,
  });
}

function drawArrows() {
  for (let i = 0; i < 6; i++) {
    const arrow = new Arrow(winW, winH, globals.lobby.settings.colorblindMode);
    globals.layers.arrow.add((arrow as unknown) as Konva.Group);
    globals.elements.arrows.push(arrow);
  }
}

function drawTimers() {
  // Just in case, stop the previous timer, if any
  timer.stop();

  // We don't want the timer to show in replays or untimed games
  // (unless they have the optional setting turned on)
  if (
    globals.state.finished ||
    (!globals.options.timed && !globals.lobby.settings.showTimerInUntimed)
  ) {
    return;
  }

  const timerValues = {
    x1: 0.145,
    x2: 0.595,
    y1: 0.645,
    y2: 0.645,
    w: 0.065,
    h: 0.051,
    fontSize: 0.03,
    cornerRadius: 0.05,
    spaceH: 0.01,
  };
  if (!globals.lobby.settings.keldonMode) {
    timerValues.x1 = 0.352;
    timerValues.x2 = timerValues.x1;
    timerValues.y1 = 0.77;
    timerValues.y2 = 0.885;
  }

  // A circle around the timer indicates that we have queued a pause
  // (we want the timer to be on top of this so that it does not interfere with mouse events)
  globals.elements.timer1Circle = new Konva.Ellipse({
    x: (timerValues.x1 + 0.04) * winW,
    y: (timerValues.y1 + 0.035) * winH,
    radiusX: 0.05 * winW,
    radiusY: 0.07 * winH,
    stroke: "#ffe03b", // Yellow
    strokeWidth: 0.00211 * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.timer1Circle);

  // The timer for "You"
  globals.elements.timer1 = new TimerDisplay({
    x: timerValues.x1 * winW,
    y: timerValues.y1 * winH,
    width: timerValues.w * winW,
    height: timerValues.h * winH,
    fontSize: timerValues.fontSize * winH,
    cornerRadius: timerValues.cornerRadius * winH,
    spaceH: timerValues.spaceH * winH,
    label: "You",
    visible: false,
    listening: true,
  });
  globals.layers.timer.add((globals.elements.timer1 as unknown) as Konva.Group);
  const timerClick = () => {
    if (
      !globals.options.timed || // We don't need to pause if this is not a timed game
      globals.state.pause.active // We don't need to pause if the game is already paused
    ) {
      return;
    }

    const { currentPlayerIndex } = globals.state.ongoingGame.turn;
    const { ourPlayerIndex } = globals.metadata;

    let setting;
    if (currentPlayerIndex === ourPlayerIndex) {
      setting = "pause";
    } else if (globals.state.pause.queued) {
      setting = "pause-unqueue";

      globals.store!.dispatch({
        type: "pauseQueue",
        queued: false,
      });
    } else {
      setting = "pause-queue";

      globals.store!.dispatch({
        type: "pauseQueue",
        queued: true,
      });
    }

    globals.lobby.conn!.send("pause", {
      tableID: globals.lobby.tableID,
      setting,
    });
  };
  globals.elements.timer1.on(
    "click",
    (event: Konva.KonvaEventObject<MouseEvent>) => {
      // "event.evt.buttons" is always 0 here
      if (event.evt.button === 2) {
        // Right-click
        timerClick();
      }
    },
  );
  globals.elements.timer1.on("dbltap", timerClick);

  // The timer for the current player
  globals.elements.timer2 = new TimerDisplay({
    x: timerValues.x2 * winW,
    y: timerValues.y2 * winH,
    width: timerValues.w * winW,
    height: timerValues.h * winH,
    fontSize: timerValues.fontSize * winH,
    labelFontSize: 0.02 * winH,
    cornerRadius: timerValues.cornerRadius * winH,
    spaceH: timerValues.spaceH * winH,
    visible: false,
    listening: true,
  });
  globals.layers.timer.add((globals.elements.timer2 as unknown) as Konva.Group);
  if (globals.options.timed || globals.lobby.settings.showTimerInUntimed) {
    globals.elements.timer2.tooltipName = "time-taken";
    // (the content will be updated in the "setTickingDownTimeCPTooltip()" function)
    tooltips.init(globals.elements.timer2, true, false);
  }
}

function drawClueArea() {
  // Put the clue area directly below the play stacks, with a little bit of spacing
  clueAreaValues = {
    x: actionLogValues.x,
    y: playAreaValues.y + playAreaValues.h! + 0.005,
    w: actionLogValues.w!,
    h: 0.23,
  };
  if (globals.variant.showSuitNames) {
    clueAreaValues.y += 0.03;
  }
  // In BGA mode, we can afford to put a bit more spacing to make it look less packed together
  if (!globals.lobby.settings.keldonMode) {
    clueAreaValues.y += 0.02;
  }
  globals.elements.clueArea = new Konva.Group({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
    visible: false,
    listening: false,
  });

  // Player buttons
  const { numPlayers } = globals.options;
  const playerButtonH = 0.025;
  const playerButtonSpacing = 0.0075;

  // If this is a two player game, we can slide the clue UI down by a bit
  // (since the clue target buttons won't be shown)
  const playerButtonAdjustment = numPlayers === 2 ? playerButtonH / 2 : 0;

  // This is the normal button group, which does not include us
  globals.elements.clueTargetButtonGroup = new ButtonGroup({
    listening: false,
  });
  {
    const totalPlayerButtons = numPlayers - 1;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (let i = 0; i < totalPlayerButtons; i++) {
      const j = (globals.metadata.ourPlayerIndex + i + 1) % numPlayers;
      const button = new PlayerButton(
        {
          x: (playerButtonW + playerButtonSpacing) * i * winW,
          y: 0,
          width: playerButtonW * winW,
          height: playerButtonH * winH,
          text: globals.metadata.playerNames[j],
        },
        j,
      );
      globals.elements.clueTargetButtonGroup.add(
        (button as unknown) as Konva.Group,
      );
      globals.elements.clueTargetButtonGroup.addList(button);
    }
  }
  globals.elements.clueArea.add(
    (globals.elements.clueTargetButtonGroup as unknown) as Konva.Group,
  );
  if (numPlayers === 2) {
    // The clue target buttons are pointless if we are playing a 2-player game
    // (because we only have the ability to clue one player)
    globals.elements.clueTargetButtonGroup.hide();
    // Default the clue recipient button to the only other player available
    globals.elements.clueTargetButtonGroup.list[0].setPressed(true);
  }

  // This button group includes us, which is used for hypotheticals
  globals.elements.clueTargetButtonGroup2 = new ButtonGroup({
    listening: false,
  });
  {
    const totalPlayerButtons = numPlayers;
    const totalPlayerW =
      clueAreaValues.w! - playerButtonSpacing * (totalPlayerButtons - 1);
    const playerButtonW = totalPlayerW / totalPlayerButtons;

    for (let i = 0; i < totalPlayerButtons; i++) {
      // We change the calculation of j from the above code block because we want the buttons to
      // follow the order of players from top to bottom (in BGA mode)
      const j = (globals.metadata.ourPlayerIndex + i) % numPlayers;
      const button = new PlayerButton(
        {
          x: (playerButtonW + playerButtonSpacing) * i * winW,
          y: 0,
          width: playerButtonW * winW,
          height: playerButtonH * winH,
          text: globals.metadata.playerNames[j],
        },
        j,
      );
      globals.elements.clueTargetButtonGroup2.add(
        (button as unknown) as Konva.Group,
      );
      globals.elements.clueTargetButtonGroup2.addList(button);
    }
  }
  globals.elements.clueArea.add(
    (globals.elements.clueTargetButtonGroup2 as unknown) as Konva.Group,
  );
  globals.elements.clueTargetButtonGroup2.hide();

  // Clue type buttons
  const buttonW = 0.04;
  const buttonH = 0.071;
  const buttonXSpacing = 0.009;
  const buttonYSpacing = 0.002;
  globals.elements.clueTypeButtonGroup = new ButtonGroup({
    listening: false,
  });

  // In a hypo, the lower part of the clue ui slides left independently of the clue target buttons.
  // The limiting factor on how far it can slide is when there's 6 color buttons
  const maxColorWidth = buttonW * 6 + buttonXSpacing * 5;
  const lowerClueAreaWidth = maxColorWidth * winW;
  const offsetX = -0.5 * (clueAreaValues.w! * winW - lowerClueAreaWidth);
  function setLeft(this: SlidableGroup) {
    const x = offsetX;
    this.x(x);
  }

  function setCenter(this: SlidableGroup) {
    this.x(0);
  }

  lowerClueAreaValues = {
    x: 0,
    y: playerButtonH,
    w: maxColorWidth,
  };

  globals.elements.lowerClueArea = new SlidableGroup({
    x: lowerClueAreaValues.x * winW,
    y: lowerClueAreaValues.y * winH,
    width: lowerClueAreaValues.w!,
  });

  globals.elements.lowerClueArea.setLeft = setLeft;
  globals.elements.lowerClueArea.setCenter = setCenter;
  globals.elements.lowerClueArea.setCenter();
  globals.elements.clueArea.add(
    (globals.elements.lowerClueArea as unknown) as Konva.Group,
  );

  // Color buttons
  globals.elements.colorClueButtons = [];
  let totalColorWidth = buttonW * globals.variant.clueColors.length;
  totalColorWidth += buttonXSpacing * (globals.variant.clueColors.length - 1);
  const colorX = clueAreaValues.w! * 0.5 - totalColorWidth * 0.5;
  const colorY = buttonYSpacing - playerButtonAdjustment;
  for (let i = 0; i < globals.variant.clueColors.length; i++) {
    const color = globals.variant.clueColors[i];

    // Find the first suit that matches this color
    let matchingSuit;
    for (const suit of globals.variant.suits) {
      if (suit.clueColors.includes(color)) {
        matchingSuit = suit;
        break;
      }
    }
    if (matchingSuit === undefined) {
      throw new Error(
        `Failed to find the suit for the color of "${color.name}".`,
      );
    }

    const button = new ColorButton(
      {
        x: (colorX + i * (buttonW + buttonXSpacing)) * winW,
        y: colorY * winH,
        width: buttonW * winW,
        height: buttonH * winH,
        color: color.fill,
        text: color.abbreviation,
        clue: colorClue(color),
      },
      matchingSuit,
    );

    globals.elements.clueTypeButtonGroup.add(
      (button as unknown) as Konva.Group,
    );
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.colorClueButtons.push(button);
  }

  // Rank buttons / number buttons
  globals.elements.rankClueButtons = [];
  const numRanks = globals.variant.clueRanks.length;
  let totalRankWidth = buttonW * numRanks;
  totalRankWidth += buttonXSpacing * (numRanks - 1);
  const rankX = clueAreaValues.w! * 0.5 - totalRankWidth * 0.5;
  const rankY = colorY + buttonH + buttonYSpacing;
  for (let i = 0; i < globals.variant.clueRanks.length; i++) {
    const rank = globals.variant.clueRanks[i];
    const button = new RankButton({
      x: (rankX + i * (buttonW + buttonXSpacing)) * winW,
      y: rankY * winH,
      width: buttonW * winW,
      height: buttonH * winH,
      number: rank,
      clue: rankClue(rank),
    });

    globals.elements.clueTypeButtonGroup.add(
      (button as unknown) as Konva.Group,
    );
    globals.elements.clueTypeButtonGroup.addList(button);
    globals.elements.rankClueButtons.push(button);
  }

  // Set button functionality
  globals.elements.clueTargetButtonGroup.on("change", clues.checkLegal);
  globals.elements.clueTargetButtonGroup2.on("change", clues.checkLegal);
  globals.elements.clueTypeButtonGroup.on("change", clues.checkLegal);

  globals.elements.lowerClueArea.add(
    (globals.elements.clueTypeButtonGroup as unknown) as Konva.Group,
  );

  // The "Give Clue" button
  giveClueValues = {
    x: 0,
    y: rankY + buttonH + buttonYSpacing,
    w: 0.236,
  };
  giveClueValues.x = clueAreaValues.w! * 0.5 - giveClueValues.w! * 0.5;

  globals.elements.giveClueButton = new Button({
    x: giveClueValues.x * winW,
    y: giveClueValues.y * winH,
    width: giveClueValues.w! * winW,
    height: 0.051 * winH,
    text: "Give Clue",
  });
  globals.elements.giveClueButton.setEnabled(false);
  globals.elements.lowerClueArea.add(
    (globals.elements.giveClueButton as unknown) as Konva.Group,
  );
  globals.elements.giveClueButton.on("click tap", clues.give);

  globals.layers.UI.add(globals.elements.clueArea);

  drawClueAreaDisabled(offsetX);
}

function drawClueAreaDisabled(offsetX: number) {
  // We fade the clue area and draw a rectangle on top of it when there are no clues available
  globals.elements.clueAreaDisabled = new SlidableGroup({
    x: clueAreaValues.x * winW,
    y: clueAreaValues.y * winH,
    width: clueAreaValues.w! * winW,
    listening: false,
  });

  function setLeft(this: SlidableGroup) {
    this.x(clueAreaValues.x * winW + offsetX);
  }
  globals.elements.clueAreaDisabled.setLeft = setLeft;

  function setCenter(this: SlidableGroup) {
    this.x(clueAreaValues.x * winW);
  }
  globals.elements.clueAreaDisabled.setCenter = setCenter;
  globals.elements.clueAreaDisabled.setCenter();

  // A transparent rectangle to stop clicks
  const rect = new Konva.Rect({
    width: clueAreaValues.w! * winW,
    height: clueAreaValues.h! * winH,
    listening: true, // It must listen or it won't stop clicks
  });
  globals.elements.clueAreaDisabled.add(rect);

  const spacing = {
    x: 0.075,
    y: 0.03,
  };
  const lineColor = "#1a1a1a";

  // The line from top-left to bottom-right
  const line1 = new Konva.Line({
    points: [
      spacing.x * winW,
      spacing.y * winH,
      (clueAreaValues.w! - spacing.x) * winW,
      (clueAreaValues.h! - spacing.y) * winH,
    ],
    stroke: lineColor,
    strokeWidth: 0.00528 * winH,
    listening: false,
  });
  globals.elements.clueAreaDisabled.add(line1);

  // The line from bottom-left to top-right
  const line2 = new Konva.Line({
    points: [
      spacing.x * winW,
      (clueAreaValues.h! - spacing.y) * winH,
      (clueAreaValues.w! - spacing.x) * winW,
      spacing.y * winH,
    ],
    stroke: lineColor,
    strokeWidth: 0.00528 * winH,
    listening: false,
  });
  globals.elements.clueAreaDisabled.add(line2);

  // The "No clues available" text
  const noCluesText = new FitText({
    y: clueAreaValues.h! * 0.4 * winH,
    width: clueAreaValues.w! * winW,
    fontSize: 0.07 * winH,
    fontFamily: "Verdana",
    align: "center",
    text: "No clues",
    fill: LABEL_COLOR,
    stroke: "black",
    strokeWidth: 0.00211 * winH,
    listening: false,
  });
  globals.elements.clueAreaDisabled.add(noCluesText);

  globals.elements.clueAreaDisabled.hide();
  globals.layers.UI.add(
    (globals.elements.clueAreaDisabled as unknown) as Konva.Group,
  );
}

function drawCurrentPlayerArea() {
  // The "Current player: [player name]" box
  const currentPlayerAreaWidth = 0.3; // This is big enough to fit in between the two timers
  const currentPlayerAreaValues = {
    x: clueAreaValues.x + clueAreaValues.w! / 2 - currentPlayerAreaWidth / 2,
    y: clueAreaValues.y + 0.015,
    w: currentPlayerAreaWidth,
    h: 0.15,
    spacing: 0.006,
  };
  globals.elements.currentPlayerArea = new CurrentPlayerArea(
    currentPlayerAreaValues,
    winW,
    winH,
  );
  globals.layers.UI.add(
    (globals.elements.currentPlayerArea as unknown) as Konva.Group,
  );
}

function drawPreplayArea() {
  const w = 0.29;
  const h = 0.1;
  const x = clueAreaValues.x + clueAreaValues.w! / 2 - w / 2;
  const y = clueAreaValues.y + 0.05; // "clueAreaValues.h" does not exist
  globals.elements.premoveCancelButton = new Button({
    x: x * winW,
    y: y * winH,
    width: w * winW,
    height: h * winH,
    text: "Cancel Pre-Move",
    visible: false,
  });
  globals.layers.UI.add(
    (globals.elements.premoveCancelButton as unknown) as Konva.Group,
  );
  globals.elements.premoveCancelButton.on("click tap", () => {
    globals.store!.dispatch({
      type: "premove",
      premove: null,
    });
  });
}

function drawHypotheticalArea() {
  const hypoValues = {
    x: actionLogValues.x,
    y: clueAreaValues.y + 0.06,
    w: actionLogValues.w,
    h: 0.05,
  };

  // The "Hypothetical" circle that shows we are currently in a hypothetical
  globals.elements.hypoCircle = new Konva.Group({
    x: hypoValues.x * winW,
    y: hypoValues.y * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI.add(globals.elements.hypoCircle);

  const circle = new Konva.Ellipse({
    x: hypoValues.w! * 0.5 * winW,
    y: hypoValues.h * 0.5 * winW,
    radiusX: hypoValues.w! * 0.4 * winW,
    radiusY: hypoValues.h * winH,
    fill: "black",
    opacity: 0.5,
    stroke: "black",
    strokeWidth: 0.00422 * winH,
    listening: false,
  });
  globals.elements.hypoCircle.add(circle);

  const text = new FitText({
    y: hypoValues.h * 0.4 * winH,
    name: "text",
    width: hypoValues.w! * winW,
    fontSize: 0.06 * winH,
    fontFamily: "Verdana",
    fill: LABEL_COLOR,
    align: "center",
    text: "Hypothetical",
    listening: false,
  });
  globals.elements.hypoCircle.add(text);

  globals.elements.hypoButtonsArea = new Konva.Group({
    visible: false,
  });

  globals.layers.UI.add(globals.elements.hypoButtonsArea);

  // The "Back 1 Turn" button (to the right of the give clue button)
  const hypoBackButtonValues = {
    // eslint-disable-next-line prettier/prettier
    x: clueAreaValues.x + lowerClueAreaValues.x + giveClueValues.x + giveClueValues.w! - 0.05,
    y: clueAreaValues.y + lowerClueAreaValues.y + giveClueValues.y,
    w: 0.035,
    h: 0.051,
  };

  globals.elements.hypoBackButton = new Button({
    x: hypoBackButtonValues.x * winW,
    y: hypoBackButtonValues.y * winH,
    width: hypoBackButtonValues.w * winW,
    height: hypoBackButtonValues.h * winH,
    text: "Back",
    fontSize: 0.019 * winH,
  });

  globals.elements.hypoBackButton.tooltipName = "hypo-back";
  globals.elements.hypoBackButton.tooltipContent =
    "Go back a turn in this hypothetical.";
  tooltips.init(globals.elements.hypoBackButton, true, false);

  globals.elements.hypoBackButton.on("click tap", hypothetical.sendBack);
  globals.elements.hypoButtonsArea.add(
    (globals.elements.hypoBackButton as unknown) as Konva.Group,
  );

  const hypoButtonWidth = 0.075;
  const hypoButtonHeight = 0.051;
  const hypoButtonSpacing = 0.008;

  // The "End Hypothetical" button (to the right of the back button)
  const endHypotheticalButtonValues = {
    x: hypoBackButtonValues.x + hypoBackButtonValues.w + hypoButtonSpacing,
    y: hypoBackButtonValues.y,
  };

  const endHypotheticalButton = new Button({
    x: endHypotheticalButtonValues.x * winW,
    y: endHypotheticalButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Exit Hypo",
    fontSize: 0.019 * winH,
  });
  globals.elements.hypoButtonsArea.add(
    (endHypotheticalButton as unknown) as Konva.Group,
  );
  endHypotheticalButton.on("click tap", () => {
    hypothetical.end();
  });
  globals.elements.endHypotheticalButton = endHypotheticalButton;

  // The "Edit Cards" button (above the exit hypo button)
  const editCardsButtonValues = {
    x: endHypotheticalButtonValues.x,
    y: endHypotheticalButtonValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.editCardsButton = new CheckButton({
    x: editCardsButtonValues.x * winW,
    y: editCardsButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Edit Cards",
    fontSize: 0.019 * winH,
  });

  globals.elements.editCardsButton.tooltipName = "hypo-edit-cards";
  globals.elements.editCardsButton.tooltipContent =
    "Turn this on and then click on cards to change them into other cards.";
  tooltips.init(globals.elements.editCardsButton, true, false);

  globals.elements.editCardsButton.on("click tap", () => {
    globals.elements.editCardsButton?.setPressed(
      !globals.elements.editCardsButton?.pressed,
    );
  });
  globals.elements.hypoButtonsArea.add(
    (globals.elements.editCardsButton as unknown) as Konva.Group,
  );

  // The "Show Drawn Cards" / "Hide Drawn Cards" button (above the edit cards button)
  const toggleDrawnCardsButtonValues = {
    x: editCardsButtonValues.x,
    y: editCardsButtonValues.y - hypoButtonHeight - hypoButtonSpacing,
  };
  globals.elements.toggleDrawnCardsButton = new CheckButton({
    x: toggleDrawnCardsButtonValues.x * winW,
    y: toggleDrawnCardsButtonValues.y * winH,
    width: hypoButtonWidth * winW,
    height: hypoButtonHeight * winH,
    text: "Show Drawn",
    fontSize: 0.016 * winH,
  });
  globals.elements.toggleDrawnCardsButton.tooltipName = "hypo-show-drawn";
  globals.elements.toggleDrawnCardsButton.tooltipContent =
    "Show the front faces of cards drawn during the hypothetical.";
  tooltips.init(globals.elements.toggleDrawnCardsButton, true, false);

  globals.elements.toggleDrawnCardsButton.on(
    "click tap",
    hypothetical.toggleRevealed,
  );
  globals.elements.hypoButtonsArea.add(
    (globals.elements.toggleDrawnCardsButton as unknown) as Konva.Group,
  );
}

function drawPauseArea() {
  const pauseAreaValues = {
    w: 0.5,
    h: 0.5,
  };

  globals.elements.pauseArea = new Konva.Group({
    x: 0.25 * winW,
    y: 0.25 * winH,
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.pauseArea);

  const pauseRect = new Konva.Rect({
    width: pauseAreaValues.w * winW,
    height: pauseAreaValues.h * winH,
    fill: "#b3b3b3",
    cornerRadius: 0.01 * winH,
    listening: true,
  });
  globals.elements.pauseArea.add(pauseRect);

  const pauseTitle = new Konva.Text({
    y: 0.1 * winH,
    width: pauseAreaValues.w * winW,
    fontFamily: "Verdana",
    fontSize: 0.08 * winH,
    text: "Game Paused",
    align: "center",
    fill: "white",
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    listening: false,
  });
  globals.elements.pauseArea.add(pauseTitle);

  globals.elements.pauseText = new Konva.Text({
    y: 0.21 * winH,
    width: pauseAreaValues.w * winW,
    fontFamily: "Verdana",
    fontSize: 0.05 * winH,
    text: "by: [username]",
    align: "center",
    fill: "white",
    shadowColor: "black",
    shadowBlur: 10,
    shadowOffset: {
      x: 0,
      y: 0,
    },
    shadowOpacity: 0.9,
    listening: false,
  });
  globals.elements.pauseArea.add(globals.elements.pauseText);

  const button1W = pauseAreaValues.w * 0.4;
  const button2W = pauseAreaValues.w * 0.125;
  const buttonH = 0.33;
  const spacing = pauseAreaValues.w * 0.1;

  globals.elements.pauseButton = new Button({
    x: spacing * winW,
    y: buttonH * winH,
    width: button1W * winW,
    height: 0.1 * winH,
    text: "Unpause",
  });
  globals.elements.pauseButton.on("click tap", () => {
    globals.lobby.conn!.send("pause", {
      tableID: globals.lobby.tableID,
      setting: "unpause",
    });
  });
  globals.elements.pauseArea.add(
    (globals.elements.pauseButton as unknown) as Konva.Group,
  );

  const chatButton = new Button({
    x: (pauseAreaValues.w - button2W * 2 - spacing * 2) * winW,
    y: buttonH * winH,
    width: button2W * winW,
    height: 0.1 * winH,
    text: "💬",
  });
  globals.elements.pauseArea.add((chatButton as unknown) as Konva.Group);
  chatButton.on("click tap", () => {
    globals.game!.chat.toggle();
  });

  const pauseLobbyButton = new Button(
    {
      x: (pauseAreaValues.w - button2W - spacing * 1.5) * winW,
      y: buttonH * winH,
      width: button2W * winW,
      height: 0.1 * winH,
    },
    [globals.imageLoader!.get("home")!],
  );
  globals.elements.pauseArea.add((pauseLobbyButton as unknown) as Konva.Group);
  pauseLobbyButton.on("click tap", lobbyButtonClick);
}

function drawExtraAnimations() {
  // These images are shown to the player to
  // indicate which direction we are moving in a shared replay
  const x = playAreaValues.x + playAreaValues.w! / 2 - 0.05;
  const y = playAreaValues.y + playAreaValues.h! / 2 - 0.05;
  const size = 0.1;

  globals.elements.sharedReplayForward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: globals.imageLoader!.get("replay-forward-border")!,
    border: 100,
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.sharedReplayForward);

  globals.elements.sharedReplayBackward = new Konva.Image({
    x: x * winW,
    y: y * winH,
    width: size * winW,
    height: size * winH,
    image: globals.imageLoader!.get("replay-back-border")!,
    visible: false,
    listening: false,
  });
  globals.layers.UI2.add(globals.elements.sharedReplayBackward);
}

// Subroutines
function lobbyButtonClick(this: Button) {
  // Unregister the click handler to ensure that the user does not double-click
  // and go to the lobby twice
  this.off("click tap");

  backToLobby();
}
