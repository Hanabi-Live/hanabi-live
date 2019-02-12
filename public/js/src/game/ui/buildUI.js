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
const FitText = require('./fitText');
const HanabiClueLog = require('./clueLog');
const HanabiNameFrame = require('./nameFrame');
const HanabiMsgLog = require('./msgLog');
const MultiFitText = require('./multiFitText');
const NumberButton = require('./numberButton');
const replay = require('./replay');
const timer = require('./timer');
const ToggleButton = require('./toggleButton');

module.exports = () => {
    let x;
    let y;
    let width;
    let height;
    let yOffset;
    let rect; // We reuse this to draw many squares / rectangles
    let button; // We reuse this to draw many buttons

    // Constants
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    // Just in case, delete all existing layers
    const layers = globals.stage.getLayers();
    for (let i = 0; i < layers.length; i++) {
        layers[i].remove();
    }

    // Define the layers
    // (they are added to the stage later on at the end of the buildUI function)
    globals.layers.background = new Kinetic.Layer();
    globals.layers.card = new Kinetic.Layer();
    globals.layers.UI = new Kinetic.Layer();
    globals.layers.overtop = new Kinetic.Layer();
    globals.layers.text = new Kinetic.Layer({
        listening: false,
    });
    globals.layers.timer = new Kinetic.Layer({
        listening: false,
    });

    const background = new Kinetic.Image({
        x: 0,
        y: 0,
        width: winW,
        height: winH,
        image: globals.ImageLoader.get('background'),
    });

    globals.layers.background.add(background);

    /*
        Draw the discard area
    */

    // This is the invisible rectangle that players drag cards to in order to discard them
    globals.elements.discardArea = new Kinetic.Rect({
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
    globals.elements.noDiscardLabel = new Kinetic.Rect({
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
    globals.elements.noDoubleDiscardLabel = new Kinetic.Rect({
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
    rect = new Kinetic.Rect({
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
    const img = new Kinetic.Image({
        x: 0.82 * winW,
        y: 0.62 * winH,
        width: 0.15 * winW,
        height: 0.35 * winH,
        opacity: 0.2,
        image: globals.ImageLoader.get('trashcan'),
    });
    globals.layers.background.add(img);

    /*
        The action log
    */

    const actionLogValues = {
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
    const actionLog = new Kinetic.Group({
        x: actionLogValues.x * winW,
        y: actionLogValues.y * winH,
    });
    globals.layers.UI.add(actionLog);

    // The faded rectange around the action log
    rect = new Kinetic.Rect({
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
    globals.elements.stageFade = new Kinetic.Rect({
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

    // The rectangle that holds the turn, score, and clue count
    const scoreAreaValues = {
        x: 0.66,
        y: 0.81,
    };
    if (globals.lobby.settings.showBGAUI) {
        scoreAreaValues.x = 0.168;
        scoreAreaValues.y = 0.81;
    }
    globals.elements.scoreArea = new Kinetic.Group({
        x: scoreAreaValues.x * winW,
        y: scoreAreaValues.y * winH,
    });
    globals.layers.UI.add(globals.elements.scoreArea);

    // The faded rectangle around the score area
    rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: 0.13 * winW,
        height: 0.18 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.01 * winW,
    });
    globals.elements.scoreArea.add(rect);

    const basicTextLabel = new Kinetic.Text({
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

    const basicNumberLabel = basicTextLabel.clone().setText('0').setWidth(0.03 * winW).align('right');

    const turnTextLabel = basicTextLabel.clone({
        text: 'Turn',
        x: 0.03 * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(turnTextLabel);

    globals.elements.turnNumberLabel = basicNumberLabel.clone({
        text: '1',
        x: 0.07 * winW,
        y: 0.01 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.turnNumberLabel);

    const scoreTextLabel = basicTextLabel.clone({
        text: 'Score',
        x: 0.03 * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(scoreTextLabel);

    globals.elements.scoreNumberLabel = basicNumberLabel.clone({
        text: '0',
        x: 0.07 * winW,
        y: 0.045 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.scoreNumberLabel);

    const cluesTextLabel = basicTextLabel.clone({
        text: 'Clues',
        x: 0.03 * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(cluesTextLabel);

    globals.elements.cluesNumberLabel = basicNumberLabel.clone({
        text: '8',
        x: 0.07 * winW,
        y: 0.08 * winH,
    });
    globals.elements.scoreArea.add(globals.elements.cluesNumberLabel);

    // Draw the 3 strike (bomb) black squares
    for (let i = 0; i < 3; i++) {
        const square = new Kinetic.Rect({
            x: (0.01 + 0.04 * i) * winW,
            y: 0.115 * winH,
            width: 0.03 * winW,
            height: 0.053 * winH,
            fill: 'black',
            opacity: 0.6,
            cornerRadius: 0.003 * winW,
        });
        globals.elements.scoreArea.add(square);
    }

    /*
        The "eyes" symbol to show that one or more people are spectating the game
    */

    const spectatorsLabelValues = {
        x: 0.623,
        y: 0.9,
    };
    if (globals.lobby.settings.showBGAUI) {
        spectatorsLabelValues.x = 0.01;
        spectatorsLabelValues.y = 0.72;
    }
    globals.elements.spectatorsLabel = new Kinetic.Text({
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

    globals.elements.spectatorsNumLabel = new Kinetic.Text({
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

    // Shared replay leader indicator
    const sharedReplayLeaderLabelValues = {
        x: 0.623,
        y: 0.85,
    };
    if (globals.lobby.settings.showBGAUI) {
        sharedReplayLeaderLabelValues.x = spectatorsLabelValues.x + 0.03;
        sharedReplayLeaderLabelValues.y = spectatorsLabelValues.y;
    }
    globals.elements.sharedReplayLeaderLabel = new Kinetic.Text({
        x: sharedReplayLeaderLabelValues.x * winW,
        y: sharedReplayLeaderLabelValues.y * winH,
        width: 0.03 * winW,
        height: 0.03 * winH,
        fontSize: 0.03 * winH,
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
    globals.elements.sharedReplayLeaderLabelPulse = new Kinetic.Tween({
        node: globals.elements.sharedReplayLeaderLabel,
        scaleX: 2,
        scaleY: 2,
        offsetX: 12,
        offsetY: 10,
        duration: 0.5,
        easing: Kinetic.Easings.EaseInOut,
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

    /*
        End of spectator / shared replay stuff
    */

    /*
        Draw the clue log
    */

    const clueLogValues = {
        x: 0.8,
        y: 0.01,
        w: 0.19,
        h: 0.51,
    };
    const clueLogRect = new Kinetic.Rect({
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

    /*
        Statistics shown on the right-hand side of the screen (at the bottom of the clue log)
    */

    rect = new Kinetic.Rect({
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

    globals.elements.efficiencyNumberLabel = basicNumberLabel.clone({
        text: '-',
        x: 0.9 * winW,
        y: 0.56 * winH,
        width: 0.08 * winW,
        fontSize: 0.02 * winH,
        align: 'left',
    });
    globals.layers.UI.add(globals.elements.efficiencyNumberLabel);

    /*
        Draw the stacks and the discard pile
    */

    let pileback;
    if (globals.variant.suits.length === 6 || globals.variant.showSuitNames) {
        y = 0.04;
        width = 0.06;
        height = 0.151;
        yOffset = 0.019;
    } else { // 4 or 5 stacks
        y = 0.05;
        width = 0.075;
        height = 0.189;
        yOffset = 0;
    }

    // TODO: move blocks like this into their own functions
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
    if (
        globals.variant.suits.length === 4
        || (globals.variant.suits.length === 5 && globals.variant.showSuitNames)
    ) {
        // If there are only 4 stacks, they will be left-aligned instead of centered
        // So, center them by moving them to the right a little bit
        playStackValues.x += ((width + playStackValues.spacing) / 2);
    } else if (globals.variant.suits.length === 3) {
        // If there are only 3 stacks, they will be left-aligned instead of centered
        // So, center them by moving them to the right a little bit
        playStackValues.x += ((width + playStackValues.spacing) / 2) * 2;
    }
    {
        let i = 0;
        for (const suit of globals.variant.suits) {
            const playStackX = playStackValues.x + (width + playStackValues.spacing) * i;

            pileback = new Kinetic.Image({
                x: playStackX * winW,
                y: playStackValues.y * winH,
                width: width * winW,
                height: height * winH,
                image: globals.cardImages[`Card-${suit.name}-0`],
            });

            globals.layers.background.add(pileback);

            const thisSuitPlayStack = new CardStack({
                x: playStackX * winW,
                y: playStackValues.y * winH,
                width: width * winW,
                height: height * winH,
            });
            globals.elements.playStacks.set(suit, thisSuitPlayStack);
            globals.layers.card.add(thisSuitPlayStack);

            const thisSuitDiscardStack = new CardLayout({
                x: 0.81 * winW,
                y: (0.61 + y * i) * winH,
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
                    x: (playStackValues.x - 0.01 + (width + playStackValues.spacing) * i) * winW, // eslint-disable-line
                    y: (playStackValues.y + 0.155) * winH,
                    width: 0.08 * winW,
                    height: 0.051 * winH,
                    fontSize: 0.02 * winH,
                    fontFamily: 'Verdana',
                    align: 'center',
                    text,
                    fill: '#d8d5ef',
                });
                text.add(suitLabelText);
                globals.elements.suitLabelTexts.push(suitLabelText);
            }

            i += 1;
        }
    }

    // This is the invisible rectangle that players drag cards to in order to play them
    // Make it a little big bigger than the stacks
    const overlap = 0.03;
    const playAreaValues = {
        x: 0.183,
        y: 0.345,
        w: 0.435,
        h: 0.189,
    };
    if (globals.lobby.settings.showBGAUI) {
        playAreaValues.x = 0.01;
        playAreaValues.y = 0.279;
        playAreaValues.w = 0.4;
    }
    globals.elements.playArea = new Kinetic.Rect({
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

    /*
        Draw the deck
    */

    // This is the faded rectangle that is hidden until all of the deck has been depleted
    const drawDeckRect = new Kinetic.Rect({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        fill: 'black',
        opacity: 0.2,
        cornerRadius: 0.006 * winW,
    });
    globals.layers.background.add(drawDeckRect);

    // We also want to be able to right-click the deck if all the cards are drawn
    drawDeckRect.on('click', replay.promptTurn);

    globals.elements.drawDeck = new CardDeck({
        x: 0.08 * winW,
        y: 0.8 * winH,
        width: 0.075 * winW,
        height: 0.189 * winH,
        cardback: 'deck-back',
        suits: globals.variant.suits,
    });
    globals.layers.card.add(globals.elements.drawDeck);

    globals.elements.deckPlayAvailableLabel = new Kinetic.Rect({
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

    /* eslint-disable object-curly-newline */

    const handPos = {
        2: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
            { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0 },
        ],
        3: [
            { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0 },
            { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78 },
            { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78 },
        ],
        4: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78 },
            { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78 },
        ],
        5: [
            { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90 },
            { x: 0.025, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.445, y: 0.009, w: 0.34, h: 0.189, rot: 0 },
            { x: 0.77, y: 0.22, w: 0.301, h: 0.18, rot: 90 },
        ],
    };

    const handPosBGA = {
        2: [],
        3: [],
        4: [],
        5: [],
    };

    const handPosBGAValues = {
        x: 0.44,
        y: 0.04,
        w: 0.34,
        h: 0.16,
        spacing: 0.24,
    };
    for (let i = 2; i <= 5; i++) {
        let handX = handPosBGAValues.x;
        let handY = handPosBGAValues.y;
        let handW = handPosBGAValues.w;
        let handSpacing = handPosBGAValues.spacing;
        if (i >= 4) {
            // The hands only have 4 cards instead of 5,
            // so we need to slightly reposition the hands horizontally
            handX += 0.03;
            handW -= 0.07;
        }
        if (i === 5) {
            handY -= 0.03;
            handSpacing -= 0.042;
        }

        for (let j = 0; j < i; j++) {
            handPosBGA[i].push({
                x: handX,
                y: handY + (handSpacing * j),
                w: handW,
                h: handPosBGAValues.h,
                rot: 0,
            });
        }
    }

    // Set the hand positions for 4-player and 5-player
    // (with 4 cards in the hand)
    const handPosBGAValues4 = {
        x: 0.47,
        y: handPosBGAValues.y,
        w: 0.27,
        h: handPosBGAValues.h,
        rot: handPosBGAValues.rot,
        spacing: handPosBGAValues.spacing,
    };
    for (let j = 0; j < 4; j++) {
        handPosBGA[4].push({
            x: handPosBGAValues4.x,
            y: handPosBGAValues4.y + (handPosBGAValues4.spacing * j),
            w: handPosBGAValues4.w,
            h: handPosBGAValues4.h,
            rot: handPosBGAValues4.rot,
        });
    }

    // This is the position for the white shade that shows where the new side of the hand is
    // (there is no shade on the Board Game Arena mode)
    const shadePos = {
        2: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
            { x: 0.185, y: 0.002, w: 0.43, h: 0.205, rot: 0 },
        ],
        3: [
            { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0 },
            { x: 0.005, y: 0.718, w: 0.42, h: 0.205, rot: -78 },
            { x: 0.708, y: -0.008, w: 0.42, h: 0.205, rot: 78 },
        ],
        4: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.01, y: 0.708, w: 0.35, h: 0.205, rot: -78 },
            { x: 0.225, y: 0.002, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.718, y: 0.087, w: 0.35, h: 0.205, rot: 78 },
        ],
        5: [
            { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.026, y: 0.775, w: 0.311, h: 0.196, rot: -90 },
            { x: 0.02, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.44, y: 0.001, w: 0.35, h: 0.205, rot: 0 },
            { x: 0.774, y: 0.215, w: 0.311, h: 0.196, rot: 90 },
        ],
    };

    const namePosValues = {
        h: 0.02,
    };
    const namePos = {
        2: [
            { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
            { x: 0.18, y: 0.21, w: 0.44, h: namePosValues.h },
        ],
        3: [
            { x: 0.18, y: 0.97, w: 0.44, h: namePosValues.h },
            { x: 0.01, y: 0.765, w: 0.12, h: namePosValues.h },
            { x: 0.67, y: 0.765, w: 0.12, h: namePosValues.h },
        ],
        4: [
            { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
            { x: 0.01, y: 0.74, w: 0.13, h: namePosValues.h },
            { x: 0.22, y: 0.21, w: 0.36, h: namePosValues.h },
            { x: 0.66, y: 0.74, w: 0.13, h: namePosValues.h },
        ],
        5: [
            { x: 0.22, y: 0.97, w: 0.36, h: namePosValues.h },
            { x: 0.025, y: 0.775, w: 0.116, h: namePosValues.h },
            { x: 0.015, y: 0.199, w: 0.36, h: namePosValues.h },
            { x: 0.435, y: 0.199, w: 0.36, h: namePosValues.h },
            { x: 0.659, y: 0.775, w: 0.116, h: namePosValues.h },
        ],
    };

    const namePosBGAMod = {
        x: -0.01,
        y: 0.17,
        w: 0.02,
    };
    const namePosBGA = {
        2: [],
        3: [],
        4: [],
        5: [],
    };
    for (let i = 2; i <= 5; i++) {
        for (let j = 0; j < i; j++) {
            namePosBGA[i].push({
                x: handPosBGA[i][j].x + namePosBGAMod.x,
                y: handPosBGA[i][j].y + namePosBGAMod.y,
                w: handPosBGA[i][j].w + namePosBGAMod.w,
                h: namePosValues.h,
            });
        }
    }

    /* eslint-enable object-curly-newline */

    const nump = globals.playerNames.length;

    const isHandReversed = (j) => {
        // By default, the hand is not reversed
        let reverse = false;

        if (j === 0) {
            // Reverse the ordering of the cards for our own hand
            // (for our hand, the oldest card is the first card, which should be on the right)
            reverse = true;
        }
        if (globals.lobby.settings.showBGAUI) {
            // If Board Game Arena mode is on, then we need to reverse every hand
            reverse = true;
        }
        if (globals.lobby.settings.reverseHands) {
            // If the "Reverse hand direction" option is turned on,
            // then we need to flip the direction of every hand
            reverse = !reverse;
        }

        return reverse;
    };

    // Draw the hands
    for (let i = 0; i < nump; i++) {
        let j = i - globals.playerUs;

        if (j < 0) {
            j += nump;
        }

        let playerHandPos = handPos;
        if (globals.lobby.settings.showBGAUI) {
            playerHandPos = handPosBGA;
        }

        let invertCards = false;
        if (i !== globals.playerUs) {
            // We want to flip the cards for other players
            invertCards = true;
        }
        if (globals.lobby.settings.showBGAUI) {
            // On the BGA layout, all the hands should not be flipped
            invertCards = false;
        }

        globals.elements.playerHands[i] = new CardLayout({
            x: playerHandPos[nump][j].x * winW,
            y: playerHandPos[nump][j].y * winH,
            width: playerHandPos[nump][j].w * winW,
            height: playerHandPos[nump][j].h * winH,
            rotationDeg: playerHandPos[nump][j].rot,
            align: 'center',
            reverse: isHandReversed(j),
            invertCards,
        });
        globals.layers.card.add(globals.elements.playerHands[i]);

        // Draw the faded shade that shows where the "new" side of the hand is
        // (but don't bother drawing it in Board Game Arena mode since
        // all the hands face the same way)
        if (!globals.lobby.settings.showBGAUI) {
            rect = new Kinetic.Rect({
                x: shadePos[nump][j].x * winW,
                y: shadePos[nump][j].y * winH,
                width: shadePos[nump][j].w * winW,
                height: shadePos[nump][j].h * winH,
                rotationDeg: shadePos[nump][j].rot,
                cornerRadius: 0.01 * shadePos[nump][j].w * winW,
                opacity: 0.4,
                fillLinearGradientStartPoint: {
                    x: 0,
                    y: 0,
                },
                fillLinearGradientEndPoint: {
                    x: shadePos[nump][j].w * winW,
                    y: 0,
                },
                fillLinearGradientColorStops: [
                    0,
                    'rgba(0,0,0,0)',
                    0.9,
                    'white',
                ],
            });

            if (isHandReversed(j)) {
                rect.setFillLinearGradientColorStops([
                    1,
                    'rgba(0,0,0,0)',
                    0.1,
                    'white',
                ]);
            }

            globals.layers.background.add(rect);
        }

        let playerNamePos = namePos;
        if (globals.lobby.settings.showBGAUI) {
            playerNamePos = namePosBGA;
        }
        globals.elements.nameFrames[i] = new HanabiNameFrame({
            x: playerNamePos[nump][j].x * winW,
            y: playerNamePos[nump][j].y * winH,
            width: playerNamePos[nump][j].w * winW,
            height: playerNamePos[nump][j].h * winH,
            name: globals.playerNames[i],
            playerNum: i,
        });
        globals.layers.UI.add(globals.elements.nameFrames[i]);

        // Draw the "Detrimental Character Assignments" icon and tooltip
        if (globals.characterAssignments.length > 0) {
            const width2 = 0.03 * winW;
            const height2 = 0.03 * winH;
            const charIcon = new Kinetic.Text({
                width: width2,
                height: height2,
                x: playerNamePos[nump][j].x * winW - width2 / 2,
                y: playerNamePos[nump][j].y * winH - height2 / 2,
                fontSize: 0.03 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text: constants.CHARACTERS[globals.characterAssignments[i]].emoji,
                fill: 'yellow',
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 0,
                    y: 0,
                },
                shadowOpacity: 0.9,
            });
            globals.layers.UI.add(charIcon);

            /* eslint-disable no-loop-func */
            charIcon.on('mousemove', function charIconMouseMove() {
                globals.activeHover = this;

                const tooltipX = this.getWidth() / 2 + this.attrs.x;
                const tooltip = $(`#tooltip-character-assignment-${i}`);
                tooltip.css('left', tooltipX);
                tooltip.css('top', this.attrs.y);

                const character = constants.CHARACTERS[globals.characterAssignments[i]];
                const metadata = globals.characterMetadata[i];
                let content = `<b>${character.name}</b>:<br />${character.description}`;
                if (content.includes('[random color]')) {
                    // Replace "[random color]" with the selected color
                    content = content.replace('[random color]', globals.variant.clueColors[metadata].name.toLowerCase());
                } else if (content.includes('[random number]')) {
                    // Replace "[random number]" with the selected number
                    content = content.replace('[random number]', metadata);
                } else if (content.includes('[random suit]')) {
                    // Replace "[random suit]" with the selected suit name
                    content = content.replace('[random suit]', globals.variant.suits[metadata].name);
                }
                tooltip.tooltipster('instance').content(content);

                tooltip.tooltipster('open');
            });
            /* eslint-enable no-loop-func */
            charIcon.on('mouseout', () => {
                const tooltip = $(`#tooltip-character-assignment-${i}`);
                tooltip.tooltipster('close');
            });
        }
    }

    /*
        Draw the clue area
    */

    const clueAreaValues = {
        x: 0.1,
        y: 0.54,
        w: 0.55, // The width of all of the vanilla cards is 0.435
        h: 0.27,
    };
    if (globals.lobby.settings.showBGAUI) {
        clueAreaValues.x = playStackValues.x - 0.102;
        clueAreaValues.y = playStackValues.y + 0.22;
    }
    globals.elements.clueArea = new Kinetic.Group({
        x: clueAreaValues.x * winW,
        y: clueAreaValues.y * winH,
        width: clueAreaValues.w * winW,
        height: clueAreaValues.h * winH,
    });

    globals.elements.clueTargetButtonGroup = new ButtonGroup();

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

    globals.elements.clueButtonGroup = new ButtonGroup();

    // Store each button inside an array for later
    // (so that we can press them with keyboard hotkeys)
    globals.elements.rankClueButtons = [];
    globals.elements.suitClueButtons = [];

    // Player buttons
    x = 0.26 * winW - (nump - 2) * 0.044 * winW;
    for (let i = 0; i < nump - 1; i++) {
        const j = (globals.playerUs + i + 1) % nump;

        button = new ClueRecipientButton({
            x,
            y: 0,
            width: 0.08 * winW,
            height: 0.025 * winH,
            text: globals.playerNames[j],
            targetIndex: j,
        });

        globals.elements.clueArea.add(button);
        globals.elements.clueTargetButtonGroup.add(button);

        x += 0.0875 * winW;
    }

    // Rank buttons / number buttons
    let numRanks = 5;
    if (globals.variant.name.startsWith('Multi-Fives')) {
        numRanks = 4;
    }
    for (let i = 1; i <= numRanks; i++) {
        x = 0.134 + ((5 - numRanks) * 0.025);
        button = new NumberButton({
            // x: (0.183 + (i - 1) * 0.049) * winW,
            x: (x + i * 0.049) * winW,
            y: 0.027 * winH,
            width: 0.04 * winW,
            height: 0.071 * winH,
            number: i,
            clue: new Clue(constants.CLUE_TYPE.RANK, i),
        });

        // Add it to the button array (for keyboard hotkeys)
        globals.elements.rankClueButtons.push(button);

        globals.elements.clueArea.add(button);

        globals.elements.clueButtonGroup.add(button);
    }

    // Color buttons
    x = 0.158 + ((6 - globals.variant.clueColors.length) * 0.025);
    {
        let i = 0;
        for (const color of globals.variant.clueColors) {
            button = new ColorButton({
                x: (x + i * 0.049) * winW,
                y: 0.1 * winH,
                width: 0.04 * winW,
                height: 0.071 * winH,
                color: color.hexCode,
                text: color.abbreviation,
                clue: new Clue(constants.CLUE_TYPE.COLOR, color),
            });

            globals.elements.clueArea.add(button);

            // Add it to the button array (for keyboard hotkeys)
            globals.elements.suitClueButtons.push(button);

            globals.elements.clueButtonGroup.add(button);
            i += 1;
        }
    }

    // The "Give Clue" button
    globals.elements.giveClueButton = new Button({
        x: 0.183 * winW,
        y: 0.172 * winH,
        width: 0.236 * winW,
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
    globals.elements.noClueBox = new Kinetic.Rect({
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
    globals.elements.noClueLabel = new Kinetic.Text({
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

    /*
        Draw the timer
    */

    // We don't want the timer to show in replays
    if (!globals.replay && (globals.timed || globals.lobby.settings.showTimerInUntimed)) {
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
    }

    // Just in case, stop the previous timer, if any
    timer.stop();

    /*
        Draw the replay area
    */

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
    globals.elements.replayArea = new Kinetic.Group({
        x: replayAreaValues.x * winW,
        y: replayAreaValues.y * winH,
        width: replayAreaValues.w * winW,
        height: 0.27 * winH,
    });

    const replayBar = new Kinetic.Rect({
        x: 0,
        y: 0.0425 * winH,
        width: replayAreaValues.w * winW,
        height: 0.01 * winH,
        fill: 'black',
        cornerRadius: 0.005 * winH,
        listening: false,
    });
    globals.elements.replayArea.add(replayBar);

    rect = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: replayAreaValues.w * winW,
        height: 0.05 * winH,
        opacity: 0,
    });
    rect.on('click', replay.barClick);
    globals.elements.replayArea.add(rect);

    globals.elements.replayShuttle = new Kinetic.Rect({
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

    globals.elements.replayShuttleShared = new Kinetic.Rect({
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
    if (!globals.replay || globals.sharedReplay) {
        globals.elements.chatButton = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            text: 'Chat',
        });
        globals.layers.UI.add(globals.elements.chatButton);
        globals.elements.chatButton.on('click tap', () => {
            globals.game.chat.toggle();
        });
    }

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
