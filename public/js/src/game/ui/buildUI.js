/*
    This function draws the UI when going into a game for the first time
*/

// Imports
const globals = require('./globals');
const Button = require('./Button');
const ButtonGroup = require('./ButtonGroup');
const CardDeck = require('./CardDeck');
const CardStack = require('./CardStack');
const CardLayout = require('./CardLayout');
const Clue = require('./Clue');
const ClueLog = require('./ClueLog');
const ClueRecipientButton = require('./ClueRecipientButton');
const ColorButton = require('./ColorButton');
const constants = require('../../constants');
const drawHands = require('./drawHands');
const FitText = require('./FitText');
const graphics = require('./graphics');
const MsgLog = require('./MsgLog');
const hypothetical = require('./hypothetical');
const MultiFitText = require('./MultiFitText');
const NumberButton = require('./NumberButton');
const replay = require('./replay');
const stats = require('./stats');
const timer = require('./timer');
const TimerDisplay = require('./TimerDisplay');
const ToggleButton = require('./ToggleButton');
const tooltips = require('./tooltips');

// Constants
const labelColor = '#d8d5ef'; // Off-white

// Variables
let winW;
let winH;
let numPlayers;
let basicTextLabel;
let basicNumberLabel;
let actionLogValues;
let playAreaValues;
let cardWidth;
let cardHeight;
let bottomLeftButtonValues;
let deckValues;
let scoreAreaValues;
let clueAreaValues;
let clueLogValues;
let spectatorsLabelValues;

module.exports = () => {
    // Constants
    winW = globals.stage.getWidth();
    winH = globals.stage.getHeight();
    numPlayers = globals.playerNames.length;

    // Just in case, delete all existing layers
    const layers = globals.stage.getLayers();
    for (let i = 0; i < layers.length; i++) {
        layers[i].remove();
    }

    // Define the layers
    // (they are added to the stage later on at the end of the buildUI function)
    globals.layers.background = new graphics.Layer();
    globals.layers.UI = new graphics.Layer();
    globals.layers.timer = new graphics.Layer({
        listening: false,
    });
    globals.layers.card = new graphics.Layer();
    globals.layers.UI2 = new graphics.Layer({ // We need some UI elements to be on top of cards
        listening: false,
    });
    globals.layers.overtop = new graphics.Layer(); // A layer drawn overtop everything else

    const background = new graphics.Image({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        image: globals.ImageLoader.get('background'),
    });
    globals.layers.background.add(background);

    // Create some default objects
    basicTextLabel = new graphics.Text({
        x: 0.01 * winW,
        y: 0.01 * winH,
        width: 0.11 * winW,
        height: 0.03 * winH,
        fontSize: 0.026 * winH,
        fontFamily: 'Verdana',
        align: 'left',
        text: 'Placeholder text',
        fill: labelColor,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });
    basicNumberLabel = basicTextLabel.clone().setText('0').setWidth(0.03 * winW);

    // The middle of the screen
    drawActionLog();
    drawPlayStacksAndDiscardStacks();

    // Hands are distributed throughout the screen
    drawHands(); // Contained in a separate file because there is a lot of code

    // The bottom-left
    drawBottomLeftButtons();
    drawDeck();

    // The bottom-right
    drawScoreArea();
    drawSpectators();
    drawSharedReplay();

    // The right-hand column
    drawClueLog();
    drawStatistics();
    drawDiscardArea();

    // Conditional elements
    drawTimers();
    drawClueArea();
    drawCurrentPlayerArea();
    drawPreplayArea();
    drawReplayArea();
    drawExtraAnimations();

    if (globals.inReplay) {
        globals.elements.replayArea.show();
    }

    globals.stage.add(globals.layers.background);
    globals.stage.add(globals.layers.UI);
    globals.stage.add(globals.layers.timer);
    globals.stage.add(globals.layers.card);
    globals.stage.add(globals.layers.UI2);
    globals.stage.add(globals.layers.overtop);
};

const drawActionLog = () => {
    actionLogValues = {
        x: 0.2,
        y: 0.235,
        w: 0.4,
        h: 0.098,
    };
    if (globals.lobby.settings.showBGAUI) {
        actionLogValues.x = 0.01;
        actionLogValues.y = 0.01;
        actionLogValues.h = 0.25;
    }
    const actionLog = new graphics.Group({
        x: actionLogValues.x * winW,
        y: actionLogValues.y * winH,
    });
    globals.layers.UI.add(actionLog);

    // The faded rectangle around the action log
    const actionLogRect = new graphics.Rect({
        x: 0,
        y: 0,
        width: actionLogValues.w * winW,
        height: actionLogValues.h * winH,
        fill: 'black',
        opacity: 0.3,
        cornerRadius: 0.01 * winH,
        listening: true,
    });
    actionLog.add(actionLogRect);

    // Clicking on the action log
    actionLogRect.on('click tap', () => {
        globals.elements.msgLogGroup.show();
        globals.elements.stageFade.show();

        globals.layers.overtop.batchDraw();

        globals.elements.stageFade.on('click tap', () => {
            globals.elements.stageFade.off('click tap');

            globals.elements.msgLogGroup.hide();
            globals.elements.stageFade.hide();

            globals.layers.overtop.batchDraw();
        });
    });

    // The action log
    let maxLines = 3;
    if (globals.lobby.settings.showBGAUI) {
        maxLines = 8;
    }
    globals.elements.messagePrompt = new MultiFitText({
        align: 'center',
        fontSize: 0.028 * winH,
        fontFamily: 'Verdana',
        fill: labelColor,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
        x: 0.01 * winW,
        y: 0.003 * winH,
        width: (actionLogValues.w - 0.02) * winW,
        height: (actionLogValues.h - 0.003) * winH,
        maxLines,
    });
    actionLog.add(globals.elements.messagePrompt);

    // The dark overlay that appears when you click on the action log (or a player's name)
    globals.elements.stageFade = new graphics.Rect({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        opacity: 0.3,
        fill: 'black',
        visible: false,
    });
    globals.layers.overtop.add(globals.elements.stageFade);

    // The full action log (that appears when you click on the action log)
    globals.elements.msgLogGroup = new MsgLog();
    globals.layers.overtop.add(globals.elements.msgLogGroup);
};

const drawPlayStacksAndDiscardStacks = () => {
    // Local variables
    let discardStackSpacing;
    let yOffset;

    if (globals.variant.suits.length === 6 || globals.variant.showSuitNames) {
        cardWidth = 0.06;
        cardHeight = 0.151;
        yOffset = 0.019;
        discardStackSpacing = 0.04;
    } else { // 4 or 5 stacks
        cardWidth = 0.075;
        cardHeight = 0.189;
        yOffset = 0;
        discardStackSpacing = 0.05;
    }
    const playStackValues = {
        x: 0.183,
        y: 0.345 + yOffset,
        spacing: 0.015,
    };
    if (globals.variant.showSuitNames) {
        playStackValues.y -= 0.018;
    }
    if (globals.lobby.settings.showBGAUI) {
        playStackValues.x = actionLogValues.x;
        playStackValues.y = actionLogValues.y + actionLogValues.h + 0.02;
        playStackValues.spacing = 0.006;
    }

    // Variants with less than 5 stacks will be left-aligned instead of centered
    // unless we manually adjust them
    if (
        (globals.variant.suits.length === 4 && !globals.variant.showSuitNames)
        || (globals.variant.suits.length === 5 && globals.variant.showSuitNames)
    ) {
        playStackValues.x += (cardWidth + playStackValues.spacing) / 2;
    } else if (globals.variant.suits.length === 4 && globals.variant.showSuitNames) {
        playStackValues.x += cardWidth + playStackValues.spacing;
    } else if (globals.variant.suits.length === 3 && !globals.variant.showSuitNames) {
        playStackValues.x += ((cardWidth + playStackValues.spacing) / 2) * 2;
    } else if (globals.variant.suits.length === 3 && globals.variant.showSuitNames) {
        playStackValues.x += (cardWidth + playStackValues.spacing) * 1.5;
    }

    for (let i = 0; i < globals.variant.suits.length; i++) {
        const suit = globals.variant.suits[i];
        const playStackX = playStackValues.x + (cardWidth + playStackValues.spacing) * i;

        const pileback = new graphics.Image({
            x: playStackX * winW,
            y: playStackValues.y * winH,
            width: cardWidth * winW,
            height: cardHeight * winH,
            image: globals.cardImages[`Card-${suit.name}-0`],
        });
        globals.layers.background.add(pileback);

        const thisSuitPlayStack = new CardStack({
            x: playStackX * winW,
            y: playStackValues.y * winH,
            width: cardWidth * winW,
            height: cardHeight * winH,
        });
        globals.elements.playStacks.set(suit, thisSuitPlayStack);
        globals.layers.card.add(thisSuitPlayStack);

        const thisSuitDiscardStack = new CardLayout({
            x: 0.81 * winW,
            y: (0.61 + discardStackSpacing * i) * winH,
            width: 0.17 * winW,
            height: 0.17 * winH,
        });
        globals.elements.discardStacks.set(suit, thisSuitDiscardStack);
        globals.layers.card.add(thisSuitDiscardStack);

        // Draw the suit name next to each suit
        // (a text description of the suit)
        if (globals.variant.showSuitNames) {
            let text = suit.name;
            if (
                globals.lobby.settings.showColorblindUI
                && suit.clueColors.length > 1
                && suit !== constants.SUIT.RAINBOW
                && suit !== constants.SUIT.RAINBOW1OE
            ) {
                const colorList = suit.clueColors.map(c => c.abbreviation).join('/');
                text += ` [${colorList}]`;
            }
            if (globals.variant.name.startsWith('Up or Down')) {
                text = '';
            }

            const suitLabelText = new FitText({
                x: (playStackValues.x - 0.01 + (cardWidth + playStackValues.spacing) * i) * winW,
                y: (playStackValues.y + 0.155) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.02 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text,
                fill: labelColor,
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
    globals.elements.playArea = new graphics.Rect({
        x: (playAreaValues.x - overlap) * winW,
        y: (playAreaValues.y - overlap) * winH,
        width: (playAreaValues.w + overlap * 2) * winW,
        height: (playAreaValues.h + overlap * 2) * winH,
    });
    globals.elements.playArea.isOver = pos => (
        pos.x >= globals.elements.playArea.getX()
        && pos.y >= globals.elements.playArea.getY()
        && pos.x <= globals.elements.playArea.getX() + globals.elements.playArea.getWidth()
        && pos.y <= globals.elements.playArea.getY() + globals.elements.playArea.getHeight()
    );
};

const drawBottomLeftButtons = () => {
    bottomLeftButtonValues = {
        x: 0.01,
        y: 0.8,
        w: 0.07,
        h: 0.0563, // 0.06
    };

    // The toggle in-game replay button
    globals.elements.replayButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: bottomLeftButtonValues.y * winH,
        width: bottomLeftButtonValues.w * winW,
        height: bottomLeftButtonValues.h * winH,
        image: 'replay',
        visible: !globals.replay,
    });
    globals.elements.replayButton.on('click tap', () => {
        if (!globals.elements.replayButton.enabled) {
            return;
        }
        if (globals.inReplay) {
            replay.exit();
        } else {
            replay.enter();
        }
    });
    globals.layers.UI.add(globals.elements.replayButton);
    globals.elements.replayButton.setEnabled(false);
    globals.elements.replayButton.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'replay');
        }, globals.tooltipDelay);
    });
    globals.elements.replayButton.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-replay').tooltipster('close');
    });
    const replayContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Toggle the in-game replay, where you can rewind the game to see what happened on a specific turn.</span>';
    $('#tooltip-replay').tooltipster('instance').content(replayContent);

    // The restart button
    // (to go into a new game with the same settings as the current shared replay)
    globals.elements.restartButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: bottomLeftButtonValues.y * winH,
        width: bottomLeftButtonValues.w * winW,
        height: bottomLeftButtonValues.h * winH,
        text: 'Restart',
        visible: globals.replay && globals.sharedReplay,
    });
    globals.layers.UI.add(globals.elements.restartButton);
    globals.elements.restartButton.on('click tap', () => {
        globals.lobby.conn.send('gameRestart');
    });
    globals.elements.restartButton.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'restart');
        }, globals.tooltipDelay);
    });
    globals.elements.restartButton.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-restart').tooltipster('close');
    });
    const restartContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Automatically go into a new game with the current members of the shared replay (using the same game settings as this one).</span>';
    $('#tooltip-restart').tooltipster('instance').content(restartContent);

    // The chat button
    globals.elements.chatButton = new Button({
        x: bottomLeftButtonValues.x * winW,
        y: (bottomLeftButtonValues.y + bottomLeftButtonValues.h + 0.01) * winH,
        width: bottomLeftButtonValues.w * winW,
        height: bottomLeftButtonValues.h * winH,
        text: '💬',
        visible: !globals.replay || globals.sharedReplay,
    });
    globals.layers.UI.add(globals.elements.chatButton);
    globals.elements.chatButton.on('click tap', () => {
        globals.game.chat.toggle();
    });
    globals.elements.chatButton.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'chat');
        }, globals.tooltipDelay);
    });
    globals.elements.chatButton.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-chat').tooltipster('close');
    });
    const chatContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Open/close the in-game chat.</span>';
    $('#tooltip-chat').tooltipster('instance').content(chatContent);

    const shortButtonSpacing = 0.003;

    // The lobby button (which takes the user back to the lobby)
    // There are two different versions, depending on whether the kill button is showing or not
    const lobbyButtonValues = {
        x: bottomLeftButtonValues.x,
        y: (bottomLeftButtonValues.y + (2 * bottomLeftButtonValues.h) + 0.02),
        h: bottomLeftButtonValues.h,
    };

    globals.elements.lobbyButtonSmall = new Button({
        x: lobbyButtonValues.x * winW,
        y: lobbyButtonValues.y * winH,
        width: ((bottomLeftButtonValues.w / 2) - shortButtonSpacing) * winW,
        height: lobbyButtonValues.h * winH,
        image: 'home',
        visible: !globals.replay && !globals.spectating,
    });
    globals.layers.UI.add(globals.elements.lobbyButtonSmall);
    globals.elements.lobbyButtonSmall.on('click tap', lobbyButtonClick);
    globals.elements.lobbyButtonSmall.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'lobby-small');
        }, globals.tooltipDelay);
    });
    globals.elements.lobbyButtonSmall.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-lobby-small').tooltipster('close');
    });
    const lobbySmallContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Return to the lobby. (The game will not end and your teammates will have to wait for you to come back.)</span>';
    $('#tooltip-lobby-small').tooltipster('instance').content(lobbySmallContent);

    globals.elements.lobbyButtonBig = new Button({
        x: lobbyButtonValues.x * winW,
        y: lobbyButtonValues.y * winH,
        width: bottomLeftButtonValues.w * winW,
        height: lobbyButtonValues.h * winH,
        text: 'Lobby',
        visible: globals.replay || globals.spectating,
    });
    globals.layers.UI.add(globals.elements.lobbyButtonBig);
    globals.elements.lobbyButtonBig.on('click tap', lobbyButtonClick);
    globals.elements.lobbyButtonBig.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'lobby-big');
        }, globals.tooltipDelay);
    });
    globals.elements.lobbyButtonBig.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-lobby-big').tooltipster('close');
    });
    const lobbyBigContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Return to the lobby.</span>';
    $('#tooltip-lobby-big').tooltipster('instance').content(lobbyBigContent);

    function lobbyButtonClick() {
        // Unregister the click handler to ensure that the user does not double-click
        // and go to the lobby twice
        this.off('click tap');

        // Hide the tooltip, if showing
        if (globals.activeHover) {
            globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            globals.activeHover = null;
        }

        // Stop any timer-related callbacks
        timer.stop();

        globals.lobby.conn.send('gameUnattend');
        globals.game.hide();
    }

    // The kill button (which terminates the current game)
    globals.elements.killButton = new Button({
        x: (bottomLeftButtonValues.x + (bottomLeftButtonValues.w / 2) + shortButtonSpacing) * winW,
        y: (bottomLeftButtonValues.y + (2 * bottomLeftButtonValues.h) + 0.02) * winH,
        width: ((bottomLeftButtonValues.w / 2) - shortButtonSpacing) * winW,
        height: bottomLeftButtonValues.h * winH,
        image: 'skull',
        visible: !globals.replay && !globals.spectating,
    });
    globals.layers.UI.add(globals.elements.killButton);
    globals.elements.killButton.on('click tap', () => {
        globals.lobby.conn.send('gameAbandon');
    });
    globals.elements.killButton.on('mousemove', function mouseMove() {
        globals.activeHover = this;
        setTimeout(() => {
            tooltips.show(this, 'kill');
        }, globals.tooltipDelay);
    });
    globals.elements.killButton.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-kill').tooltipster('close');
    });
    const killContent = '<span style="font-size: 0.75em;"><i class="fas fa-info-circle fa-sm"></i> &nbsp;Terminate the game, ending it immediately.</span>';
    $('#tooltip-kill').tooltipster('instance').content(killContent);
};

const drawDeck = () => {
    deckValues = {
        x: bottomLeftButtonValues.x + bottomLeftButtonValues.w + 0.01,
        y: bottomLeftButtonValues.y,
        w: 0.075,
        h: 0.189,
    };

    // This is the faded rectangle that is hidden until all of the deck has been depleted
    const drawDeckRect = new graphics.Rect({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w * winW,
        height: deckValues.h * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.006 * winW,
    });
    globals.layers.background.add(drawDeckRect);

    // Near the top of the deck, draw the database ID for the respective game
    // (in an ongoing game, this will not show)
    globals.elements.gameIDLabel = new FitText({
        text: `ID: ${globals.id}`,
        x: deckValues.x * winW,
        y: (deckValues.y + 0.01) * winH,
        width: deckValues.w * winW,
        fontFamily: 'Verdana',
        fill: 'white',
        align: 'center',
        fontSize: 0.02 * winH,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: globals.replay && globals.id !== 0,
    });
    globals.layers.UI2.add(globals.elements.gameIDLabel);

    globals.deckSize = stats.getTotalCardsInTheDeck();
    globals.elements.drawDeck = new CardDeck({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w * winW,
        height: deckValues.h * winH,
        cardback: 'deck-back',
        suits: globals.variant.suits,
    });
    globals.layers.card.add(globals.elements.drawDeck);

    // When there are no cards left in the deck,
    // show a label that indicates how many turns are left before the game ends
    const xOffset = 0.017;
    const fontSize = 0.025;
    globals.elements.deckTurnsRemainingLabel1 = basicTextLabel.clone({
        text: 'Turns',
        x: (deckValues.x + xOffset) * winW,
        y: (deckValues.y + deckValues.h - 0.07) * winH,
        fontSize: fontSize * winH,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel1);
    globals.elements.deckTurnsRemainingLabel2 = basicTextLabel.clone({
        text: 'left: #',
        x: (deckValues.x + xOffset) * winW,
        y: (deckValues.y + deckValues.h - 0.04) * winH,
        fontSize: fontSize * winH,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.deckTurnsRemainingLabel2);

    // This is a yellow border around the deck that will appear when only one card is left
    // (if the game option was enabled)
    globals.elements.deckPlayAvailableLabel = new graphics.Rect({
        x: deckValues.x * winW,
        y: deckValues.y * winH,
        width: deckValues.w * winW,
        height: deckValues.h * winH,
        stroke: 'yellow',
        cornerRadius: 6,
        strokeWidth: 10,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);
};

const drawScoreArea = () => {
    // The rectangle that holds the turn, score, and clue count
    scoreAreaValues = {
        x: 0.66,
        y: 0.81,
        w: 0.13,
        h: 0.18,
    };
    if (globals.lobby.settings.showBGAUI) {
        scoreAreaValues.x = deckValues.x + deckValues.w + 0.01;
        scoreAreaValues.y = 0.81;
    }
    globals.elements.scoreArea = new graphics.Group({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
    });
    globals.layers.UI.add(globals.elements.scoreArea);

    // The faded rectangle around the score area
    const scoreAreaRect = new graphics.Rect({
        x: 0,
        y: 0,
        width: scoreAreaValues.w * winW,
        height: scoreAreaValues.h * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.elements.scoreArea.add(scoreAreaRect);

    const labelX = 0.02;
    const labelSpacing = 0.06;

    const turnTextLabel = basicTextLabel.clone({
        text: 'Turn',
        x: labelX * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(turnTextLabel);

    // We also want to be able to right-click the turn to go to a specific turn in the replay
    turnTextLabel.on('click', replay.promptTurn);

    globals.elements.turnNumberLabel = basicNumberLabel.clone({
        text: '1',
        x: (labelX + labelSpacing) * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.turnNumberLabel);

    // We also want to be able to right-click the turn to go to a specific turn in the replay
    globals.elements.turnNumberLabel.on('click', replay.promptTurn);

    const scoreTextLabel = basicTextLabel.clone({
        text: 'Score',
        x: labelX * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(scoreTextLabel);

    globals.elements.scoreNumberLabel = basicNumberLabel.clone({
        text: '0',
        x: (labelX + labelSpacing) * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.scoreNumberLabel);

    globals.elements.maxScoreNumberLabel = basicNumberLabel.clone({
        text: '',
        x: (labelX + labelSpacing) * winW,
        y: 0.05 * winH,
        fontSize: 0.017 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.maxScoreNumberLabel);

    const cluesTextLabel = basicTextLabel.clone({
        text: 'Clues',
        x: labelX * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(cluesTextLabel);

    globals.elements.cluesNumberLabel = basicNumberLabel.clone({
        text: '8',
        x: (labelX + labelSpacing) * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.cluesNumberLabel);

    // Draw the 3 strike (bomb) black squares
    for (let i = 0; i < 3; i++) {
        globals.elements.strikeSquares[i] = new graphics.Rect({
            x: (0.01 + 0.04 * i) * winW,
            y: 0.115 * winH,
            width: 0.03 * winW,
            height: 0.053 * winH,
            fill: 'black',
            opacity: 0.6,
            cornerRadius: 0.003 * winW,
        });
        globals.elements.scoreArea.add(globals.elements.strikeSquares[i]);

        // We also keep track of the turn that the strike happened
        globals.elements.strikeSquares[i].turn = null;

        // Click on an empty square to go to the turn that the strike happened, if any
        globals.elements.strikeSquares[i].on('click', function squareClick() {
            if (this.turn === null) {
                return;
            }
            if (globals.replay) {
                replay.checkDisableSharedTurns();
            } else {
                replay.enter();
            }
            replay.goto(this.turn + 1, true);
        });
    }
};

// The "eyes" symbol to show that one or more people are spectating the game
const drawSpectators = () => {
    // Position it to the bottom-left of the score area
    spectatorsLabelValues = {
        x: scoreAreaValues.x - 0.037,
        y: scoreAreaValues.y + 0.09,
    };
    if (globals.lobby.settings.showBGAUI) {
        // Position it to the bottom-right of the score area
        spectatorsLabelValues.x = scoreAreaValues.x + scoreAreaValues.w + 0.01;
    }
    const size = 0.02 * winW;
    globals.elements.spectatorsLabel = new graphics.Image({
        x: (spectatorsLabelValues.x + 0.005) * winW,
        y: spectatorsLabelValues.y * winH,
        width: size,
        height: size,
        align: 'center',
        image: globals.ImageLoader.get('eyes'),
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.spectatorsLabel);

    // Tooltip for the eyes
    globals.elements.spectatorsLabel.on('mousemove', function spectatorsLabelMouseMove() {
        globals.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-spectators').css('left', tooltipX);
        $('#tooltip-spectators').css('top', this.attrs.y);
        $('#tooltip-spectators').tooltipster('open');
    });
    globals.elements.spectatorsLabel.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-spectators').tooltipster('close');
    });

    globals.elements.spectatorsNumLabel = new graphics.Text({
        x: (spectatorsLabelValues.x - 0.04) * winW,
        y: (spectatorsLabelValues.y + 0.04) * winH,
        width: 0.11 * winW,
        height: 0.03 * winH,
        fontSize: 0.03 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '0',
        fill: labelColor,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.spectatorsNumLabel);
};

// The "crown" symbol to show that we are in a shared replay
const drawSharedReplay = () => {
    const sharedReplayLeaderLabelValues = {
        x: spectatorsLabelValues.x,
        y: spectatorsLabelValues.y - 0.06,
    };

    // A red circle around the crown indicates that we are the current replay leader
    // (we want the icon to be on top of this so that it does not interfere with mouse events)
    globals.elements.sharedReplayLeaderCircle = new graphics.Circle({
        x: (sharedReplayLeaderLabelValues.x + 0.015) * winW,
        y: (sharedReplayLeaderLabelValues.y + 0.015) * winH,
        radius: 0.028 * winH,
        stroke: '#ffe03b', // Yellow
        strokeWidth: 2,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.sharedReplayLeaderCircle);

    // The crown
    const size = 0.025 * winW;
    globals.elements.sharedReplayLeaderLabel = new graphics.Image({
        x: (sharedReplayLeaderLabelValues.x + 0.0025) * winW,
        y: (sharedReplayLeaderLabelValues.y - 0.007) * winH,
        width: size,
        height: size,
        image: globals.ImageLoader.get('crown'),
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.sharedReplayLeaderLabel);

    // Add an animation to alert everyone when shared replay leadership has been transfered
    globals.elements.sharedReplayLeaderLabelPulse = new graphics.Tween({
        node: globals.elements.sharedReplayLeaderLabel,
        width: size * 2,
        height: size * 2,
        offsetX: 0.025 * winH,
        offsetY: 0.025 * winH,
        duration: 0.5,
        easing: graphics.Easings.EaseInOut,
        onFinish: () => {
            globals.elements.sharedReplayLeaderLabelPulse.reverse();
        },
    });
    globals.elements.sharedReplayLeaderLabelPulse.anim.addLayer(globals.layers.UI);

    // Tooltip for the crown
    globals.elements.sharedReplayLeaderLabel.on('mousemove', function sharedReplayLeaderLabelMouseMove() {
        globals.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-leader').css('left', tooltipX);
        $('#tooltip-leader').css('top', this.attrs.y);
        $('#tooltip-leader').tooltipster('open');
    });
    globals.elements.sharedReplayLeaderLabel.on('mouseout', () => {
        globals.activeHover = null;
        $('#tooltip-leader').tooltipster('close');
    });

    // The user can right-click on the crown to pass the replay leader to an arbitrary person
    globals.elements.sharedReplayLeaderLabel.on('click', (event) => {
        // Do nothing if this is not a right-click
        if (event.evt.which !== 3) {
            return;
        }

        // Do nothing if we are not the shared replay leader
        if (!globals.amSharedReplayLeader) {
            return;
        }

        let msg = 'What is the number of the person that you want to pass the replay leader to?\n\n';
        msg += globals.spectators.map((name, i) => `${i + 1} - ${name}\n`).join('');
        let target = window.prompt(msg);
        if (Number.isNaN(target)) {
            return;
        }
        target -= 1;
        target = globals.spectators[target];

        // Only proceed if we chose someone else
        if (target === globals.lobby.username) {
            return;
        }

        globals.lobby.conn.send('replayAction', {
            type: constants.REPLAY_ACTION_TYPE.LEADER_TRANSFER,
            name: target,
        });
    });
};

const drawClueLog = () => {
    clueLogValues = {
        x: 0.8,
        y: 0.01,
        w: 0.19,
        h: 0.51,
    };
    const clueLogRect = new graphics.Rect({
        x: clueLogValues.x * winW,
        y: clueLogValues.y * winH,
        width: clueLogValues.w * winW,
        height: clueLogValues.h * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(clueLogRect);

    const spacing = 0.01;
    globals.elements.clueLog = new ClueLog({
        x: (clueLogValues.x + spacing) * winW,
        y: (clueLogValues.y + spacing) * winH,
        width: (clueLogValues.w - spacing * 2) * winW,
        height: (clueLogValues.h - spacing * 2) * winH,
    });
    globals.layers.UI.add(globals.elements.clueLog);
};

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log)
const drawStatistics = () => {
    const statsRect = new graphics.Rect({
        x: clueLogValues.x * winW,
        y: 0.53 * winH,
        width: clueLogValues.w * winW,
        height: 0.06 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(statsRect);

    const paceTextLabel = basicTextLabel.clone({
        text: 'Pace',
        x: 0.825 * winW,
        y: 0.54 * winH,
        fontSize: 0.02 * winH,
    });
    globals.layers.UI.add(paceTextLabel);

    globals.elements.paceNumberLabel = basicNumberLabel.clone({
        text: '-',
        x: 0.9 * winW,
        y: 0.54 * winH,
        fontSize: 0.02 * winH,
    });
    globals.layers.UI.add(globals.elements.paceNumberLabel);

    const efficiencyTextLabel = basicTextLabel.clone({
        text: 'Efficiency',
        x: 0.825 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
    });
    globals.layers.UI.add(efficiencyTextLabel);

    // We want the "/" to be part of the first label since we don't want
    // to change the color of it later on
    globals.elements.efficiencyNumberLabel = basicNumberLabel.clone({
        text: '- / ',
        x: 0.9 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
    });
    globals.layers.UI.add(globals.elements.efficiencyNumberLabel);

    const minEfficiency = stats.getMinEfficiency();
    globals.elements.efficiencyNumberLabelMinNeeded = basicNumberLabel.clone({
        text: minEfficiency.toString(),
        x: 0.918 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        // "Easy" variants use the default color (off-white)
        // "Hard" variants use pink
        fill: (minEfficiency < 1.25 ? labelColor : '#ffb2b2'),
    });
    globals.layers.UI.add(globals.elements.efficiencyNumberLabelMinNeeded);
};

const drawDiscardArea = () => {
    // This is the invisible rectangle that players drag cards to in order to discard them
    globals.elements.discardArea = new graphics.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.2 * winW,
        height: 0.4 * winH,
    });
    globals.elements.discardArea.isOver = pos => (
        pos.x >= globals.elements.discardArea.getX()
        && pos.y >= globals.elements.discardArea.getY()
        && pos.x <= globals.elements.discardArea.getX() + globals.elements.discardArea.getWidth()
        && pos.y <= globals.elements.discardArea.getY() + globals.elements.discardArea.getHeight()
    );

    // The red border that surrounds the discard pile when the team is at 8 clues
    globals.elements.noDiscardLabel = new graphics.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        stroke: '#df1c2d',
        strokeWidth: 0.005 * winW,
        cornerRadius: 0.01 * winW,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.noDiscardLabel);

    // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
    globals.elements.noDoubleDiscardLabel = new graphics.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        stroke: 'yellow',
        strokeWidth: 0.004 * winW,
        cornerRadius: 0.01 * winW,
        visible: false,
        opacity: 0.75,
    });
    globals.layers.UI.add(globals.elements.noDoubleDiscardLabel);

    // The faded rectangle around the trash can
    const discardAreaRect = new graphics.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(discardAreaRect);

    // The icon over the discard pile
    const img = new graphics.Image({
        x: 0.82 * winW,
        y: 0.62 * winH,
        width: 0.15 * winW,
        height: 0.35 * winH,
        opacity: 0.2,
        image: globals.ImageLoader.get('trashcan'),
    });
    globals.layers.background.add(img);
};

const drawTimers = () => {
    // Just in case, stop the previous timer, if any
    timer.stop();

    // We don't want the timer to show in replays or untimed games
    // (unless they have the optional setting turned on)
    if (globals.replay || (!globals.timed && !globals.lobby.settings.showTimerInUntimed)) {
        return;
    }

    const timerValues = {
        x1: 0.155,
        x2: 0.565,
        y1: 0.592,
        y2: 0.592,
        w: 0.08,
        h: 0.051,
        fontSize: 0.03,
        cornerRadius: 0.05,
        spaceH: 0.01,
    };
    if (globals.lobby.settings.showBGAUI) {
        timerValues.x1 = 0.352;
        timerValues.x2 = timerValues.x1;
        timerValues.y1 = 0.77;
        timerValues.y2 = 0.885;
    }

    // The timer for "You"
    globals.elements.timer1 = new TimerDisplay({
        x: timerValues.x1 * winW,
        y: timerValues.y1 * winH,
        width: timerValues.w * winW,
        height: timerValues.h * winH,
        fontSize: timerValues.fontSize * winH,
        cornerRadius: timerValues.cornerRadius * winH,
        spaceH: timerValues.spaceH * winH,
        label: 'You',
        visible: !globals.spectating,
    });
    globals.layers.timer.add(globals.elements.timer1);

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
        label: 'Current Player',
        visible: false,
    });
    globals.layers.timer.add(globals.elements.timer2);
};

const drawClueArea = () => {
    // Put the clue area directly below the play stacks, with a little bit of spacing
    clueAreaValues = {
        x: playAreaValues.x,
        y: playAreaValues.y + playAreaValues.h + 0.005,
        w: playAreaValues.w,
    };
    if (globals.variant.showSuitNames) {
        clueAreaValues.y += 0.03;
    }
    // In BGA mode, we can afford to put a bit more spacing to make it look less packed together
    if (globals.lobby.settings.showBGAUI) {
        clueAreaValues.y += 0.02;
    }
    globals.elements.clueArea = new graphics.Group({
        x: clueAreaValues.x * winW,
        y: clueAreaValues.y * winH,
        width: clueAreaValues.w * winW,
    });

    // Player buttons
    globals.elements.clueTargetButtonGroup = new ButtonGroup();
    const playerButtonW = 0.08;
    const playerButtonSpacing = 0.0075;
    const totalPlayerButtons = numPlayers - 1;
    let totalPlayerWidth = playerButtonW * totalPlayerButtons;
    totalPlayerWidth += playerButtonSpacing * (totalPlayerButtons - 1);
    let playerX = (clueAreaValues.w * 0.5) - (totalPlayerWidth * 0.5);
    for (let i = 0; i < numPlayers - 1; i++) {
        const j = (globals.playerUs + i + 1) % numPlayers;
        const button = new ClueRecipientButton({
            x: playerX * winW,
            y: 0,
            width: playerButtonW * winW,
            height: 0.025 * winH,
            text: globals.playerNames[j],
            targetIndex: j,
        });
        globals.elements.clueArea.add(button);
        globals.elements.clueTargetButtonGroup.add(button);
        playerX += playerButtonW + playerButtonSpacing;
    }
    globals.elements.clueTargetButtonGroup.selectNextTarget = function selectNextTarget() {
        let newSelectionIndex = 0;
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                newSelectionIndex = (i + 1) % this.list.length;
                break;
            }
        }
        this.list[newSelectionIndex].dispatchEvent(new MouseEvent('click'));
    };

    // Clue type buttons
    globals.elements.clueTypeButtonGroup = new ButtonGroup();
    const buttonW = 0.04;
    const buttonH = 0.071;
    const buttonSpacing = 0.009;

    // Color buttons
    globals.elements.suitClueButtons = [];
    let totalColorWidth = buttonW * globals.variant.clueColors.length;
    totalColorWidth += buttonSpacing * (globals.variant.clueColors.length - 1);
    const colorX = (clueAreaValues.w * 0.5) - (totalColorWidth * 0.5);
    for (let i = 0; i < globals.variant.clueColors.length; i++) {
        const color = globals.variant.clueColors[i];
        const button = new ColorButton({
            x: (colorX + i * (buttonW + buttonSpacing)) * winW,
            y: 0.027 * winH,
            width: buttonW * winW,
            height: buttonH * winH,
            color: color.hexCode,
            text: color.abbreviation,
            clue: new Clue(constants.CLUE_TYPE.COLOR, color),
        });

        globals.elements.clueArea.add(button);
        globals.elements.suitClueButtons.push(button);
        globals.elements.clueTypeButtonGroup.add(button);
    }

    // Rank buttons / number buttons
    globals.elements.rankClueButtons = [];
    let numRanks = 5;
    if (globals.variant.name.startsWith('Multi-Fives')) {
        numRanks = 4;
    }
    let totalRankWidth = buttonW * numRanks;
    totalRankWidth += buttonSpacing * (numRanks - 1);
    const rankX = (clueAreaValues.w * 0.5) - (totalRankWidth * 0.5);
    for (let i = 0; i < numRanks; i++) {
        const button = new NumberButton({
            x: (rankX + i * (buttonW + buttonSpacing)) * winW,
            y: 0.1 * winH,
            width: buttonW * winW,
            height: buttonH * winH,
            number: i + 1,
            clue: new Clue(constants.CLUE_TYPE.RANK, i + 1),
        });

        globals.elements.rankClueButtons.push(button);
        globals.elements.clueArea.add(button);
        globals.elements.clueTypeButtonGroup.add(button);
    }

    // The "Give Clue" button
    const giveClueW = 0.236;
    const giveClueX = (clueAreaValues.w * 0.5) - (giveClueW * 0.5);
    globals.elements.giveClueButton = new Button({
        x: giveClueX * winW,
        y: 0.173 * winH,
        width: giveClueW * winW,
        height: 0.051 * winH,
        text: 'Give Clue',
    });
    globals.elements.giveClueButton.setEnabled(false);
    globals.elements.clueArea.add(globals.elements.giveClueButton);
    globals.elements.giveClueButton.on('click tap', globals.lobby.ui.giveClue);

    globals.elements.clueArea.hide();
    globals.layers.UI.add(globals.elements.clueArea);
};

const drawCurrentPlayerArea = () => {
    // The "Current player: [player name]" box
    const currentPlayerAreaWidth = 0.3; // This is big enough to fit in between the two timers
    const currentPlayerAreaValues = {
        x: clueAreaValues.x + (clueAreaValues.w / 2) - (currentPlayerAreaWidth / 2),
        y: clueAreaValues.y + 0.015,
        w: currentPlayerAreaWidth,
        h: 0.15,
        spacing: 0.006,
    };
    globals.elements.currentPlayerArea = new graphics.Group({
        x: currentPlayerAreaValues.x * winW,
        y: currentPlayerAreaValues.y * winH,
        height: currentPlayerAreaValues.h * winH,
        visible: !globals.replay,
    });
    globals.layers.UI.add(globals.elements.currentPlayerArea);

    let currentPlayerBox1Width = (currentPlayerAreaValues.w * 0.75);
    currentPlayerBox1Width -= currentPlayerAreaValues.spacing;
    globals.elements.currentPlayerRect1 = new graphics.Rect({
        width: currentPlayerBox1Width * winW,
        height: currentPlayerAreaValues.h * winH,
        cornerRadius: 0.01 * winW,
        fill: 'black',
        opacity: 0.2,
    });
    globals.elements.currentPlayerArea.add(globals.elements.currentPlayerRect1);

    const textValues = {
        w: currentPlayerBox1Width - (currentPlayerAreaValues.spacing * 4),
        w2: currentPlayerBox1Width - (currentPlayerAreaValues.spacing * 2),
    };
    textValues.x = (currentPlayerBox1Width / 2) - (textValues.w / 2);
    textValues.x2 = (currentPlayerBox1Width / 2) - (textValues.w2 / 2);

    globals.elements.currentPlayerText1 = new FitText({
        x: textValues.x * winW,
        width: textValues.w * winW,
        fontFamily: 'Verdana',
        fontSize: 0.08 * winH,
        text: 'Current player:',
        align: 'center',
        fill: labelColor,
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    globals.elements.currentPlayerArea.add(globals.elements.currentPlayerText1);

    globals.elements.currentPlayerText2 = new FitText({
        x: textValues.x * winW,
        width: textValues.w * winW,
        fontFamily: 'Verdana',
        fontSize: 0.08 * winH,
        text: '',
        align: 'center',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    globals.elements.currentPlayerArea.add(globals.elements.currentPlayerText2);
    globals.elements.currentPlayerText2.setPlayer = function set(currentPlayerIndex, threeLines) {
        if (globals.ourTurn && !globals.spectating) {
            this.setText('You');
            this.setFill('yellow');
        } else {
            const text = globals.playerNames[currentPlayerIndex] || 'Undefined';
            this.setText(text);
            this.setFill('#ffffcc');
        }
        let maxSize = (currentPlayerAreaValues.h / 3) * winH;
        if (threeLines) {
            maxSize = (currentPlayerAreaValues.h / 4) * winH;
        }
        this.setWidth(textValues.w * winW);
        this.resize();
        while (this._getTextSize(this.getText()).height > maxSize) {
            this.setWidth(this.getWidth() * 0.9);
            this.resize();
        }
        this.setX((globals.elements.currentPlayerRect1.getWidth() / 2) - (this.getWidth() / 2));
    };

    globals.elements.currentPlayerText3 = new FitText({
        x: textValues.x2 * winW,
        width: textValues.w2 * winW,
        fontFamily: 'Verdana',
        fontSize: 0.08 * winH,
        text: '',
        align: 'center',
        fill: 'red',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
        visible: false,
    });
    globals.elements.currentPlayerArea.add(globals.elements.currentPlayerText3);

    const arrowValues = {
        x: (currentPlayerAreaValues.w * 0.75) + currentPlayerAreaValues.spacing,
        w: (currentPlayerAreaValues.w * 0.25) - currentPlayerAreaValues.spacing,
        h: currentPlayerAreaValues.h,
        spacing: 0.01,
    };
    const rect2 = new graphics.Rect({
        x: arrowValues.x * winW,
        width: arrowValues.w * winW,
        height: currentPlayerAreaValues.h * winH,
        cornerRadius: 0.005 * winW,
        fill: 'black',
        opacity: 0.2,
    });
    globals.elements.currentPlayerArea.add(rect2);

    globals.elements.currentPlayerArrow = new graphics.Group({
        x: (arrowValues.x + (arrowValues.w / 2)) * winW,
        y: (currentPlayerAreaValues.h / 2) * winH,
        offset: {
            x: (arrowValues.x + (arrowValues.w / 2) * winW),
            y: (currentPlayerAreaValues.h / 2) * winH,
        },
        listening: false,
    });
    globals.elements.currentPlayerArea.add(globals.elements.currentPlayerArrow);

    const arrowBorder = new graphics.Arrow({
        points: [
            arrowValues.spacing * winW,
            (arrowValues.h / 2) * winH,
            (arrowValues.w - arrowValues.spacing) * winW,
            (arrowValues.h / 2) * winH,
        ],
        pointerLength: 10,
        pointerWidth: 10,
        fill: 'black',
        stroke: 'black',
        strokeWidth: 10,
        shadowBlur: 75,
        shadowOpacity: 1,
        listening: false,
    });
    globals.elements.currentPlayerArrow.add(arrowBorder);

    const arrowBorderEdge = new graphics.Line({
        points: [
            (arrowValues.spacing) * winW,
            ((arrowValues.h / 2) - 0.005) * winH,
            (arrowValues.spacing) * winW,
            ((arrowValues.h / 2) + 0.005) * winH,
        ],
        fill: 'black',
        stroke: 'black',
        strokeWidth: 5,
    });
    globals.elements.currentPlayerArrow.add(arrowBorderEdge);

    const arrowMain = new graphics.Arrow({
        points: [
            arrowValues.spacing * winW,
            (arrowValues.h / 2) * winH,
            (arrowValues.w - arrowValues.spacing) * winW,
            (arrowValues.h / 2) * winH,
        ],
        pointerLength: 10,
        pointerWidth: 10,
        fill: labelColor,
        stroke: labelColor,
        strokeWidth: 5,
        listening: false,
    });
    globals.elements.currentPlayerArrow.add(arrowMain);

    // Set the "Current Player" area up for this specific turn,
    // which will always be either 2 or 3 lines long
    globals.elements.currentPlayerArea.update = function update(currentPlayerIndex) {
        this.setVisible(
            // Don't show it if we are in a solo/shared replay
            // or if we happen to have the in-game replay open
            !globals.inReplay
            // Don't show it if the clue UI is supposed to be there
            && (!globals.ourTurn || globals.clues === 0)
            && currentPlayerIndex !== -1, // Don't show it if this is the end of the game
        );

        if (currentPlayerIndex === -1) {
            // The game has ended
            return;
        }

        // Update the text
        const text1 = globals.elements.currentPlayerText1;
        const text2 = globals.elements.currentPlayerText2;
        const text3 = globals.elements.currentPlayerText3;
        let specialText = '';
        if (globals.clues === 0) {
            specialText = '(cannot clue; 0 clues left)';
            text3.setFill('red');
        } else if (globals.clues === 8) {
            specialText = '(cannot discard; at 8 clues)';
            text3.setFill('red');
        } else if (globals.elements.playerHands[currentPlayerIndex].isLocked()) {
            specialText = '(locked; may not be able to discard)';
            text3.setFill('yellow');
        } else if (globals.elements.noDoubleDiscardLabel.getVisible()) {
            specialText = '(potentially in a "Double Discard" situation)';
            text3.setFill('yellow');
        }
        const totalH = this.getHeight();
        const text1H = text1._getTextSize(text1.getText()).height;
        if (specialText === '') {
            // 2 lines
            text2.setPlayer(currentPlayerIndex, false);
            const text2H = text2._getTextSize(text2.getText()).height;
            const spacing = 0.03 * globals.stage.getHeight();
            text1.setY((totalH / 2) - (text1H / 2) - spacing);
            text2.setY((totalH / 2) - (text2H / 2) + spacing);
            text3.hide();
        } else {
            // 3 lines
            text2.setPlayer(currentPlayerIndex, true);
            const text2H = text2._getTextSize(text2.getText()).height;
            const spacing = 0.04 * globals.stage.getHeight();
            text1.setY((totalH / 2) - (text1H / 2) - spacing);
            text2.setY((totalH / 2) - (text2H / 2) + (spacing * 0.25));
            text3.setY((totalH / 2) - (text1H / 2) + (spacing * 1.5));
            text3.setText(specialText);
            text3.show();
        }

        // Make the arrow point to the current player
        const centerPos = globals.elements.playerHands[currentPlayerIndex].getAbsoluteCenterPos();
        const thisPos = globals.elements.currentPlayerArrow.getAbsolutePosition();
        const x = centerPos.x - thisPos.x;
        const y = centerPos.y - thisPos.y;
        const radians = Math.atan(y / x);
        let rotation = radians * (180 / Math.PI);
        if (x < 0) {
            rotation += 180;
        }

        if (globals.animateFast) {
            globals.elements.currentPlayerArrow.setRotation(rotation);
        } else {
            if (globals.elements.currentPlayerArrowTween) {
                globals.elements.currentPlayerArrowTween.destroy();
            }
            globals.elements.currentPlayerArrowTween = new graphics.Tween({
                node: globals.elements.currentPlayerArrow,
                duration: 0.75,
                rotation,
                runonce: true,
            }).play();
        }
    };
};

const drawPreplayArea = () => {
    const w = 0.29;
    const h = 0.1;
    const x = clueAreaValues.x + (clueAreaValues.w / 2) - (w / 2);
    const y = clueAreaValues.y + 0.05; // "clueAreaValues.h" does not exist
    globals.elements.premoveCancelButton = new Button({
        x: x * winW,
        y: y * winH,
        width: w * winW,
        height: h * winH,
        text: 'Cancel Pre-Move',
        visible: false,
    });
    globals.layers.UI.add(globals.elements.premoveCancelButton);
    globals.elements.premoveCancelButton.on('click tap', () => {
        globals.elements.premoveCancelButton.hide();
        globals.elements.currentPlayerArea.show();
        globals.layers.UI.batchDraw();

        // If we dragged a card, we have to put the card back in the hand
        if (
            globals.queuedAction.data.type === constants.ACT.PLAY
            || globals.queuedAction.data.type === constants.ACT.DISCARD
        ) {
            globals.elements.playerHands[globals.playerUs].doLayout();
        }

        globals.queuedAction = null;
    });
};

const drawReplayArea = () => {
    const replayAreaValues = {
        x: 0.15,
        y: 0.51,
        w: 0.5,
    };
    if (globals.lobby.settings.showBGAUI) {
        replayAreaValues.x = 0.01;
        replayAreaValues.y = 0.49;
        replayAreaValues.w = 0.4;
    }
    globals.elements.replayArea = new graphics.Group({
        x: replayAreaValues.x * winW,
        y: replayAreaValues.y * winH,
        width: replayAreaValues.w * winW,
        height: 0.27 * winH,
    });

    // The thin black rectangle that the replay slider slides on
    const replayBar = new graphics.Rect({
        x: 0,
        y: 0.0425 * winH,
        width: replayAreaValues.w * winW,
        height: 0.01 * winH,
        fill: 'black',
        cornerRadius: 0.005 * winH,
        listening: false,
    });
    globals.elements.replayArea.add(replayBar);

    // An invisible rectangle over the visible black rectangle above
    // (which is slightly bigger so that it is easier to click on)
    const replayBarClickRect = new graphics.Rect({
        x: 0,
        y: 0,
        width: replayAreaValues.w * winW,
        height: 0.05 * winH,
        opacity: 0,
    });
    replayBarClickRect.on('click', replay.barClick);
    globals.elements.replayArea.add(replayBarClickRect);

    const shuttleValues = {
        x: 0,
        y: 0.0325,
        w: 0.03,
        h: 0.03,
        cornerRadius: 0.01,
        stroke: 3,
    };

    // The shared (white) replay shuttle
    // (we want it to be below the normal replay shuttle, so we define it first)
    globals.elements.replayShuttleShared = new graphics.Rect({
        x: shuttleValues.x,
        y: shuttleValues.y * winH,
        width: shuttleValues.w * winW,
        height: shuttleValues.h * winH,
        cornerRadius: shuttleValues.cornerRadius * winW,
        fill: '#d1d1d1', // Gray
        stroke: shuttleValues.stroke,
        visible: !globals.useSharedTurns,
    });
    globals.elements.replayShuttleShared.on('click tap', () => {
        // This is needed because the shared replay shuttle will block the replay bar
        replay.goto(globals.sharedReplayTurn, true);
    });
    globals.elements.replayArea.add(globals.elements.replayShuttleShared);

    // This is the normal (blue) replay shuttle
    globals.elements.replayShuttle = new graphics.Rect({
        x: shuttleValues.x,
        y: shuttleValues.y * winH,
        width: shuttleValues.w * winW,
        height: shuttleValues.h * winH,
        fill: '#0000cc', // Blue
        cornerRadius: shuttleValues.cornerRadius * winW,
        draggable: true,
        dragBoundFunc: replay.barDrag,
        stroke: shuttleValues.stroke,
    });
    globals.elements.replayArea.add(globals.elements.replayShuttle);

    replay.adjustShuttles();

    const replayButtonValues = {
        x: 0.1,
        y: 0.07,
        w: 0.06,
        h: 0.08,
        spacing: 0.02,
    };
    if (globals.lobby.settings.showBGAUI) {
        replayButtonValues.x = 0.05;
    }

    {
        let { x } = replayButtonValues;

        // Go back to the beginning (the left-most button)
        globals.elements.replayBackFullButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-back-full',
        });
        globals.elements.replayBackFullButton.on('click tap', replay.backFull);
        globals.elements.replayArea.add(globals.elements.replayBackFullButton);

        // Go back one turn (the second left-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayBackButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-back',
        });
        globals.elements.replayBackButton.on('click tap', replay.back);
        globals.elements.replayArea.add(globals.elements.replayBackButton);

        // Go forward one turn (the second right-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayForwardButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-forward',
        });
        globals.elements.replayForwardButton.on('click tap', replay.forward);
        globals.elements.replayArea.add(globals.elements.replayForwardButton);

        // Go forward to the end (the right-most button)
        x += replayButtonValues.w + replayButtonValues.spacing;
        globals.elements.replayForwardFullButton = new Button({
            x: x * winW,
            y: 0.07 * winH,
            width: replayButtonValues.w * winW,
            height: replayButtonValues.h * winH,
            image: 'replay-forward-full',
        });
        globals.elements.replayForwardFullButton.on('click tap', replay.forwardFull);
        globals.elements.replayArea.add(globals.elements.replayForwardFullButton);
    }

    // The "Exit Replay" button
    const bottomButtonValues = {
        y: 0.17,
    };
    globals.elements.replayExitButton = new Button({
        x: (replayButtonValues.x + replayButtonValues.w + (replayButtonValues.spacing / 2)) * winW,
        y: bottomButtonValues.y * winH,
        width: ((replayButtonValues.w * 2) + (replayButtonValues.spacing * 2)) * winW,
        height: replayButtonValues.w * winH,
        text: 'Exit Replay',
        visible: !globals.replay,
    });
    globals.elements.replayExitButton.on('click tap', replay.exitButton);
    globals.elements.replayArea.add(globals.elements.replayExitButton);

    const extra = 0.05;
    const bottomLeftReplayButtonValues = {
        x: replayButtonValues.x - extra,
        y: bottomButtonValues.y,
        w: replayButtonValues.w * 2 + replayButtonValues.spacing + extra,
        h: 0.06,
    };

    // The "Pause Shared Turns"  / "Use Shared Turns" button
    // (this will be shown when the client receives the "replayLeader" command)
    globals.elements.toggleSharedTurnButton = new ToggleButton({
        width: bottomLeftReplayButtonValues.w * winW,
        height: bottomLeftReplayButtonValues.h * winH,
        text: 'Pause Shared Turns',
        alternateText: 'Use Shared Turns',
        initialState: !globals.useSharedTurns,
        visible: false,
    });
    // It will be centered if there is only 1 button (and moved left otherwise)
    const totalWidth = (replayButtonValues.w * 4) + (replayButtonValues.spacing * 3);
    globals.elements.toggleSharedTurnButton.setCenter = function setCenter() {
        const x = replayButtonValues.x + ((totalWidth - bottomLeftReplayButtonValues.w) / 2);
        this.setX(x * winW);
        this.setY(bottomLeftReplayButtonValues.y * winH);
    };
    globals.elements.toggleSharedTurnButton.setLeft = function setLeft() {
        this.setX(bottomLeftReplayButtonValues.x * winW);
        this.setY(bottomLeftReplayButtonValues.y * winH);
    };
    globals.elements.toggleSharedTurnButton.on('click tap', replay.toggleSharedTurns);
    globals.elements.replayArea.add(globals.elements.toggleSharedTurnButton);

    const bottomRightReplayButtonValues = {
        x: replayButtonValues.x + (replayButtonValues.w * 2) + (replayButtonValues.spacing * 2),
        y: bottomLeftReplayButtonValues.y,
        w: bottomLeftReplayButtonValues.w,
        h: bottomLeftReplayButtonValues.h,
    };

    // The "Enter Hypothetical" / "Exit Hypothetical" button
    globals.elements.toggleHypoButton = new ToggleButton({
        x: bottomRightReplayButtonValues.x * winW,
        y: bottomRightReplayButtonValues.y * winH,
        width: bottomRightReplayButtonValues.w * winW,
        height: bottomRightReplayButtonValues.h * winH,
        text: 'Enter Hypothetical',
        alternateText: 'Exit Hypothetical',
        initialState: globals.hypothetical,
        visible: globals.replay && globals.amSharedReplayLeader,
    });
    globals.elements.toggleHypoButton.on('click tap', hypothetical.toggle);
    globals.elements.replayArea.add(globals.elements.toggleHypoButton);

    // The "Hypothetical" circle that shows whether or not we are currently in a hypothetical
    globals.elements.hypoCircle = new graphics.Group({
        x: bottomRightReplayButtonValues.x * winW,
        y: bottomRightReplayButtonValues.y * winH,
        visible: globals.hypothetical && !globals.amSharedReplayLeader,
    });
    globals.elements.replayArea.add(globals.elements.hypoCircle);

    const circle = new graphics.Ellipse({
        x: 0.085 * winW,
        y: 0.03 * winH,
        radiusX: 0.08 * winW,
        radiusY: 0.03 * winH,
        fill: 'black',
        opacity: 0.5,
        stroke: 'black',
        strokeWidth: 4,
    });
    globals.elements.hypoCircle.add(circle);

    const text = new FitText({
        name: 'text',
        x: 0.027 * winW,
        y: 0.016 * winH,
        width: bottomRightReplayButtonValues.w * 0.65 * winW,
        listening: false,
        fontSize: 0.5 * winH,
        fontFamily: 'Verdana',
        fill: 'yellow',
        align: 'center',
        text: 'Hypothetical',
    });
    globals.elements.hypoCircle.add(text);

    // Add the replay area to the UI
    globals.elements.replayArea.hide();
    globals.layers.UI.add(globals.elements.replayArea);
};

const drawExtraAnimations = () => {
    // These images are shown to the player to
    // indicate which direction we are moving in a shared replay
    const x = (playAreaValues.x + (playAreaValues.w / 2) - 0.05);
    const y = (playAreaValues.y + (playAreaValues.h / 2) - 0.05);
    const size = 0.1;

    globals.elements.sharedReplayForward = new graphics.Image({
        x: x * winW,
        y: y * winH,
        width: size * winW,
        height: size * winH,
        image: globals.ImageLoader.get('replay-forward'),
        opacity: 0,
    });
    globals.layers.UI2.add(globals.elements.sharedReplayForward);
    globals.elements.sharedReplayForwardTween = new graphics.Tween({
        node: globals.elements.sharedReplayForward,
        duration: 0.5,
        opacity: 1,
        onFinish: () => {
            globals.elements.sharedReplayForwardTween.reverse();
        },
    });

    globals.elements.sharedReplayBackward = new graphics.Image({
        x: x * winW,
        y: y * winH,
        width: size * winW,
        height: size * winH,
        image: globals.ImageLoader.get('replay-back'),
        opacity: 0,
    });
    globals.layers.UI2.add(globals.elements.sharedReplayBackward);
    globals.elements.sharedReplayBackwardTween = new graphics.Tween({
        node: globals.elements.sharedReplayBackward,
        duration: 0.5,
        opacity: 1,
        onFinish: () => {
            globals.elements.sharedReplayBackwardTween.reverse();
        },
    });
};
