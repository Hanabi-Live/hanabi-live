const pixi = require('pixi.js');
const constants = require('../constants');
const globals = require('../globals');
const Button = require('./button');
const cards = require('./cards');
const scoreArea = require('./scoreArea');
const replay = require('./replay');

module.exports = () => {
    // Initialize some global varaibles
    globals.ui = {
        // Canvas size (initialized below)
        w: null,
        h: null,

        // Miscellaneous variables
        lastAction: null, // Changed whenever the client recieves an "action" message, TODO change this
        animateFast: false,
        editingNote: false,

        // Replay varaibles
        replayActivated: false,
        replayTurn: 0,
        replayMax: 0,

        // Shared replay variables
        sharedReplayTurn: 0,
        sharedReplayLeader: '',
        useSharedTurns: true,

        // A collection of all of the drawn objects
        objects: {},
        cards: {},
    };

    // Create the canvas (as a Pixi application) and append it to the DOM
    [globals.ui.w, globals.ui.h] = getCanvasSize();
    globals.app = new pixi.Application({
        width: globals.ui.w,
        height: globals.ui.h,
        antialias: true, // The default is false, but rounded corners look like shit unless this is turned on
    });
    $('#game').append(globals.app.view);

    // Load images
    // http://pixijs.download/release/docs/PIXI.loaders.Loader.html
    const images = [
        ['background', 'public/img/background.jpg'],
        ['trashcan', 'public/img/trashcan.png'],
        ['replay', 'public/img/replay.png'],
        ['rewind', 'public/img/rewind.png'],
        ['rewindfull', 'public/img/rewindfull.png'],
        ['forward', 'public/img/forward.png'],
        ['forwardfull', 'public/img/forwardfull.png'],
    ];
    for (const image of images) {
        pixi.loader.add(image[0], image[1]);
    }
    pixi.loader.load((loader, resources) => {
        // Store a copy of the loaded graphics
        globals.resources = resources;

        // Now that all the images have loaded, draw everything
        draw();
    });
};

// Taken from Keldon's "ui.js"
const getCanvasSize = () => {
    let ww = window.innerWidth;
    let wh = window.innerHeight;

    if (ww < 640) {
        ww = 640;
    }
    if (wh < 360) {
        wh = 360;
    }

    const ratio = 1.777;

    let cw;
    let ch;
    if (ww < wh * ratio) {
        cw = ww;
        ch = ww / ratio;
    } else {
        ch = wh;
        cw = wh * ratio;
    }

    cw = Math.floor(cw);
    ch = Math.floor(ch);

    if (cw > 0.98 * ww) {
        cw = ww;
    }
    if (ch > 0.98 * wh) {
        ch = wh;
    }

    return [cw, ch];
};

const draw = () => {
    // Create images for all of the cards
    cards.init();

    // Apply the green background first
    const background = new pixi.Sprite(globals.resources.background.texture);
    background.width = globals.ui.w;
    background.height = globals.ui.h;
    globals.app.stage.addChild(background);

    // Fade everything when a modal is open
    const fade = new pixi.Graphics();
    fade.beginFill(0, 0.3); // Faded black
    fade.drawRect(
        0,
        0,
        globals.ui.w,
        globals.ui.h,
    );
    fade.endFill();
    fade.visible = false;
    globals.app.stage.addChild(fade);
    globals.ui.objects.fade = fade;

    drawMessageArea();
    drawStacks();
    drawClueHistoryArea();
    drawDeck();
    drawScoreArea();
    drawDiscardPile();

    // TODO this is the fullscreen message log
    /*
    msgLogGroup = new HanabiMsgLog();
    overLayer.add(msgLogGroup);
    */

    /*
    drawDeck = new CardDeck({
        x: 0.08 * globals.ui.w,
        y: 0.8 * globals.ui.h,
        width: 0.075 * globals.ui.w,
        height: 0.189 * globals.ui.h,
        cardback: 'deck-back',
        suits: this.variant.suits,
    });

    drawDeck.cardback.on('dragend.play', function drawDeckDragendPlay() {
        const pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        if (overPlayArea(pos)) {
            ui.postAnimationLayout = () => {
                drawDeck.doLayout();
                ui.postAnimationLayout = null;
            };

            this.setDraggable(false);
            deckPlayAvailableLabel.setVisible(false);

            ui.sendMsg({
                type: 'action',
                resp: {
                    type: ACT.DECKPLAY,
                },
            });

            self.stopAction();

            savedAction = null;
        } else {
            new Kinetic.Tween({
                node: this,
                duration: 0.5,
                x: 0,
                y: 0,
                runonce: true,
                onFinish: () => {
                    UILayer.draw();
                },
            }).play();
        }
    });

    cardLayer.add(drawDeck);

    const nump = this.playerNames.length;

    for (let i = 0; i < nump; i++) {
        let j = i - this.playerUs;

        if (j < 0) {
            j += nump;
        }

        playerHands[i] = new CardLayout({
            x: handPos[nump][j].x * globals.ui.w,
            y: handPos[nump][j].y * globals.ui.h,
            width: handPos[nump][j].w * globals.ui.w,
            height: handPos[nump][j].h * globals.ui.h,
            rotationDeg: handPos[nump][j].rot,
            align: 'center',
            reverse: j === 0,
            invertCards: i !== this.playerUs,
        });

        cardLayer.add(playerHands[i]);

        rect = new Kinetic.Rect({
            x: shadePos[nump][j].x * globals.ui.w,
            y: shadePos[nump][j].y * globals.ui.h,
            width: shadePos[nump][j].w * globals.ui.w,
            height: shadePos[nump][j].h * globals.ui.h,
            rotationDeg: shadePos[nump][j].rot,
            cornerRadius: 0.01 * shadePos[nump][j].w * globals.ui.w,
            opacity: 0.4,
            fillLinearGradientStartPoint: {
                x: 0,
                y: 0,
            },
            fillLinearGradientEndPoint: {
                x: shadePos[nump][j].w * globals.ui.w,
                y: 0,
            },
            fillLinearGradientColorStops: [
                0,
                'rgba(0,0,0,0)',
                0.9,
                'white',
            ],
        });

        if (j === 0) {
            rect.setFillLinearGradientColorStops([
                1,
                'rgba(0,0,0,0)',
                0.1,
                'white',
            ]);
        }

        bgLayer.add(rect);

        nameFrames[i] = new HanabiNameFrame({
            x: namePos[nump][j].x * globals.ui.w,
            y: namePos[nump][j].y * globals.ui.h,
            width: namePos[nump][j].w * globals.ui.w,
            height: namePos[nump][j].h * globals.ui.h,
            name: this.playerNames[i],
        });

        UILayer.add(nameFrames[i]);

        // Draw the tooltips on the player names that show the time
        if (!this.replayOnly) {
            nameFrames[i].on('mousemove', function nameFramesMouseMove() {
                ui.activeHover = this;

                const tooltipX = this.getWidth() / 2 + this.attrs.x;
                const tooltip = $(`#tooltip-player-${i}`);
                tooltip.css('left', tooltipX);
                tooltip.css('top', this.attrs.y);
                tooltip.tooltipster('open');
            });
            nameFrames[i].on('mouseout', () => {
                const tooltip = $(`#tooltip-player-${i}`);
                tooltip.tooltipster('close');
            });
        }
    }

    noClueBox = new Kinetic.Rect({
        x: 0.275 * globals.ui.w,
        y: 0.56 * globals.ui.h,
        width: 0.25 * globals.ui.w,
        height: 0.15 * globals.ui.h,
        cornerRadius: 0.01 * globals.ui.w,
        fill: 'black',
        opacity: 0.5,
        visible: false,
    });

    UILayer.add(noClueBox);

    noClueLabel = new Kinetic.Text({
        x: 0.15 * globals.ui.w,
        y: 0.585 * globals.ui.h,
        width: 0.5 * globals.ui.w,
        height: 0.19 * globals.ui.h,
        fontFamily: 'Verdana',
        fontSize: 0.08 * globals.ui.h,
        strokeWidth: 1,
        text: 'No Clues',
        align: 'center',
        fill: '#df2c4d',
        stroke: 'black',
        visible: false,
    });

    UILayer.add(noClueLabel);

    clueArea = new Kinetic.Group({
        x: 0.10 * globals.ui.w,
        y: 0.54 * globals.ui.h,
        width: 0.55 * globals.ui.w,
        height: 0.27 * globals.ui.h,
    });

    clueTargetButtonGroup = new ButtonGroup();

    clueTargetButtonGroup.selectNextTarget = function selectNextTarget() {
        let newSelectionIndex = 0;
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                newSelectionIndex = (i + 1) % this.list.length;
                break;
            }
        }

        this.list[newSelectionIndex].dispatchEvent(new MouseEvent('click'));
    };

    clueButtonGroup = new ButtonGroup();

    // Store each button inside an array for later
    // (so that we can press them with keyboard hotkeys)
    const rankClueButtons = [];
    const suitClueButtons = [];

    x = 0.26 * globals.ui.w - (nump - 2) * 0.044 * globals.ui.w;

    for (let i = 0; i < nump - 1; i++) {
        const j = (this.playerUs + i + 1) % nump;

        button = new ClueRecipientButton({
            x,
            y: 0,
            width: 0.08 * globals.ui.w,
            height: 0.025 * globals.ui.h,
            text: this.playerNames[j],
            targetIndex: j,
        });

        clueArea.add(button);

        x += 0.0875 * globals.ui.w;

        clueTargetButtonGroup.add(button);
    }

    for (let i = 1; i <= 5; i++) {
        button = new NumberButton({
            x: (0.183 + (i - 1) * 0.049) * globals.ui.w,
            y: 0.027 * globals.ui.h,
            width: 0.04 * globals.ui.w,
            height: 0.071 * globals.ui.h,
            number: i,
            clue: new Clue(CLUE_TYPE.RANK, i),
        });

        // Add it to the tracking array (for keyboard hotkeys)
        rankClueButtons.push(button);

        clueArea.add(button);

        clueButtonGroup.add(button);
    }
    const { clueColors } = this.variant;
    const nClueColors = clueColors.length;
    if (nClueColors === 4) {
        x = 0.208;
    } else if (nClueColors === 5) {
        x = 0.183;
    } else { // nClueColors === 6
        x = 0.158;
    }

    {
        let i = 0;
        for (const color of this.variant.clueColors) {
            button = new ColorButton({
                x: (x + i * 0.049) * globals.ui.w,
                y: 0.1 * globals.ui.h,
                width: 0.04 * globals.ui.w,
                height: 0.071 * globals.ui.h,
                color: color.hexCode,
                text: color.abbreviation,
                clue: new Clue(CLUE_TYPE.COLOR, color),
            });

            clueArea.add(button);

            // Add it to the tracking array (for keyboard hotkeys)
            suitClueButtons.push(button);

            clueButtonGroup.add(button);
            i += 1;
        }
    }

    submitClue = new Button({
        x: 0.183 * globals.ui.w,
        y: 0.172 * globals.ui.h,
        width: 0.236 * globals.ui.w,
        height: 0.051 * globals.ui.h,
        text: 'Give Clue',
    });

    clueArea.add(submitClue);

    clueArea.hide();

    UILayer.add(clueArea);

    // Draw the timer
    this.stopLocalTimer();
    // We don't want the timer to show in replays
    const showTimer = !this.replayOnly && (ui.timedGame || !lobby.hideTimerInUntimed);
    if (showTimer) {
        const timerY = 0.592;

        timer1 = new TimerDisplay({
            x: 0.155 * globals.ui.w,
            y: timerY * globals.ui.h,
            width: 0.08 * globals.ui.w,
            height: 0.051 * globals.ui.h,
            fontSize: 0.03 * globals.ui.h,
            cornerRadius: 0.005 * globals.ui.h,
            spaceH: 0.01 * globals.ui.h,
            label: 'You',
            visible: !this.spectating,
        });

        timerLayer.add(timer1);

        timer2 = new TimerDisplay({
            x: 0.565 * globals.ui.w,
            y: timerY * globals.ui.h,
            width: 0.08 * globals.ui.w,
            height: 0.051 * globals.ui.h,
            fontSize: 0.03 * globals.ui.h,
            labelFontSize: 0.02 * globals.ui.h,
            cornerRadius: 0.005 * globals.ui.h,
            spaceH: 0.01 * globals.ui.h,
            label: 'Current\nPlayer',
            visible: false,
        });

        timerLayer.add(timer2);
    }
    */

    drawReplayUI();
    drawHelpModal();

    /*
    deckPlayAvailableLabel = new Kinetic.Rect({
        x: 0.08 * globals.ui.w,
        y: 0.8 * globals.ui.h,
        width: 0.075 * globals.ui.w,
        height: 0.189 * globals.ui.h,
        stroke: 'yellow',
        cornerRadius: 6,
        strokeWidth: 10,
        visible: false,
    });

    UILayer.add(deckPlayAvailableLabel);

    replayButton = new Button({
        x: 0.01 * globals.ui.w,
        y: 0.8 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.06 * globals.ui.h,
        image: 'replay',
        visible: false,
    });

    replayButton.on('click tap', () => {
        self.enterReplay(!self.replay);
    });

    UILayer.add(replayButton);

    helpButton = new Button({
        x: 0.01 * globals.ui.w,
        y: 0.87 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.06 * globals.ui.h,
        text: 'Help',
    });

    UILayer.add(helpButton);

    helpButton.on('click tap', () => {
        helpGroup.show();
        overback.show();

        overLayer.draw();

        overback.on('click tap', () => {
            overback.off('click tap');

            helpGroup.hide();
            overback.hide();

            overLayer.draw();
        });
    });

    lobbyButton = new Button({
        x: 0.01 * globals.ui.w,
        y: 0.94 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.05 * globals.ui.h,
        text: 'Lobby',
    });

    UILayer.add(lobbyButton);

    lobbyButton.on('click tap', () => {
        lobbyButton.off('click tap');
        ui.sendMsg({
            type: 'gameUnattend',
            resp: {},
        });

        this.stopLocalTimer();

        ui.lobby.gameEnded();
    });

    if (ui.replay) {
        replayArea.show();
    }
    */

    // TODO
    /*
    // The 'eyes' symbol to show that one or more people are spectating the game
    // https://fontawesome.com/icons/eye?style=solid
    const spectatorsText = new pixi.Text('\uf06e', new pixi.TextStyle({
        fontFamily: 'fontawesome',
        // fill: 'grey',
        fontSize: 0.04 * globals.ui.h,
    }));
    const spectatorsTextSprite = new pixi.Sprite(globals.app.renderer.generateTexture(spectatorsText));
    spectatorsTextSprite.x = 0.623 * globals.ui.w;
    spectatorsTextSprite.y = 0.9 * globals.ui.h;
    // spectatorsTextSprite.width = 0.03 * globals.ui.w;
    // spectatorsTextSprite.height = 0.03 * globals.ui.h;
    globals.app.stage.addChild(spectatorsTextSprite);

    spectatorsLabel = new Kinetic.Text({
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
    UILayer.add(spectatorsLabel);

    // Tooltip for the eyes
    spectatorsLabel.on('mousemove', function spectatorsLabelMouseMove() {
        ui.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-spectators').css('left', tooltipX);
        $('#tooltip-spectators').css('top', this.attrs.y);
        $('#tooltip-spectators').tooltipster('open');
    });
    spectatorsLabel.on('mouseout', () => {
        $('#tooltip-spectators').tooltipster('close');
    });

    spectatorsNumLabel = new Kinetic.Text({
        x: 0.583 * globals.ui.w,
        y: 0.934 * globals.ui.h,
        width: 0.11 * globals.ui.w,
        height: 0.03 * globals.ui.h,
        fontSize: 0.03 * globals.ui.h,
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
    UILayer.add(spectatorsNumLabel);

    // Shared replay leader indicator
    sharedReplayLeaderLabel = new Kinetic.Text({
        x: 0.623 * globals.ui.w,
        y: 0.85 * globals.ui.h,
        width: 0.03 * globals.ui.w,
        height: 0.03 * globals.ui.h,
        fontSize: 0.03 * globals.ui.h,
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
    UILayer.add(sharedReplayLeaderLabel);

    // Add an animation to alert everyone when shared replay leadership has been transfered
    sharedReplayLeaderLabelPulse = new Kinetic.Tween({
        node: sharedReplayLeaderLabel,
        scaleX: 2,
        scaleY: 2,
        offsetX: 12,
        offsetY: 10,
        duration: 0.5,
        easing: Kinetic.Easings.EaseInOut,
        onFinish: () => {
            sharedReplayLeaderLabelPulse.reverse();
        },
    });
    sharedReplayLeaderLabelPulse.anim.addLayer(UILayer);

    // Tooltip for the crown
    sharedReplayLeaderLabel.on('mousemove', function sharedReplayLeaderLabelMouseMove() {
        ui.activeHover = this;

        const tooltipX = this.attrs.x + this.getWidth() / 2;
        $('#tooltip-leader').css('left', tooltipX);
        $('#tooltip-leader').css('top', this.attrs.y);
        $('#tooltip-leader').tooltipster('open');
    });
    sharedReplayLeaderLabel.on('mouseout', () => {
        $('#tooltip-leader').tooltipster('close');
    });
    */
};

// The message area is near the top-center of the screen and shows the last three actions taken
function drawMessageArea() {
    const messageArea = new pixi.Container();
    messageArea.x = 0.2 * globals.ui.w;
    messageArea.y = 0.235 * globals.ui.h;
    messageArea.interactive = true;
    globals.app.stage.addChild(messageArea);

    messageArea.on('pointerdown', (evt) => {
        // TODO
        /*
        msgLogGroup.show();
        overback.show();

        overLayer.draw();

        overback.on('click tap', () => {
            overback.off('click tap');

            msgLogGroup.hide();
            overback.hide();

            overLayer.draw();
        });
        */
    });

    const messageAreaBackground = new pixi.Graphics();
    messageAreaBackground.beginFill(0, 0.3);
    messageAreaBackground.drawRoundedRect(
        0,
        0,
        0.4 * globals.ui.w,
        0.098 * globals.ui.h,
        0.01 * globals.ui.h,
    );
    messageAreaBackground.endFill();
    messageArea.addChild(messageAreaBackground);

    /*
    messagePrompt = new MultiFitText({
        align: 'center',
        fontSize: 0.028 * globals.ui.h,
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
        x: 0.21 * globals.ui.w,
        y: 0.238 * globals.ui.h,
        width: 0.38 * globals.ui.w,
        height: 0.095 * globals.ui.h,
        maxLines: 3,
    });
    UILayer.add(messagePrompt);
    */
}

// The play area is in the center of the screen (it contains the stacks)
function drawStacks() {
    // The play area is an invisible rectangle that defines where the user can drag a card to in order to play it
    const playArea = new pixi.Graphics();
    playArea.beginFill(0, 0); // An alpha of 0 makes it invisible
    playArea.drawRect(
        0.183 * globals.ui.w,
        0.3 * globals.ui.h,
        0.435 * globals.ui.w,
        0.189 * globals.ui.h,
    );
    playArea.endFill();
    // We don't have to add this to the stage
    globals.ui.objects.playArea = playArea;

    // The size of each stack will be slightly smaller if there are 6 stacks instead of 5
    const variant = constants.VARIANT_INTEGER_MAPPING[globals.init.variant];
    let y;
    let width;
    let height;
    let offset;
    if (variant.suits.length === 6) {
        // 6 stacks
        y = 0.04;
        width = 0.06;
        height = 0.151;
        offset = 0.019;
    } else {
        // 5 stacks
        y = 0.05;
        width = 0.075;
        height = 0.189;
        offset = 0;
    }

    let playAreaY = 0.345;
    if (variant.showSuitNames) {
        playAreaY = 0.327;
    }

    for (let i = 0; i < variant.suits.length; i++) {
        const suit = variant.suits[i];

        const stackBackTexture = pixi.Texture.fromCanvas(globals.ui.cards[`Card-${suit.name}-0`]);
        const stackBack = new pixi.Sprite(stackBackTexture);
        stackBack.x = (0.183 + (width + 0.015) * i) * globals.ui.w;
        stackBack.y = (playAreaY + offset) * globals.ui.h;
        stackBack.width = width * globals.ui.w;
        stackBack.height = height * globals.ui.h;
        globals.app.stage.addChild(stackBack);

        /*
        const thisSuitPlayStack = new CardStack({
            x: (0.183 + (width + 0.015) * i) * globals.ui.w,
            y: (playAreaY + offset) * globals.ui.h,
            width: width * globals.ui.w,
            height: height * globals.ui.h,
        });
        playStacks.set(suit, thisSuitPlayStack);
        cardLayer.add(thisSuitPlayStack);

        const thisSuitDiscardStack = new CardLayout({
            x: 0.81 * globals.ui.w,
            y: (0.61 + y * i) * globals.ui.h,
            width: 0.17 * globals.ui.w,
            height: 0.17 * globals.ui.h,
        });
        discardStacks.set(suit, thisSuitDiscardStack);
        cardLayer.add(thisSuitDiscardStack);

        // Draw the suit name next to each suit
        // (a text description of the suit)
        if (variant.showSuitNames) {
            let text = suit.name;
            if (
                lobby.showColorblindUI &&
                suit.clueColors.length > 1 &&
                suit !== SUIT.MULTI
            ) {
                const colorList = suit.clueColors.map(c => c.abbreviation).join('/');
                text += ` [${colorList}]`;
            }

            const suitLabelText = new FitText({
                x: (0.173 + (width + 0.015) * i) * globals.ui.w,
                y: (playAreaY + 0.155 + offset) * globals.ui.h,
                width: 0.08 * globals.ui.w,
                height: 0.051 * globals.ui.h,
                fontSize: 0.02 * globals.ui.h,
                fontFamily: 'Verdana',
                align: 'center',
                text,
                fill: '#d8d5ef',
            });
            textLayer.add(suitLabelText);
        }
        */
    }
}

function drawClueHistoryArea() {
    const clueHistoryArea = new pixi.Container();
    clueHistoryArea.x = 0.8 * globals.ui.w;
    clueHistoryArea.y = 0.01 * globals.ui.h;
    globals.app.stage.addChild(clueHistoryArea);

    // The faded rectangle that highlights the clue history area
    const clueHistoryAreaBackground = new pixi.Graphics();
    clueHistoryAreaBackground.beginFill(0, 0.2); // Faded black
    clueHistoryAreaBackground.drawRoundedRect(
        0,
        0,
        0.19 * globals.ui.w,
        0.58 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    clueHistoryAreaBackground.endFill();
    clueHistoryArea.addChild(clueHistoryAreaBackground);

    // TODO
    /*
    clueLog = new HanabiClueLog({
        x: 0.81 * globals.ui.w,
        y: 0.02 * globals.ui.h,
        width: 0.17 * globals.ui.w,
        height: 0.56 * globals.ui.h,
    });
    UILayer.add(clueLog);
    */
}

// The deck is in the bottom left-hand-corner of the screen to the right of the buttons
function drawDeck() {
    const deckArea = new pixi.Container();
    deckArea.x = 0.08 * globals.ui.w;
    deckArea.y = 0.8 * globals.ui.h;
    globals.app.stage.addChild(deckArea);

    // The faded rectangle that highlights the deck area
    const deckAreaBackground = new pixi.Graphics();
    deckAreaBackground.beginFill(0, 0.2); // Faded black
    deckAreaBackground.drawRoundedRect(
        0,
        0,
        0.075 * globals.ui.w,
        0.189 * globals.ui.h,
        0.006 * globals.ui.w,
    );
    deckAreaBackground.endFill();
    deckArea.addChild(deckAreaBackground);
}

// The score area is in the bottom-right-hand corner of the screen to the left of the discard pile
function drawScoreArea() {
    const scoreAreaContainer = new pixi.Container();
    scoreAreaContainer.x = 0.66 * globals.ui.w;
    scoreAreaContainer.y = 0.81 * globals.ui.h;
    globals.app.stage.addChild(scoreAreaContainer);

    // The faded rectangle that highlights the score area
    const scoreAreaBackground = new pixi.Graphics();
    scoreAreaBackground.beginFill(0, 0.2); // Faded black
    scoreAreaBackground.drawRoundedRect(
        0,
        0,
        0.13 * globals.ui.w,
        0.18 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    scoreAreaBackground.endFill();
    scoreAreaContainer.addChild(scoreAreaBackground);

    // 3 boxes that fill up when the team accrues strikes (bombs)
    for (let i = 0; i < 3; i++) {
        const strikeBackground = new pixi.Graphics();
        strikeBackground.beginFill(0, 0.6); // Faded black
        strikeBackground.drawRoundedRect(
            (0.01 + 0.04 * i) * globals.ui.w,
            0.106 * globals.ui.h,
            0.03 * globals.ui.w,
            0.053 * globals.ui.h,
            0.003 * globals.ui.w,
        );
        strikeBackground.endFill();
        scoreAreaContainer.addChild(strikeBackground);
    }

    // The score area has text that shows how many clues are left
    const scoreAreaClues = new pixi.Sprite();
    scoreAreaContainer.addChild(scoreAreaClues);
    globals.ui.objects.scoreAreaClues = scoreAreaClues;
    scoreArea.drawClues(8);

    // The score area has text that shows what the current score is
    const scoreAreaScore = new pixi.Sprite();
    scoreAreaContainer.addChild(scoreAreaScore);
    globals.ui.objects.scoreAreaScore = scoreAreaScore;
    scoreArea.drawScore(0);
}

// The discard pile is in the bottom-right-hand corner of the screen
function drawDiscardPile() {
    // The discard area is an invisible rectangle that defines where the user can drag a card to in order to discard it
    const discardArea = new pixi.Graphics();
    discardArea.beginFill(0, 0); // An alpha of 0 makes it invisible
    discardArea.drawRect(
        0.8 * globals.ui.w,
        0.6 * globals.ui.h,
        0.2 * globals.ui.w,
        0.4 * globals.ui.h,
    );
    discardArea.endFill();
    // We don't have to add this to the stage
    globals.ui.objects.discardArea = discardArea;

    // This is a border around the discard area that appears when the team is at 8 clues
    // in order to signify that it is not possible to discard on this turn
    const discardPileBorder = new pixi.Graphics();
    discardPileBorder.lineStyle(0.007 * globals.ui.w, 0xDF1C2D, 1);
    discardPileBorder.beginFill(0, 0); // An alpha of 0 makes it invisible
    discardPileBorder.drawRoundedRect(
        0.8 * globals.ui.w,
        0.6 * globals.ui.h,
        0.19 * globals.ui.w,
        0.39 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    discardPileBorder.endFill();
    discardPileBorder.visible = false;
    globals.app.stage.addChild(discardPileBorder);
    globals.ui.objects.discardPileBorder = discardPileBorder;

    // The faded rectangle that highlights the discard pile
    const discardPileBackground = new pixi.Graphics();
    discardPileBackground.beginFill(0, 0.2); // Faded black
    discardPileBackground.drawRoundedRect(
        0.8 * globals.ui.w,
        0.6 * globals.ui.h,
        0.19 * globals.ui.w,
        0.39 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    discardPileBackground.endFill();
    globals.app.stage.addChild(discardPileBackground);

    // The trash can graphic
    const trashCan = new pixi.Sprite(globals.resources.trashcan.texture);
    trashCan.x = 0.82 * globals.ui.w;
    trashCan.y = 0.62 * globals.ui.h;
    trashCan.width = 0.15 * globals.ui.w;
    trashCan.height = 0.35 * globals.ui.h;
    trashCan.alpha = 0.2;
    globals.app.stage.addChild(trashCan);
}

// The replay UI is the progress bar, the 4 arrow buttons, and the 3 big buttons
function drawReplayUI() {
    const replayArea = new pixi.Container();
    replayArea.x = 0.15 * globals.ui.w;
    replayArea.y = 0.51 * globals.ui.h;
    replayArea.width = 0.5 * globals.ui.w;
    replayArea.height = 0.27 * globals.ui.h;
    replayArea.visible = false; // The replay UI is hidden by default
    globals.app.stage.addChild(replayArea);
    globals.ui.objects.replayArea = replayArea;

    // The black bar that shows the progress of the replay
    const replayBar = new pixi.Graphics();
    replayBar.beginFill(0); // Black
    replayBar.drawRoundedRect(
        0,
        0.0425 * globals.ui.h,
        0.5 * globals.ui.w,
        0.01 * globals.ui.h,
        0.007 * globals.ui.h,
    );
    replayBar.endFill();
    replayArea.addChild(replayBar);
    globals.ui.objects.replayBar = replayBar;

    // The black bar is quite narrow,
    // so draw a second invisible rectangle overtop of it to catch clicks
    const replayBarClick = new pixi.Graphics();
    replayBarClick.beginFill(0, 0); // An alpha of 0 makes it invisible
    replayBarClick.drawRect(
        0,
        0.03 * globals.ui.h,
        0.5 * globals.ui.w,
        0.035 * globals.ui.h,
    );
    replayBarClick.endFill();
    replayArea.addChild(replayBarClick);

    replayBarClick.interactive = true;
    replayBarClick.on('pointerdown', (evt) => {
        const distanceFromBeginning = evt.data.global.x - replayArea.x;
        const step = replayBar.width / globals.ui.replayMax;
        const newTurn = Math.floor((distanceFromBeginning + step / 2) / step);
        if (newTurn !== globals.ui.replayTurn) {
            replay.checkDisableSharedTurns();
            replay.goto(newTurn, true);
        }
    });

    // The replay shuttle (the oval that shows where in the replay you are)
    const replayShuttle = new pixi.Graphics();
    replayShuttle.beginFill(0x0000cc);
    replayShuttle.drawRoundedRect(
        0,
        0.0325 * globals.ui.h,
        0.03 * globals.ui.w,
        0.03 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    replayShuttle.endFill();
    replayArea.addChild(replayShuttle);
    globals.ui.objects.replayShuttle = replayShuttle;

    replayShuttle.interactive = true;
    replayShuttle.on('pointerdown', (evt) => {
        // TODO
        /*
        const min = this.getParent().getAbsolutePosition().x;
        const w = this.getParent().getWidth() - this.getWidth();
        let shuttleX = pos.x - min;
        const shuttleY = this.getAbsolutePosition().y;
        if (shuttleX < 0) {
            shuttleX = 0;
        }
        if (shuttleX > w) {
            shuttleX = w;
        }
        const step = w / self.replayMax;
        const newTurn = Math.floor((shuttleX + step / 2) / step);
        if (newTurn !== self.replayTurn) {
            disableSharedTurns();
            self.performReplay(newTurn, true);
        }
        shuttleX = newTurn * step;
        return {
            x: min + shuttleX,
            y: shuttleY,
        };
        */
    });

    // The replay shuttle for shared replays
    // (it shows where the rest of the team is at if you are currently detatched)
    const replayShuttleShared = new pixi.Graphics();
    replayShuttleShared.beginFill(0xd1d1d1);
    replayShuttleShared.drawRoundedRect(
        0,
        0.0325 * globals.ui.h,
        0.03 * globals.ui.w,
        0.03 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    replayShuttleShared.endFill();
    replayShuttleShared.visible = false;
    replayArea.addChild(replayShuttleShared);
    globals.ui.objects.replayShuttleShared = replayShuttleShared;

    replayShuttleShared.interactive = true;
    replayShuttleShared.on('pointerdown', (evt) => {
        replay.goto(globals.ui.sharedReplayTurn, true);
    });

    // Rewind to the beginning (the left-most button)
    const replayRewindBeginningButton = new Button({
        x: 0.1 * globals.ui.w,
        y: 0.07 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.08 * globals.ui.h,
        image: 'rewindfull',
        clickFunc: replay.rewindBeginning,
    });
    replayArea.addChild(replayRewindBeginningButton);
    globals.ui.objects.replayRewindBeginningButton = replayRewindBeginningButton;

    // Rewind one turn (the second left-most button)
    const replayRewindButton = new Button({
        x: 0.18 * globals.ui.w,
        y: 0.07 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.08 * globals.ui.h,
        image: 'rewind',
        clickFunc: replay.rewind,
    });
    replayArea.addChild(replayRewindButton);
    globals.ui.objects.replayRewindButton = replayRewindButton;

    // Go forward one turn (the second right-most button)
    const replayForwardButton = new Button({
        x: 0.26 * globals.ui.w,
        y: 0.07 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.08 * globals.ui.h,
        image: 'forward',
        clickFunc: replay.forward,
    });
    replayArea.addChild(replayForwardButton);
    globals.ui.objects.replayForwardButton = replayForwardButton;

    // Go forward to the end (the right-most button)
    const replayForwardEndButton = new Button({
        x: 0.34 * globals.ui.w,
        y: 0.07 * globals.ui.h,
        width: 0.06 * globals.ui.w,
        height: 0.08 * globals.ui.h,
        image: 'forwardfull',
        clickFunc: replay.forwardEnd,
    });
    replayArea.addChild(replayForwardEndButton);
    globals.ui.objects.replayForwardEndButton = replayForwardEndButton;

    // The "Exit Replay" button
    const replayExitButton = new Button({
        x: 0.15 * globals.ui.w,
        y: 0.17 * globals.ui.h,
        width: 0.2 * globals.ui.w,
        height: 0.06 * globals.ui.h,
        text: 'Exit Replay',
        clickFunc: () => {
            replay.exit(false);
        },
    });
    replayArea.addChild(replayExitButton);
    globals.ui.objects.replayExitButton = replayExitButton;

    // The "Pause Shared Turns" button
    const pauseSharedTurnsButton = new Button({
        x: 0.15 * globals.ui.w,
        y: 0.17 * globals.ui.h,
        width: 0.2 * globals.ui.w,
        height: 0.06 * globals.ui.h,
        text: 'Pause Shared Turns',
        clickFunc: () => {
        },
    });
    pauseSharedTurnsButton.visible = false;
    replayArea.addChild(pauseSharedTurnsButton);
    globals.ui.objects.pauseSharedTurnsButton = pauseSharedTurnsButton;

    // The "Use Shared Turns" button
    const useSharedTurnsButton = new Button({
        x: 0.15 * globals.ui.w,
        y: 0.17 * globals.ui.h,
        width: 0.2 * globals.ui.w,
        height: 0.06 * globals.ui.h,
        text: 'Use Shared Turns',
        clickFunc: () => {
        },
    });
    useSharedTurnsButton.visible = false;
    replayArea.addChild(useSharedTurnsButton);
    globals.ui.objects.useSharedTurnsButton = useSharedTurnsButton;
}

// The help modal appears after clicking on the "Help" button
function drawHelpModal() {
    const helpModal = new pixi.Container();
    helpModal.x = 0.1 * globals.ui.w;
    helpModal.y = 0.1 * globals.ui.h;
    helpModal.visible = false; // The help UI is hidden by default
    globals.app.stage.addChild(helpModal);
    globals.ui.objects.helpModal = helpModal;

    const helpModalBox = new pixi.Graphics();
    helpModalBox.beginFill(0, 0.9); // Faded black
    helpModalBox.drawRoundedRect(
        0,
        0,
        0.8 * globals.ui.w,
        0.8 * globals.ui.h,
        0.01 * globals.ui.w,
    );
    helpModalBox.endFill();
    helpModal.addChild(helpModalBox);

    let msg = 'Welcome to Hanabi Live!\n\n';
    msg += 'When it is your turn, you may play a card by dragging it to the play stacks in the center of the screen.\n\n';
    msg += 'To discard, drag a card to the discard area in the lower right. However, note that you are not allowed to discard when there are 8 clues available. (A red border will appear around the discard area to signify this.)\n\n';
    msg += 'To give a clue, use the boxes in the center of the screen. You may mouseover a card to see what clues have been given about it (in the top-right-hand corner).\n\n';
    msg += 'You can double-check what happened in the past by clicking on the replay button (in the bottom-left-hand corner).\n\n';
    msg += 'Keyboard hotkeys:\n';
    msg += '- Play: "a" or "+"\n';
    msg += '- Discard: "d" or "-"\n';
    msg += '- Clue: "Tab", then 1/2/3/4/5 or q/w/e/r/t, then "Enter"\n';
    msg += '- Rewind: "Left", or "[" for a full rotation, or "Home" for the beginning\n';
    msg += '- Fast-forward: "Right", or "]" for a full rotation, or "End" for the end';

    const textMargin = 0.03 * globals.ui.w;
    const text = new pixi.Text(msg, new pixi.TextStyle({
        fontFamily: 'Verdana',
        fontSize: 0.017 * globals.ui.w,
        fill: 'white',
        wordWrap: true,
        wordWrapWidth: helpModalBox.width - (textMargin * 2),
        leading: -2, // The space between lines
    }));
    const textSprite = new pixi.Sprite(globals.app.renderer.generateTexture(text));
    textSprite.x = textMargin;
    textSprite.y = textMargin;
    helpModal.addChild(textSprite);
}
