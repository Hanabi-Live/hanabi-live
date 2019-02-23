/*
    This function draws the UI when going into a game for the first time
*/

// Imports
const globals = require('./globals');
const Button = require('./button');
const ButtonGroup = require('./buttonGroup');
const CardDeck = require('./cardDeck');
const CardStack = require('./cardStack');
const CardLayout = require('./cardLayout');
const Clue = require('./clue');
const ClueRecipientButton = require('./clueRecipientButton');
const ColorButton = require('./colorButton');
const constants = require('../../constants');
const drawHands = require('./drawHands');
const FitText = require('./fitText');
const graphics = require('./graphics');
const HanabiClueLog = require('./clueLog');
const HanabiMsgLog = require('./msgLog');
const MultiFitText = require('./multiFitText');
const NumberButton = require('./numberButton');
const replay = require('./replay');
const timer = require('./timer');
const ToggleButton = require('./toggleButton');

// Variables
let winW;
let winH;
let numPlayers;
let basicTextLabel;
let basicNumberLabel;
let rect; // We reuse this to draw many squares / rectangles
let actionLogValues;
let playStackValues;
let playAreaValues;
let cardWidth;
let cardHeight;
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
    globals.layers.card = new graphics.Layer();
    globals.layers.UI = new graphics.Layer();
    globals.layers.overtop = new graphics.Layer();
    globals.layers.text = new graphics.Layer({
        listening: false,
    });
    globals.layers.timer = new graphics.Layer({
        listening: false,
    });

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
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
    });
    basicNumberLabel = basicTextLabel.clone().setText('0').setWidth(0.03 * winW).align('right');

    // The middle of the screen
    drawActionLog();
    drawPlayStacksAndDiscardStacks();

    // Hands are distributed throughout the screen
    drawHands(); // Contained in a separate file because there is a lot of code

    // The bottom-left
    drawBottomLeftButtons();
    drawDeck();

    // The bottom-right
    drawSpectators();
    drawSharedReplay();
    drawScoreArea();

    // The right-hand column
    drawClueLog();
    drawStatistics();
    drawDiscardArea();

    // Conditional elements
    drawTimers();
    drawClueArea();
    drawPreplayArea();
    drawReplayArea();
    drawExtraAnimations();

    if (globals.inReplay) {
        globals.elements.replayArea.show();
    }

    globals.stage.add(globals.layers.background);
    globals.stage.add(globals.layers.text);
    globals.stage.add(globals.layers.UI);
    globals.stage.add(globals.layers.timer);
    globals.stage.add(globals.layers.card);
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

    // The faded rectange around the action log
    rect = new graphics.Rect({
        x: 0,
        y: 0,
        width: actionLogValues.w * winW,
        height: actionLogValues.h * winH,
        fill: 'black',
        opacity: 0.3,
        cornerRadius: 0.01 * winH,
        listening: true,
    });
    actionLog.add(rect);

    // Clicking on the action log
    rect.on('click tap', () => {
        globals.elements.msgLogGroup.show();
        globals.elements.stageFade.show();

        globals.layers.overtop.draw();

        globals.elements.stageFade.on('click tap', () => {
            globals.elements.stageFade.off('click tap');

            globals.elements.msgLogGroup.hide();
            globals.elements.stageFade.hide();

            globals.layers.overtop.draw();
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
        fill: '#d8d5ef',
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
    globals.elements.msgLogGroup = new HanabiMsgLog();
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
    playStackValues = {
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
                fill: '#d8d5ef',
            });
            globals.layers.text.add(suitLabelText);
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
    // The replay button is invisible by default,
    // since there is no history to replay on the first turn of the game
    globals.elements.replayButton = new Button({
        x: 0.01 * winW,
        y: 0.8 * winH,
        width: 0.06 * winW,
        height: 0.06 * winH,
        image: 'replay',
        visible: false,
    });
    globals.elements.replayButton.on('click tap', () => {
        if (globals.inReplay) {
            replay.exit();
        } else {
            replay.enter();
        }
    });
    globals.layers.UI.add(globals.elements.replayButton);

    // The chat button is not necessary in non-shared replays
    const middleButtonPos = {
        x: 0.01,
        y: 0.87,
        size: 0.06,
    };
    if (!globals.replay || globals.sharedReplay) {
        globals.elements.chatButton = new Button({
            x: middleButtonPos.x * winW,
            y: middleButtonPos.y * winH,
            width: middleButtonPos.size * winW,
            height: middleButtonPos.size * winH,
            text: 'Chat',
            // In speedruns, show the abandon game button by default instead of the chat button
            visible: !globals.speedrun,
        });
        globals.layers.UI.add(globals.elements.chatButton);
        globals.elements.chatButton.on('click tap', () => {
            globals.game.chat.toggle();
        });
    }

    // The kill button is only necessary in non-replays
    if (!globals.replay) {
        globals.elements.killButton = new Button({
            x: middleButtonPos.x * winW,
            y: middleButtonPos.y * winH,
            width: middleButtonPos.size * winW,
            height: middleButtonPos.size * winH,
            image: 'x',
            // In speedruns, show the abandon game button by default instead of the chat button
            visible: globals.speedrun,
        });
        globals.layers.UI.add(globals.elements.killButton);
        globals.elements.killButton.on('click tap', () => {
            globals.lobby.conn.send('gameAbandon');
        });
    }

    // The restart button is shown in shared replays of speedruns that just ended
    globals.elements.restartButton = new Button({
        x: middleButtonPos.x * winW,
        y: middleButtonPos.y * winH,
        width: middleButtonPos.size * winW,
        height: middleButtonPos.size * winH,
        text: 'Restart',
        visible: false,
    });
    globals.layers.UI.add(globals.elements.restartButton);
    globals.elements.restartButton.on('click tap', () => {
        globals.lobby.conn.send('gameRestart');
    });

    const lobbyButton = new Button({
        x: 0.01 * winW,
        y: 0.94 * winH,
        width: 0.06 * winW,
        height: 0.05 * winH,
        text: 'Lobby',
    });
    globals.layers.UI.add(lobbyButton);

    lobbyButton.on('click tap', () => {
        lobbyButton.off('click tap');
        globals.lobby.conn.send('gameUnattend');

        timer.stop();
        globals.game.hide();
    });
};

const drawDeck = () => {
    // This is the faded rectangle that is hidden until all of the deck has been depleted
    const drawDeckRect = new graphics.Rect({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.006 * winW,
    });
    globals.layers.background.add(drawDeckRect);

    globals.elements.drawDeck = new CardDeck({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        cardback: 'deck-back',
        suits: globals.variant.suits,
    });
    globals.layers.card.add(globals.elements.drawDeck);

    globals.elements.deckPlayAvailableLabel = new graphics.Rect({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        stroke: 'yellow',
        cornerRadius: 6,
        strokeWidth: 10,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.deckPlayAvailableLabel);
};

// The "eyes" symbol to show that one or more people are spectating the game
const drawSpectators = () => {
    spectatorsLabelValues = {
        x: 0.623,
        y: 0.9,
    };
    if (globals.lobby.settings.showBGAUI) {
        spectatorsLabelValues.x = 0.01;
        spectatorsLabelValues.y = 0.72;
    }
    globals.elements.spectatorsLabel = new graphics.Text({
        x: spectatorsLabelValues.x * winW,
        y: spectatorsLabelValues.y * winH,
        width: 0.03 * winW,
        height: 0.03 * winH,
        fontSize: 0.03 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '👀',
        fill: 'yellow',
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
        $('#tooltip-spectators').tooltipster('close');
    });

    globals.elements.spectatorsNumLabel = new graphics.Text({
        x: (spectatorsLabelValues.x - 0.04) * winW,
        y: (spectatorsLabelValues.y + 0.034) * winH,
        width: 0.11 * winW,
        height: 0.03 * winH,
        fontSize: 0.03 * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '0',
        fill: '#d8d5ef',
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
        x: 0.623,
        y: 0.84,
        size: 0.03,
    };
    if (globals.lobby.settings.showBGAUI) {
        sharedReplayLeaderLabelValues.x = spectatorsLabelValues.x + 0.03;
        sharedReplayLeaderLabelValues.y = spectatorsLabelValues.y;
    }

    // A red circle around the crown indicates that we are the current replay leader
    // (we want the icon to be on top of this so that it does not interfere with mouse events)
    globals.elements.sharedReplayLeaderCircle = new graphics.Circle({
        x: (sharedReplayLeaderLabelValues.x + 0.015) * winW,
        y: (sharedReplayLeaderLabelValues.y + 0.015) * winH,
        radius: 0.025 * winH,
        stroke: '#ffe03b', // Yellow
        strokeWidth: 2,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.sharedReplayLeaderCircle);

    // The crown emoji
    globals.elements.sharedReplayLeaderLabel = new graphics.Text({
        x: sharedReplayLeaderLabelValues.x * winW,
        y: sharedReplayLeaderLabelValues.y * winH,
        width: sharedReplayLeaderLabelValues.size * winW,
        height: sharedReplayLeaderLabelValues.size * winH,
        fontSize: sharedReplayLeaderLabelValues.size * winH,
        fontFamily: 'Verdana',
        align: 'center',
        text: '👑',
        fill: '#d8d5ef',
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
        width: (sharedReplayLeaderLabelValues.size * winW) * 2,
        height: (sharedReplayLeaderLabelValues.size * winH) * 2,
        fontSize: (sharedReplayLeaderLabelValues.size * winH) * 2,
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
        $('#tooltip-leader').tooltipster('close');
    });

    // The user can right-click on the crown to pass the replay leader to an arbitrary person
    globals.elements.sharedReplayLeaderLabel.on('click', (event) => {
        // Do nothing if this is not a right-click
        if (event.evt.which !== 3) {
            return;
        }

        // Do nothing if we are not the shared replay leader
        if (globals.sharedReplayLeader !== globals.lobby.username) {
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

const drawScoreArea = () => {
    // The rectangle that holds the turn, score, and clue count
    const scoreAreaValues = {
        x: 0.66,
        y: 0.81,
    };
    if (globals.lobby.settings.showBGAUI) {
        scoreAreaValues.x = 0.168;
        scoreAreaValues.y = 0.81;
    }
    globals.elements.scoreArea = new graphics.Group({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
    });
    globals.layers.UI.add(globals.elements.scoreArea);

    // The faded rectangle around the score area
    rect = new graphics.Rect({
        x: 0,
        y: 0,
        width: 0.13 * winW,
        height: 0.18 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.elements.scoreArea.add(rect);

    let labelX = 0.03;
    let labelSpacing = 0.04;
    if (globals.variant.name.startsWith('Clue Starved')) {
        labelX -= 0.005;
        labelSpacing += 0.01;
    }

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
    globals.elements.clueLog = new HanabiClueLog({
        x: (clueLogValues.x + spacing) * winW,
        y: (clueLogValues.y + spacing) * winH,
        width: (clueLogValues.w - spacing * 2) * winW,
        height: (clueLogValues.h - spacing * 2) * winH,
    });
    globals.layers.UI.add(globals.elements.clueLog);
};

// Statistics are shown on the right-hand side of the screen (at the bottom of the clue log)
const drawStatistics = () => {
    rect = new graphics.Rect({
        x: clueLogValues.x * winW,
        y: 0.53 * winH,
        width: clueLogValues.w * winW,
        height: 0.06 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(rect);

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
        align: 'left',
    });
    globals.layers.UI.add(globals.elements.paceNumberLabel);

    const efficiencyTextLabel = basicTextLabel.clone({
        text: 'Efficiency',
        x: 0.825 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
    });
    globals.layers.UI.add(efficiencyTextLabel);

    const effNumLabel = basicNumberLabel.clone({
        text: '- / ',
        x: 0.9 * winW,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        align: 'left',
    });
    globals.layers.UI.add(effNumLabel);
    globals.elements.efficiencyNumberLabel = effNumLabel;

    globals.elements.efficiencyNumberLabelMinNeeded = basicNumberLabel.clone({
        text: '-',
        x: effNumLabel.getX() + effNumLabel._getTextSize(effNumLabel.getText()).width,
        y: 0.56 * winH,
        fontSize: 0.02 * winH,
        align: 'left',
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

    // The faded rectange around the trash can
    rect = new graphics.Rect({
        x: 0.8 * winW,
        y: 0.6 * winH,
        width: 0.19 * winW,
        height: 0.39 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.layers.background.add(rect);

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
    };
    if (globals.lobby.settings.showBGAUI) {
        timerValues.x1 = 0.31;
        timerValues.x2 = 0.31;
        timerValues.y1 = 0.77;
        timerValues.y2 = 0.885;
    }

    globals.elements.timer1 = new timer.TimerDisplay({
        x: timerValues.x1 * winW,
        y: timerValues.y1 * winH,
        width: 0.08 * winW,
        height: 0.051 * winH,
        fontSize: 0.03 * winH,
        cornerRadius: 0.005 * winH,
        spaceH: 0.01 * winH,
        label: 'You',
        visible: !globals.spectating,
    });
    globals.layers.timer.add(globals.elements.timer1);

    globals.elements.timer2 = new timer.TimerDisplay({
        x: timerValues.x2 * winW,
        y: timerValues.y2 * winH,
        width: 0.08 * winW,
        height: 0.051 * winH,
        fontSize: 0.03 * winH,
        labelFontSize: 0.02 * winH,
        cornerRadius: 0.005 * winH,
        spaceH: 0.01 * winH,
        label: 'Current\nPlayer',
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
    globals.elements.clueArea.add(globals.elements.giveClueButton);
    globals.elements.giveClueButton.on('click tap', globals.lobby.ui.giveClue);

    globals.elements.clueArea.hide();
    globals.layers.UI.add(globals.elements.clueArea);

    // The "No Clues" box
    const noClueBoxValues = {
        x: 0.275,
        y: 0.56,
    };
    if (globals.lobby.settings.showBGAUI) {
        noClueBoxValues.x = clueAreaValues.x + 0.178;
        noClueBoxValues.y = clueAreaValues.y;
    }
    globals.elements.noClueBox = new graphics.Rect({
        x: noClueBoxValues.x * winW,
        y: noClueBoxValues.y * winH,
        width: 0.25 * winW,
        height: 0.15 * winH,
        cornerRadius: 0.01 * winW,
        fill: 'black',
        opacity: 0.5,
        visible: false,
    });
    globals.layers.UI.add(globals.elements.noClueBox);

    const noClueLabelValues = {
        x: noClueBoxValues.x - 0.125,
        y: noClueBoxValues.y + 0.025,
    };
    globals.elements.noClueLabel = new graphics.Text({
        x: noClueLabelValues.x * winW,
        y: noClueLabelValues.y * winH,
        width: 0.5 * winW,
        height: 0.19 * winH,
        fontFamily: 'Verdana',
        fontSize: 0.08 * winH,
        strokeWidth: 1,
        text: 'No Clues',
        align: 'center',
        fill: '#df2c4d',
        stroke: 'black',
        visible: false,
    });
    globals.layers.UI.add(globals.elements.noClueLabel);
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
        globals.elements.premoveCancelButton.setVisible(false);
        globals.layers.UI.draw();

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
    // Local variables
    let button;

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

    rect = new graphics.Rect({
        x: 0,
        y: 0,
        width: replayAreaValues.w * winW,
        height: 0.05 * winH,
        opacity: 0,
    });
    rect.on('click', replay.barClick);
    globals.elements.replayArea.add(rect);

    globals.elements.replayShuttle = new graphics.Rect({
        x: 0,
        y: 0.0325 * winH,
        width: 0.03 * winW,
        height: 0.03 * winH,
        fill: '#0000cc',
        cornerRadius: 0.01 * winW,
        draggable: true,
        dragBoundFunc: replay.barDrag,
    });
    globals.elements.replayShuttle.on('dragend', () => {
        globals.layers.card.draw();
        globals.layers.UI.draw();
    });
    globals.elements.replayArea.add(globals.elements.replayShuttle);

    globals.elements.replayShuttleShared = new graphics.Rect({
        x: 0,
        y: 0.0325 * winH,
        width: 0.03 * winW,
        height: 0.03 * winH,
        cornerRadius: 0.01 * winW,
        fill: '#d1d1d1',
        visible: !globals.useSharedTurns,
    });
    globals.elements.replayShuttleShared.on('click tap', () => {
        replay.goto(globals.sharedReplayTurn, true);
    });
    globals.elements.replayArea.add(globals.elements.replayShuttleShared);

    replay.adjustShuttles();

    const replayButtonValues = {
        x: 0.1,
        y: 0.07,
        spacing: 0.08,
    };
    if (globals.lobby.settings.showBGAUI) {
        replayButtonValues.x = 0.05;
    }

    // Go back to the beginning (the left-most button)
    button = new Button({
        x: replayButtonValues.x * winW,
        y: 0.07 * winH,
        width: 0.06 * winW,
        height: 0.08 * winH,
        image: 'replay-back-full',
    });
    button.on('click tap', replay.backFull);
    globals.elements.replayArea.add(button);

    // Go back one turn (the second left-most button)
    button = new Button({
        x: (replayButtonValues.x + replayButtonValues.spacing) * winW,
        y: 0.07 * winH,
        width: 0.06 * winW,
        height: 0.08 * winH,
        image: 'replay-back',
    });
    button.on('click tap', replay.back);
    globals.elements.replayArea.add(button);

    // Go forward one turn (the second right-most button)
    button = new Button({
        x: (replayButtonValues.x + replayButtonValues.spacing * 2) * winW,
        y: 0.07 * winH,
        width: 0.06 * winW,
        height: 0.08 * winH,
        image: 'replay-forward',
    });
    button.on('click tap', replay.forward);
    globals.elements.replayArea.add(button);

    // Go forward to the end (the right-most button)
    button = new Button({
        x: (replayButtonValues.x + replayButtonValues.spacing * 3) * winW,
        y: 0.07 * winH,
        width: 0.06 * winW,
        height: 0.08 * winH,
        image: 'replay-forward-full',
    });
    button.on('click tap', replay.forwardFull);
    globals.elements.replayArea.add(button);

    // The "Exit Replay" button
    globals.elements.replayExitButton = new Button({
        x: (replayButtonValues.x + 0.05) * winW,
        y: 0.17 * winH,
        width: 0.2 * winW,
        height: 0.06 * winH,
        text: 'Exit Replay',
        visible: !globals.replay && !globals.sharedReplay,
    });
    globals.elements.replayExitButton.on('click tap', replay.exitButton);
    globals.elements.replayArea.add(globals.elements.replayExitButton);

    // The "Pause Shared Turns"  / "Use Shared Turns" button
    globals.elements.toggleSharedTurnButton = new ToggleButton({
        x: (replayButtonValues.x + 0.05) * winW,
        y: 0.17 * winH,
        width: 0.2 * winW,
        height: 0.06 * winH,
        text: 'Pause Shared Turns',
        alternateText: 'Use Shared Turns',
        initialState: !globals.useSharedTurns,
        visible: false,
    });
    globals.elements.toggleSharedTurnButton.on('click tap', replay.toggleSharedTurns);
    globals.elements.replayArea.add(globals.elements.toggleSharedTurnButton);

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
    globals.layers.UI.add(globals.elements.sharedReplayForward);
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
    globals.layers.UI.add(globals.elements.sharedReplayBackward);
    globals.elements.sharedReplayBackwardTween = new graphics.Tween({
        node: globals.elements.sharedReplayBackward,
        duration: 0.5,
        opacity: 1,
        onFinish: () => {
            globals.elements.sharedReplayBackwardTween.reverse();
        },
    });
};
