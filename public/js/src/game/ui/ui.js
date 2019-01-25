// Imports
const globals = require('./globals');

function HanabiUI(lobby, game) {
    this.lobby = lobby;
    this.game = game;

    const ui = this;

    const {
        ACT,
        backpath,
        CARD_AREA,
        CARDH,
        CARDW,
        CHARACTERS,
        CLUE_TYPE,
        COLOR,
        drawshape,
        INDICATOR,
        SHAPE_FUNCTIONS,
        SUIT,
    } = constants;

    this.cardsGotten = 0;
    this.cluesSpentPlusStrikes = 0;
    this.useSharedTurns = true;
    this.spectators = []; // Used to keep track of the spectators of the current game

    this.animateFast = true;
    this.ready = false;
    // In replays, we can show information about a card that was not
    // known at the time, but is known now; these are cards we have "learned"
    this.learnedCards = [];

    this.activeHover = null;

    // A function called after an action from the server moves cards
    this.postAnimationLayout = null;

    this.lastTimerUpdateTimeMS = new Date().getTime();

    this.playerTimes = [];
    this.timerID = null;

    // Stored variables for rebuilding the game state
    this.lastAction = null;
    this.activeClockIndex = null;
    this.lastSpectators = null;

    // Users can only update one note at a time to prevent bugs
    this.editingNote = null; // Equal to the card order number or null
    this.editingNoteActionOccured = false;
    // Equal to true if something happened when the note box happens to be open

    // Used for the pre-move feature
    this.ourTurn = false;
    this.queuedAction = null;
    this.currentClues = 8;

    // Used to prevent giving an accidental clue after clicking the "Exit Replay" button or
    // pressing enter to submit a note
    this.accidentalClueTimer = Date.now();

    // This below code block deals with automatic resizing
    // Start listening to resize events and draw canvas
    // (this is commented out because it is currently broken)
    // window.addEventListener('resize', resizeCanvas, false);

    this.stopLocalTimer = function stopLocalTimer() {
        if (ui.timerID !== null) {
            window.clearInterval(ui.timerID);
            ui.timerID = null;
        }
    };

    function redraw() {
        const self = lobby.ui;

        // Unbind duplicateable keybindings
        $(document).off('keydown');

        // Remove drawn elements to prep for a redraw
        stage.destroy();
        stage = new Kinetic.Stage({
            container: 'game',
        });

        // Reset stage to new window size
        sizeStage(stage);

        winW = stage.getWidth();
        winH = stage.getHeight();

        // Rebuild UI elements and cards to new scaling
        self.buildCards();
        self.buildUI();

        self.reset();

        // This resets all the messages so that everything shows up again,
        // since the server doesn't replay them and the client only draws streamed
        // information and doesn't maintain a full game state
        if (globals.replay) {
            rebuildReplay();
        } else {
            // Rebuilds for a game
            let msg;
            let whoseTurn = 0;

            // Iterate over all moves to date
            for (let i = 0; i < globals.replayLog.length; i++) {
                msg = globals.replayLog[i];

                // Rebuild all notifies; this will correctly position cards and text
                self.handleNotify(msg.data);

                // Correctly record and handle whose turn it is
                if (msg.data.type === 'turn') {
                    whoseTurn = msg.data.who;
                }
            }

            // If it's your turn, setup the clue area
            if (whoseTurn === globals.playerUs && !globals.spectating) {
                self.handleAction.call(self, self.lastAction);
            }

            // Setup the timers
            self.handleClock.call(self, self.activeClockIndex);
        }

        // Restore Drag and Drop Functionality
        self.animateFast = false;

        // Restore Replay Button if applicable
        if (!globals.replay && globals.replayMax > 0) {
            replayButton.show();
        }

        // Restore Shared Replay Button if applicable
        if (globals.sharedReplay) {
            self.handleReplayLeader({
                name: globals.sharedReplayLeader,
            });
        }

        // Restore the spectator icon
        if (self.lastSpectators) {
            self.handleSpectators(self.lastSpectators);
        }

        // Restore message text and prompts
        msgLogGroup.refreshText();
        messagePrompt.refreshText();

        // Redraw all layers
        bgLayer.draw();
        textLayer.draw();
        UILayer.draw();
        timerLayer.draw();
        cardLayer.draw();
        overLayer.draw();
    }

    // Iterate over the replay and stop at the current turn or at the end, whichever comes first
    function rebuildReplay() {
        const self = lobby.ui;

        globals.replayPos = 0;
        while (true) {
            const msg = globals.replayLog[globals.replayPos];
            globals.replayPos += 1;

            // Stop at the end of the replay
            if (!msg) {
                break;
            }

            // Rebuild all notifies; this will correctly position cards and text
            self.handleNotify(msg.data);

            // Stop if you're at the current turn
            if (msg.data.type === 'turn') {
                if (msg.data.num === globals.replayTurn) {
                    break;
                }
            }
        }
    }

    // Runs each time the DOM window resize event fires
    // Resets the canvas dimensions to match window,
    // then draws the new borders accordingly
    function resizeCanvas() {
        $('canvas').each((index, canvas) => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            $(canvas).css('width', window.innerWidth);
            $(canvas).css('height', window.innerHeight);
        });
        redraw();
    }

    function cloneCanvas(oldCanvas) {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = oldCanvas.width;
        newCanvas.height = oldCanvas.height;
        const context = newCanvas.getContext('2d');
        context.drawImage(oldCanvas, 0, 0);
        return newCanvas;
    }

    const Clue = function Clue(type, value) {
        this.type = type;
        this.value = value;
    };
    // Convert a clue to the format used by the server, which is identical but
    // for the color value; for the client it is a rich object and for the
    // server a simple integer mapping
    const clueToMsgClue = (clue, variant) => {
        const {
            type: clueType,
            value: clueValue,
        } = clue;
        let msgClueValue;
        if (clueType === CLUE_TYPE.COLOR) {
            const clueColor = clueValue;
            msgClueValue = variant.clueColors.findIndex(color => color === clueColor);
        } else if (clueType === CLUE_TYPE.RANK) {
            msgClueValue = clueValue;
        }
        return {
            type: clueType,
            value: msgClueValue,
        };
    };

    const msgClueToClue = (msgClue, variant) => {
        const {
            type: clueType,
            value: msgClueValue,
        } = msgClue;
        let clueValue;
        if (clueType === CLUE_TYPE.COLOR) {
            clueValue = variant.clueColors[msgClueValue];
        } else { // Rank clue
            clueValue = msgClueValue;
        }
        return new Clue(clueType, clueValue);
    };

    const msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit];

    /*
        Misc. functions
    */

    function pad2(num) {
        if (num < 10) {
            return `0${num}`;
        }
        return `${num}`;
    }

    function millisecondsToTimeDisplay(milliseconds) {
        const seconds = Math.ceil(milliseconds / 1000);
        return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
    }

    function setTickingDownTime(text, activeIndex) {
        // Compute elapsed time since last timer update
        const now = new Date().getTime();
        const timeElapsed = now - ui.lastTimerUpdateTimeMS;
        ui.lastTimerUpdateTimeMS = now;
        if (timeElapsed < 0) {
            return;
        }

        // Update the time in local array to approximate server times
        ui.playerTimes[activeIndex] -= timeElapsed;
        if (globals.timed && ui.playerTimes[activeIndex] < 0) {
            // Don't let the timer go into negative values, or else it will mess up the display
            // (but in non-timed games, we want this to happen)
            ui.playerTimes[activeIndex] = 0;
        }

        let millisecondsLeft = ui.playerTimes[activeIndex];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            millisecondsLeft *= -1;
        }
        const displayString = millisecondsToTimeDisplay(millisecondsLeft);

        // Update display
        text.setText(displayString);
        text.getLayer().batchDraw();

        // Play a sound to indicate that the current player is almost out of time
        // Do not play it more frequently than about once per second
        if (
            globals.timed
            && lobby.settings.sendTimerSound
            && millisecondsLeft > 0
            && millisecondsLeft <= 10000
            && timeElapsed > 900
            && timeElapsed < 1100
            && !lobby.errorOccured
        ) {
            ui.game.sounds.play('tone');
        }
    }

    function setTickingDownTimeTooltip(i) {
        let time = ui.playerTimes[i];
        if (!globals.timed) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }

        let content = 'Time ';
        if (globals.timed) {
            content += 'remaining';
        } else {
            content += 'taken';
        }
        content += ':<br /><strong>';
        content += millisecondsToTimeDisplay(time);
        content += '</strong>';
        $(`#tooltip-player-${i}`).tooltipster('instance').content(content);
    }

    function imageName(card) {
        let prefix = 'Card';

        const learnedCard = ui.learnedCards[card.order];

        const rank = (!card.showOnlyLearned && card.trueRank);
        const empathyPastRankUncertain = card.showOnlyLearned && card.possibleRanks.length > 1;

        const suit = (!card.showOnlyLearned && card.trueSuit);
        const empathyPastSuitUncertain = card.showOnlyLearned && card.possibleSuits.length > 1;

        let suitToShow = suit || learnedCard.suit || SUIT.GRAY;
        if (empathyPastSuitUncertain) {
            suitToShow = SUIT.GRAY;
        }

        // For whatever reason, Card-Gray is never created, so use NoPip-Gray
        if (suitToShow === SUIT.GRAY) {
            prefix = 'NoPip';
        }

        let name = `${prefix}-${suitToShow.name}-`;
        if (empathyPastRankUncertain) {
            name += '6';
        } else {
            name += rank || learnedCard.rank || '6';
        }
        return name;
    }

    const scaleCardImage = function scaleCardImage(context, name) {
        const width = this.getWidth();
        const height = this.getHeight();
        const am = this.getAbsoluteTransform();
        let src = cardImages[name];

        if (!src) {
            console.error(`The image "${name}" was not generated.`);
            return;
        }

        const dw = Math.sqrt(am.m[0] * am.m[0] + am.m[1] * am.m[1]) * width;
        const dh = Math.sqrt(am.m[2] * am.m[2] + am.m[3] * am.m[3]) * height;

        if (dw < 1 || dh < 1) {
            return;
        }

        let sw = width;
        let sh = height;
        let steps = 0;

        if (!scaleCardImages[name]) {
            scaleCardImages[name] = [];
        }

        // Scaling the card down in steps of half in each dimension presumably improves the scaling?
        while (dw < sw / 2) {
            let scaleCanvas = scaleCardImages[name][steps];
            sw = Math.floor(sw / 2);
            sh = Math.floor(sh / 2);

            if (!scaleCanvas) {
                scaleCanvas = document.createElement('canvas');
                scaleCanvas.width = sw;
                scaleCanvas.height = sh;

                const scaleContext = scaleCanvas.getContext('2d');

                scaleContext.drawImage(src, 0, 0, sw, sh);

                scaleCardImages[name][steps] = scaleCanvas;
            }

            src = scaleCanvas;

            steps += 1;
        }

        context.drawImage(src, 0, 0, width, height);
    };

    const drawSuitShape = (suit, i) => {
        // Suit shapes go in order from left to right, with the exception of rainbow suits,
        // which are always given a rainbow symbol
        if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
            // The final shape function in the array is the rainbow
            i = SHAPE_FUNCTIONS.length - 1;
        }
        return SHAPE_FUNCTIONS[i];
    };

    const FitText = function FitText(config) {
        Kinetic.Text.call(this, config);

        this.origFontSize = this.getFontSize();
        this.needsResize = true;

        this.setDrawFunc(function setDrawFunc(context) {
            if (this.needsResize) {
                this.resize();
            }
            Kinetic.Text.prototype._sceneFunc.call(this, context);
        });
    };

    Kinetic.Util.extend(FitText, Kinetic.Text);

    FitText.prototype.resize = function resize() {
        this.setFontSize(this.origFontSize);

        while (
            this._getTextSize(this.getText()).width > this.getWidth()
            && this.getFontSize() > 5
        ) {
            this.setFontSize(this.getFontSize() * 0.9);
        }

        this.needsResize = false;
    };

    FitText.prototype.setText = function setText(text) {
        Kinetic.Text.prototype.setText.call(this, text);

        this.needsResize = true;
    };

    const MultiFitText = function MultiFitText(config) {
        Kinetic.Group.call(this, config);
        this.maxLines = config.maxLines;
        this.smallHistory = [];
        for (let i = 0; i < this.maxLines; i++) {
            const newConfig = $.extend({}, config);

            newConfig.height = config.height / this.maxLines;
            newConfig.x = 0;
            newConfig.y = i * newConfig.height;

            const childText = new FitText(newConfig);
            Kinetic.Group.prototype.add.call(this, childText);
        }
    };
    Kinetic.Util.extend(MultiFitText, Kinetic.Group);

    MultiFitText.prototype.setMultiText = function setMultiText(text) {
        if (this.smallHistory.length >= this.maxLines) {
            this.smallHistory.shift();
        }
        this.smallHistory.push(text);

        // Performance optimization: setText on the children is slow,
        // so don't actually do it until its time to display things
        // We also have to call refreshText after any time we manipulate replay position
        if (!globals.inReplay || !ui.animateFast) {
            this.refreshText();
        }
    };

    MultiFitText.prototype.refreshText = function refreshText() {
        for (let i = 0; i < this.children.length; i++) {
            let msg = this.smallHistory[i];
            if (!msg) {
                msg = '';
            }
            this.children[i].setText(msg);
        }
    };

    MultiFitText.prototype.reset = function reset() {
        this.smallHistory = [];
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].setText('');
        }
    };

    const HanabiMsgLog = function HanabiMsgLog(config) {
        const baseConfig = {
            x: 0.2 * winW,
            y: 0.02 * winH,
            width: 0.4 * winW,
            height: 0.96 * winH,
            clipX: 0,
            clipY: 0,
            clipWidth: 0.4 * winW,
            clipHeight: 0.96 * winH,
            visible: false,
            listening: false,
        };

        $.extend(baseConfig, config);
        Kinetic.Group.call(this, baseConfig);

        const rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.4 * winW,
            height: 0.96 * winH,
            fill: 'black',
            opacity: 0.9,
            cornerRadius: 0.01 * winW,
        });

        Kinetic.Group.prototype.add.call(this, rect);

        const textoptions = {
            fontSize: 0.025 * winH,
            fontFamily: 'Verdana',
            fill: 'white',
            x: 0.04 * winW,
            y: 0.01 * winH,
            width: 0.35 * winW,
            height: 0.94 * winH,
            maxLines: 38,
        };

        this.logtext = new MultiFitText(textoptions);
        Kinetic.Group.prototype.add.call(this, this.logtext);

        const numbersoptions = {
            fontSize: 0.025 * winH,
            fontFamily: 'Verdana',
            fill: 'lightgrey',
            x: 0.01 * winW,
            y: 0.01 * winH,
            width: 0.03 * winW,
            height: 0.94 * winH,
            maxLines: 38,
        };
        this.lognumbers = new MultiFitText(numbersoptions);
        Kinetic.Group.prototype.add.call(this, this.lognumbers);

        this.playerLogs = [];
        this.playerLogNumbers = [];
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i] = new MultiFitText(textoptions);
            this.playerLogs[i].hide();
            Kinetic.Group.prototype.add.call(this, this.playerLogs[i]);

            this.playerLogNumbers[i] = new MultiFitText(numbersoptions);
            this.playerLogNumbers[i].hide();
            Kinetic.Group.prototype.add.call(this, this.playerLogNumbers[i]);
        }
    };

    Kinetic.Util.extend(HanabiMsgLog, Kinetic.Group);

    HanabiMsgLog.prototype.addMessage = function addMessage(msg) {
        const appendLine = (log, numbers, line) => {
            log.setMultiText(line);
            numbers.setMultiText(drawDeck.getCountAsString());
        };

        appendLine(this.logtext, this.lognumbers, msg);
        for (let i = 0; i < globals.playerNames.length; i++) {
            if (msg.startsWith(globals.playerNames[i])) {
                appendLine(this.playerLogs[i], this.playerLogNumbers[i], msg);
                break;
            }
        }
    };

    HanabiMsgLog.prototype.showPlayerActions = function showPlayerActions(playerName) {
        let playerIDX;
        for (let i = 0; i < globals.playerNames.length; i++) {
            if (globals.playerNames[i] === playerName) {
                playerIDX = i;
            }
        }
        this.logtext.hide();
        this.lognumbers.hide();
        this.playerLogs[playerIDX].show();
        this.playerLogNumbers[playerIDX].show();

        this.show();

        overback.show();
        overLayer.draw();

        const thislog = this;
        overback.on('click tap', () => {
            overback.off('click tap');
            thislog.playerLogs[playerIDX].hide();
            thislog.playerLogNumbers[playerIDX].hide();

            thislog.logtext.show();
            thislog.lognumbers.show();
            thislog.hide();
            overback.hide();
            overLayer.draw();
        });
    };

    HanabiMsgLog.prototype.refreshText = function refreshText() {
        this.logtext.refreshText();
        this.lognumbers.refreshText();
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i].refreshText();
            this.playerLogNumbers[i].refreshText();
        }
    };

    HanabiMsgLog.prototype.reset = function reset() {
        this.logtext.reset();
        this.lognumbers.reset();
        for (let i = 0; i < globals.playerNames.length; i++) {
            this.playerLogs[i].reset();
            this.playerLogNumbers[i].reset();
        }
    };

    // dynamically adjusted known cards, to be restored by event
    const toggledHolderViewCards = [];

    const HanabiCard = function HanabiCard(config) {
        const self = this;

        config.width = CARDW;
        config.height = CARDH;
        config.x = CARDW / 2;
        config.y = CARDH / 2;
        config.offset = {
            x: CARDW / 2,
            y: CARDH / 2,
        };

        Kinetic.Group.call(this, config);

        this.bare = new Kinetic.Image({
            width: config.width,
            height: config.height,
        });

        this.doRotations = function doRotations(inverted = false) {
            this.setRotation(inverted ? 180 : 0);

            this.bare.setRotation(inverted ? 180 : 0);
            this.bare.setX(inverted ? config.width : 0);
            this.bare.setY(inverted ? config.height : 0);
        };

        this.bare.setDrawFunc(function setDrawFunc(context) {
            scaleCardImage.call(this, context, self.barename);
        });

        this.add(this.bare);

        this.trueSuit = config.suit || undefined;
        this.trueRank = config.rank || undefined;
        this.suitKnown = function suitKnown() {
            return this.trueSuit !== undefined;
        };
        this.rankKnown = function rankKnown() {
            return this.trueRank !== undefined;
        };
        this.identityKnown = function identityKnown() {
            return this.suitKnown() && this.rankKnown();
        };
        this.order = config.order;
        // possible suits and ranks (based on clues given) are tracked separately from knowledge of
        // the true suit and rank
        this.possibleSuits = config.suits;
        this.possibleRanks = config.ranks;
        this.rankPips = new Kinetic.Group({
            x: 0,
            y: Math.floor(CARDH * 0.85),
            width: CARDW,
            height: Math.floor(CARDH * 0.15),
            visible: !this.rankKnown(),
        });
        this.suitPips = new Kinetic.Group({
            x: 0,
            y: 0,
            width: Math.floor(CARDW),
            height: Math.floor(CARDH),
            visible: !this.suitKnown(),
        });
        this.add(this.rankPips);
        this.add(this.suitPips);
        const cardPresentKnowledge = ui.learnedCards[this.order];
        if (cardPresentKnowledge.rank) {
            this.rankPips.visible(false);
        }
        if (cardPresentKnowledge.suit) {
            this.suitPips.visible(false);
        }
        if (globals.replay) {
            this.rankPips.visible(false);
            this.suitPips.visible(false);
        }

        for (const i of config.ranks) {
            const rankPip = new Kinetic.Rect({
                x: Math.floor(CARDW * (i * 0.19 - 0.14)),
                y: 0,
                width: Math.floor(CARDW * 0.15),
                height: Math.floor(CARDH * 0.10),
                fill: 'black',
                stroke: 'black',
                name: i.toString(),
                listening: false,
            });
            if (!ui.learnedCards[this.order].possibleRanks.includes(i)) {
                rankPip.setOpacity(0.3);
            }
            this.rankPips.add(rankPip);
        }

        {
            const { suits } = config;
            const nSuits = suits.length;
            for (let i = 0; i < suits.length; i++) {
                const suit = suits[i];

                let fill = suit.fillColors.hexCode;
                if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
                    fill = undefined;
                }

                const suitPip = new Kinetic.Shape({
                    x: Math.floor(CARDW * 0.5),
                    y: Math.floor(CARDH * 0.5),

                    // Scale numbers are magic
                    scale: {
                        x: 0.4,
                        y: 0.4,
                    },

                    // Transform polar to cartesian coordinates
                    // The magic number added to the offset is needed to center things properly;
                    // We don't know why it's needed;
                    // perhaps something to do with the shape functions
                    offset: {
                        x: Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25), // eslint-disable-line
                        y: Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3), // eslint-disable-line
                    },
                    fill,
                    stroke: 'black',
                    name: suit.name,
                    listening: false,
                    drawFunc: (ctx) => {
                        drawSuitShape(suit, i)(ctx);
                        ctx.closePath();
                        ctx.fillStrokeShape(suitPip);
                    },
                });

                // Gradient numbers are magic
                if (suit === SUIT.RAINBOW || suit === SUIT.RAINBOW1OE) {
                    suitPip.fillRadialGradientColorStops([
                        0.3, suit.fillColors[0].hexCode,
                        0.425, suit.fillColors[1].hexCode,
                        0.65, suit.fillColors[2].hexCode,
                        0.875, suit.fillColors[3].hexCode,
                        1, suit.fillColors[4].hexCode,
                    ]);
                    suitPip.fillRadialGradientStartPoint({
                        x: 75,
                        y: 140,
                    });
                    suitPip.fillRadialGradientEndPoint({
                        x: 75,
                        y: 140,
                    });
                    suitPip.fillRadialGradientStartRadius(0);
                    suitPip.fillRadialGradientEndRadius(Math.floor(CARDW * 0.25));
                }
                suitPip.rotation(0);

                // Reduce opactity of eliminated suits and outline remaining suits
                if (!ui.learnedCards[this.order].possibleSuits.includes(suit)) {
                    suitPip.setOpacity(0.4);
                } else {
                    suitPip.setStrokeWidth(5);
                }

                this.suitPips.add(suitPip);
            }
        }

        this.barename = undefined;
        this.showOnlyLearned = false;

        this.setBareImage();

        this.cluedBorder = new Kinetic.Rect({
            x: 3,
            y: 3,
            width: config.width - 6,
            height: config.height - 6,
            cornerRadius: 6,
            strokeWidth: 16,
            stroke: '#ffdf00',
            visible: false,
            listening: false,
        });

        this.add(this.cluedBorder);

        this.indicatorArrow = new Kinetic.Text({
            x: config.width * 1.01,
            y: config.height * 0.18,
            width: config.width,
            height: 0.5 * config.height,
            fontSize: 0.2 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: '⬆',
            rotation: 180,
            fill: '#ffffff',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
            listening: false,
        });

        this.add(this.indicatorArrow);

        // Define the note indicator emoji (this used to be a white square)
        const noteX = 0.78;
        const noteY = 0.06;
        this.noteGiven = new Kinetic.Text({
            x: noteX * config.width,
            // If the cards have triangles on the corners that show the color composition,
            // the note emoji will overlap
            // Thus, we move it downwards if this is the case
            y: (globals.variant.offsetCardIndicators ? noteY + 0.1 : noteY) * config.height,
            fontSize: 0.1 * config.height,
            fontFamily: 'Verdana',
            align: 'center',
            text: '📝',
            rotation: 180,
            fill: '#ffffff',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
            listening: false,
        });
        this.noteGiven.setScale({
            x: -1,
            y: -1,
        });
        this.noteGiven.rotated = false;
        // (we might rotate it later to indicate to spectators that the note was updated)
        this.add(this.noteGiven);
        if (ui.getNote(this.order)) {
            this.noteGiven.show();
        }

        /*
            Define event handlers
            Multiple handlers may set activeHover
        */

        const cardTooltipOpen = () => {
            const tooltip = $(`#tooltip-card-${self.order}`);
            const tooltipInstance = tooltip.tooltipster('instance');

            // Do nothing if the tooltip is already open
            if (tooltip.tooltipster('status').open) {
                return;
            }

            // We want the tooltip to appear above the card by default
            const pos = self.getAbsolutePosition();
            let posX = pos.x;
            let posY = pos.y - (self.getHeight() * self.parent.scale().y / 2);
            tooltipInstance.option('side', 'top');

            // Flip the tooltip if it is too close to the top of the screen
            if (posY < 200) {
                // 200 is just an arbitrary threshold; 100 is not big enough for the BGA layout
                posY = pos.y + (self.getHeight() * self.parent.scale().y / 2);
                tooltipInstance.option('side', 'bottom');
            }

            // If there is an clue arrow showing, it will overlap with the tooltip arrow,
            // so move it over to the right a little bit
            if (self.indicatorArrow.visible()) {
                posX = pos.x + ((self.getWidth() * self.parent.scale().x / 2) / 2.5);
            }

            // Update the tooltip and open it
            tooltip.css('left', posX);
            tooltip.css('top', posY);
            tooltipInstance.content(ui.getNote(self.order) || '');
            tooltip.tooltipster('open');
        };

        this.on('mousemove', function cardMouseMove() {
            // Don't do anything if there is not a note on this card
            if (!self.noteGiven.visible()) {
                return;
            }

            // If we are spectating and there is an new note, mark it as seen
            if (self.noteGiven.rotated) {
                self.noteGiven.rotated = false;
                self.noteGiven.rotate(-15);
                cardLayer.batchDraw();
            }

            // Don't open any more note tooltips if the user is currently editing a note
            if (ui.editingNote !== null) {
                return;
            }

            ui.activeHover = this;
            cardTooltipOpen();
        });

        this.on('mouseout', () => {
            // Don't close the tooltip if we are currently editing a note
            if (ui.editingNote !== null) {
                return;
            }

            const tooltip = $(`#tooltip-card-${self.order}`);
            tooltip.tooltipster('close');
        });

        this.on('mousemove tap', () => {
            clueLog.showMatches(self);
            UILayer.draw();
        });

        this.on('mouseout', () => {
            clueLog.showMatches(null);
            UILayer.draw();
        });

        // Empathy feature
        // Show teammate view of their hand, or past view of your own hand
        // Pips visibility state is tracked so it can be restored for your own hand during a game
        const toggleHolderViewOnCard = (c, enabled, togglePips) => {
            const toggledPips = [0, 0];
            if (c.rankPips.visible() !== enabled && togglePips[0] === 1) {
                c.rankPips.setVisible(enabled);
                toggledPips[0] = 1;
            }
            if (c.suitPips.visible() !== enabled && togglePips[1] === 1) {
                c.suitPips.setVisible(enabled);
                toggledPips[1] = 1;
            }
            c.showOnlyLearned = enabled;
            c.setBareImage();
            return toggledPips;
        };
        const endHolderViewOnCard = function endHolderViewOnCard(toggledPips) {
            const cardsToReset = toggledHolderViewCards.splice(0, toggledHolderViewCards.length);
            cardsToReset.map(
                (card, index) => toggleHolderViewOnCard(card, false, toggledPips[index]),
            );
            cardLayer.batchDraw();
        };
        const beginHolderViewOnCard = function beginHolderViewOnCard(cards) {
            if (toggledHolderViewCards.length > 0) {
                return undefined; // data race with stop
            }

            toggledHolderViewCards.splice(0, 0, ...cards);
            const toggledPips = cards.map(c => toggleHolderViewOnCard(c, true, [1, 1]));
            cardLayer.batchDraw();
            return toggledPips;
        };
        if (config.holder !== globals.playerUs || globals.inReplay || globals.spectating) {
            const mouseButton = 1;
            let toggledPips = [];
            this.on('mousedown', (event) => {
                // Do nothing if shift is being held
                if (window.event.shiftKey) {
                    return;
                }

                if (event.evt.which !== mouseButton) {
                    return;
                }

                ui.activeHover = this;
                const cards = this.parent.parent.children.map(c => c.children[0]);
                toggledPips = beginHolderViewOnCard(cards);
            });
            this.on('mouseup mouseout', (event) => {
                if (event.type === 'mouseup' && event.evt.which !== mouseButton) {
                    return;
                }
                endHolderViewOnCard(toggledPips);
            });
        }

        // Hide clue arrows ahead of user dragging their card
        if (config.holder === globals.playerUs && !globals.replay && !globals.spectating) {
            this.on('mousedown', (event) => {
                if (
                    event.evt.which !== 1 // dragging uses left click
                    || globals.inReplay
                    || !this.indicatorArrow.isVisible()
                ) {
                    return;
                }

                showClueMatch(-1);
                // Do not prevent default since the other event is starting
            });
        }

        this.on('click', (event) => {
            // Do nothing if shift is being held
            if (window.event.shiftKey) {
                return;
            }

            // In a shared replay, the leader right-clicks a card to draw attention to it
            if (
                globals.sharedReplay
                && event.evt.which === 3 // Right-click
                && globals.sharedReplayLeader === lobby.username
            ) {
                if (ui.useSharedTurns) {
                    ui.sendMsg({
                        type: 'replayAction',
                        data: {
                            type: 1,
                            order: self.order,
                        },
                    });

                    // Draw the indicator for the user manually so that
                    // we don't have to wait for the client to server round-trip
                    ui.handleReplayIndicator({
                        order: self.order,
                    });
                }

                return;
            }

            // In a non-shared replay, a user might still want to draw an arrow on a card
            // for demonstration purposes
            if (window.event.ctrlKey) {
                ui.handleReplayIndicator({
                    order: self.order,
                });
                return;
            }

            if (event.evt.which !== 3) { // Right-click
                // We only care about right clicks
                return;
            }

            // Don't edit any notes in shared replays
            if (globals.sharedReplay) {
                return;
            }

            // Close any existing note tooltips
            if (ui.editingNote !== null) {
                const tooltip = $(`#tooltip-card-${ui.editingNote}`);
                tooltip.tooltipster('close');
            }

            cardTooltipOpen();

            ui.editingNote = self.order;
            let note = ui.getNote(self.order);
            if (note === null) {
                note = '';
            }
            const tooltip = $(`#tooltip-card-${self.order}`);
            const tooltipInstance = tooltip.tooltipster('instance');
            tooltipInstance.content(`<input id="tooltip-card-${self.order}-input" type="text" value="${note}"/>`);

            $(`#tooltip-card-${self.order}-input`).on('keydown', (keyEvent) => {
                keyEvent.stopPropagation();
                if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
                    return;
                }

                ui.editingNote = null;

                if (keyEvent.key === 'Escape') {
                    note = ui.getNote(self.order);
                    if (note === null) {
                        note = '';
                    }
                } else if (keyEvent.key === 'Enter') {
                    note = $(`#tooltip-card-${self.order}-input`).val();

                    // Strip any HTML elements
                    // (to be thorough, the server will also perform this validation)
                    note = stripHTMLtags(note);

                    ui.setNote(self.order, note);

                    // Also send the note to the server
                    if (!globals.replay && !globals.spectating) {
                        ui.sendMsg({
                            type: 'note',
                            data: {
                                order: self.order,
                                note,
                            },
                        });
                    }

                    // Check to see if an event happened while we were editing this note
                    if (ui.editingNoteActionOccured) {
                        ui.editingNoteActionOccured = false;
                        tooltip.tooltipster('close');
                    }

                    // Mark the time that we submitted the note
                    // (so that we can avoid an accidental double enter press)
                    ui.accidentalClueTimer = Date.now();
                }

                tooltipInstance.content(note);
                self.noteGiven.setVisible(note.length > 0);
                if (note.length === 0) {
                    tooltip.tooltipster('close');
                }

                UILayer.draw();
                cardLayer.draw();
            });

            // Automatically highlight all of the existing text when a note input box is focused
            $(`#tooltip-card-${self.order}-input`).focus(function tooltipCardInputFocus() {
                $(this).select();
            });

            // Automatically focus the new text input box
            $(`#tooltip-card-${self.order}-input`).focus();
        });

        // Catch clicks for making arbitrary cards (for hypothetical situation creation)
        this.on('mousedown', () => {
            // Do nothing if shift is not being held
            if (!window.event.shiftKey) {
                return;
            }

            // Only allow this feature in replays
            if (!globals.replay) {
                return;
            }

            const card = prompt('What card do you want to morph it into?\n(e.g. "b1", "k2", "m3", "11", "65")');
            if (card === null || card.length !== 2) {
                return;
            }
            const suitLetter = card[0];
            let suit;
            if (suitLetter === 'b' || suitLetter === '1') {
                suit = 0;
            } else if (suitLetter === 'g' || suitLetter === '2') {
                suit = 1;
            } else if (suitLetter === 'y' || suitLetter === '3') {
                suit = 2;
            } else if (suitLetter === 'r' || suitLetter === '4') {
                suit = 3;
            } else if (suitLetter === 'p' || suitLetter === '5') {
                suit = 4;
            } else if (suitLetter === 'k' || suitLetter === 'm' || suitLetter === '6') {
                suit = 5;
            } else {
                return;
            }
            const rank = parseInt(card[1], 10);
            if (Number.isNaN(rank)) {
                return;
            }

            // Tell the server that we are doing a hypothetical
            if (globals.sharedReplayLeader === lobby.username) {
                ui.sendMsg({
                    type: 'replayAction',
                    data: {
                        type: 3,
                        order: self.order,
                        suit,
                        rank,
                    },
                });
            }

            // Send the reveal message manually so that
            // we don't have to wait for the client to server round-trip
            const revealMsg = {
                type: 'reveal',
                which: {
                    order: self.order,
                    rank,
                    suit,
                },
            };
            ui.handleNotify(revealMsg);
        });

        this.isClued = function isClued() {
            return this.cluedBorder.visible();
        };
    };

    Kinetic.Util.extend(HanabiCard, Kinetic.Group);

    HanabiCard.prototype.setBareImage = function setBareImage() {
        this.barename = imageName(this);
    };

    HanabiCard.prototype.setIndicator = function setIndicator(visible, type = INDICATOR.POSITIVE) {
        this.indicatorArrow.setStroke('#000000');
        this.indicatorArrow.setFill(type);
        this.indicatorArrow.setVisible(visible);
        this.getLayer().batchDraw();
    };

    const filterInPlace = function filterInPlace(values, predicate) {
        const removed = [];
        let i = values.length - 1;
        while (i >= 0) {
            if (!predicate(values[i], i)) {
                removed.unshift(values.splice(i, 1)[0]);
            }
            i -= 1;
        }
        return removed;
    };

    HanabiCard.prototype.applyClue = function applyClue(clue, positive) {
        if (clue.type === CLUE_TYPE.RANK) {
            const clueRank = clue.value;
            const findPipElement = rank => this.rankPips.find(`.${rank}`);
            let removed;
            if (globals.variant.name.startsWith('Multi-Fives')) {
                removed = filterInPlace(
                    this.possibleRanks,
                    rank => (rank === clueRank || rank === 5) === positive,
                );
            } else {
                removed = filterInPlace(
                    this.possibleRanks,
                    rank => (rank === clueRank) === positive,
                );
            }
            removed.forEach(rank => findPipElement(rank).hide());
            // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
            // display a non-grey card face
            if (this.possibleRanks.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
                [this.trueRank] = this.possibleRanks;
                findPipElement(this.trueRank).hide();
                this.rankPips.hide();
                ui.learnedCards[this.order].rank = this.trueRank;
            }
            // Ensure that the learned card data is not overwritten with less recent information
            filterInPlace(
                ui.learnedCards[this.order].possibleRanks,
                s => this.possibleRanks.includes(s),
            );
        } else if (clue.type === CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            const findPipElement = suit => this.suitPips.find(`.${suit.name}`);
            const removed = filterInPlace(
                this.possibleSuits,
                suit => suit.clueColors.includes(clueColor) === positive,
            );
            removed.forEach(suit => findPipElement(suit).hide());
            // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
            // display a non-grey card face
            if (this.possibleSuits.length === 1 && (!this.isInPlayerHand() || this.isClued())) {
                [this.trueSuit] = this.possibleSuits;
                findPipElement(this.trueSuit).hide();
                this.suitPips.hide();
                ui.learnedCards[this.order].suit = this.trueSuit;
            }
            // Ensure that the learned card data is not overwritten with less recent information
            filterInPlace(
                ui.learnedCards[this.order].possibleSuits,
                s => this.possibleSuits.includes(s),
            );
        } else {
            console.error('Clue type invalid.');
        }
    };

    HanabiCard.prototype.hideClues = function hideClues() {
        this.cluedBorder.hide();
    };

    HanabiCard.prototype.isInPlayerHand = function isInPlayerHand() {
        return playerHands.indexOf(this.parent.parent) !== -1;
    };

    const LayoutChild = function LayoutChild(config) {
        Kinetic.Group.call(this, config);

        this.tween = null;
    };

    Kinetic.Util.extend(LayoutChild, Kinetic.Group);

    LayoutChild.prototype.add = function add(child) {
        const self = this;

        Kinetic.Group.prototype.add.call(this, child);
        this.setWidth(child.getWidth());
        this.setHeight(child.getHeight());

        child.on('widthChange', (event) => {
            if (event.oldVal === event.newVal) {
                return;
            }
            self.setWidth(event.newVal);
            if (self.parent) {
                self.parent.doLayout();
            }
        });

        child.on('heightChange', (event) => {
            if (event.oldVal === event.newVal) {
                return;
            }
            self.setHeight(event.newVal);
            if (self.parent) {
                self.parent.doLayout();
            }
        });
    };

    const CardLayout = function CardLayout(config) {
        Kinetic.Group.call(this, config);

        this.align = (config.align || 'left');
        this.reverse = (config.reverse || false);
        this.invertCards = (config.invertCards || false);
    };

    Kinetic.Util.extend(CardLayout, Kinetic.Group);

    CardLayout.prototype.add = function add(child) {
        child.children.forEach((c) => {
            if (c.doRotations) {
                c.doRotations(this.invertCards);
            }
        });
        const pos = child.getAbsolutePosition();
        Kinetic.Group.prototype.add.call(this, child);
        child.setAbsolutePosition(pos);
        this.doLayout();
    };

    CardLayout.prototype._setChildrenIndices = function _setChildrenIndices() {
        Kinetic.Group.prototype._setChildrenIndices.call(this);
        this.doLayout();
    };

    CardLayout.prototype.doLayout = function doLayout() {
        let uw = 0;
        let dist = 0;
        let x = 0;

        const lw = this.getWidth();
        const lh = this.getHeight();

        const n = this.children.length;

        for (let i = 0; i < n; i++) {
            const node = this.children[i];

            if (!node.getHeight()) {
                continue;
            }

            const scale = lh / node.getHeight();

            uw += scale * node.getWidth();
        }

        if (n > 1) {
            dist = (lw - uw) / (n - 1);
        }

        if (dist > 10) {
            dist = 10;
        }

        uw += dist * (n - 1);

        if (this.align === 'center' && uw < lw) {
            x = (lw - uw) / 2;
        }

        if (this.reverse) {
            x = lw - x;
        }

        const storedPostAnimationLayout = ui.postAnimationLayout;

        for (let i = 0; i < n; i++) {
            const node = this.children[i];

            if (!node.getHeight()) {
                continue;
            }

            const scale = lh / node.getHeight();

            if (node.tween) {
                node.tween.destroy();
            }

            if (!node.isDragging()) {
                if (ui.animateFast) {
                    node.setX(x - (this.reverse ? scale * node.getWidth() : 0));
                    node.setY(0);
                    node.setScaleX(scale);
                    node.setScaleY(scale);
                    node.setRotation(0);
                } else {
                    node.tween = new Kinetic.Tween({
                        node,
                        duration: 0.5,
                        x: x - (this.reverse ? scale * node.getWidth() : 0),
                        y: 0,
                        scaleX: scale,
                        scaleY: scale,
                        rotation: 0,
                        runonce: true,
                        onFinish: storedPostAnimationLayout,
                    }).play();
                }
            }

            x += (scale * node.getWidth() + dist) * (this.reverse ? -1 : 1);
        }
    };

    const CardDeck = function CardDeck(config) {
        Kinetic.Group.call(this, config);

        this.cardback = new Kinetic.Image({
            x: 0,
            y: 0,
            width: this.getWidth(),
            height: this.getHeight(),
            image: cardImages[config.cardback],
        });

        this.add(this.cardback);

        this.count = new Kinetic.Text({
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
            text: '0',
            listening: false,
        });

        this.add(this.count);
    };

    Kinetic.Util.extend(CardDeck, Kinetic.Group);

    CardDeck.prototype.add = function add(child) {
        const self = this;

        Kinetic.Group.prototype.add.call(this, child);

        if (child instanceof LayoutChild) {
            if (ui.animateFast) {
                child.remove();
                return;
            }

            child.tween = new Kinetic.Tween({
                node: child,
                x: 0,
                y: 0,
                scaleX: 0.01,
                scaleY: 0.01,
                rotation: 0,
                duration: 0.5,
                runonce: true,
            }).play();

            child.tween.onFinish = () => {
                if (child.parent === self) {
                    child.remove();
                }
            };
        }
    };

    CardDeck.prototype.setCardBack = function setCardBack(cardback) {
        this.cardback.setImage(ImageLoader.get(cardback));
    };

    CardDeck.prototype.setCount = function setCount(count) {
        this.count.setText(count.toString());

        this.cardback.setVisible(count > 0);
    };

    CardDeck.prototype.getCountAsString = function getCountAsString() {
        return this.count.getText();
    };
    CardDeck.prototype.getCountAsInt = function getCountAsInt() {
        return parseInt(this.getCountAsString(), 10);
    };

    CardDeck.prototype.doLayout = function doLayout() {
        this.cardback.setPosition({
            x: 0,
            y: 0,
        });
    };

    const CardStack = function CardStack(config) {
        Kinetic.Group.call(this, config);
    };

    Kinetic.Util.extend(CardStack, Kinetic.Group);

    CardStack.prototype.add = function add(child) {
        child.children.forEach((c) => {
            if (c.doRotations) {
                c.doRotations(false);
            }
        });
        const pos = child.getAbsolutePosition();
        Kinetic.Group.prototype.add.call(this, child);
        child.setAbsolutePosition(pos);
        this.doLayout();
    };

    CardStack.prototype._setChildrenIndices = function _setChildrenIndices() {
        Kinetic.Group.prototype._setChildrenIndices.call(this);
    };

    CardStack.prototype.doLayout = function doLayout() {
        const self = this;

        const lh = this.getHeight();

        const hideUnder = () => {
            const n = self.children.length;
            for (let i = 0; i < n; i++) {
                const node = self.children[i];

                if (!node.tween) {
                    continue;
                }

                if (node.tween.isPlaying()) {
                    return;
                }
            }
            for (let i = 0; i < n - 1; i++) {
                self.children[i].setVisible(false);
            }
            if (n > 0) {
                self.children[n - 1].setVisible(true);
            }
        };

        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i];

            const scale = lh / node.getHeight();

            if (node.tween) {
                node.tween.destroy();
            }

            if (ui.animateFast) {
                node.setX(0);
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
                hideUnder();
            } else {
                node.tween = new Kinetic.Tween({
                    node,
                    duration: 0.8,
                    x: 0,
                    y: 0,
                    scaleX: scale,
                    scaleY: scale,
                    rotation: 0,
                    runonce: true,
                    onFinish: hideUnder,
                }).play();
            }
        }
    };

    const Button = function Button(config) {
        Kinetic.Group.call(this, config);

        const w = this.getWidth();
        const h = this.getHeight();

        const background = new Kinetic.Rect({
            name: 'background',
            x: 0,
            y: 0,
            width: w,
            height: h,
            listening: true,
            cornerRadius: 0.12 * h,
            fill: 'black',
            opacity: 0.6,
        });

        this.add(background);

        if (config.text) {
            const text = new Kinetic.Text({
                name: 'text',
                x: 0,
                y: 0.2 * h,
                width: w,
                height: 0.6 * h,
                listening: false,
                fontSize: 0.5 * h,
                fontFamily: 'Verdana',
                fill: 'white',
                align: 'center',
                text: config.text,
            });

            this.setText = display => text.setText(display);

            this.add(text);
        } else if (config.image) {
            const img = new Kinetic.Image({
                name: 'image',
                x: 0.2 * w,
                y: 0.2 * h,
                width: 0.6 * w,
                height: 0.6 * h,
                listening: false,
                image: ImageLoader.get(config.image),
            });

            this.add(img);
        }

        this.enabled = true;
        this.pressed = false;

        background.on('mousedown', () => {
            background.setFill('#888888');
            background.getLayer().draw();

            const resetButton = () => {
                background.setFill('black');
                background.getLayer().draw();

                background.off('mouseup');
                background.off('mouseout');
            };

            background.on('mouseout', () => {
                resetButton();
            });
            background.on('mouseup', () => {
                resetButton();
            });
        });
    };

    Kinetic.Util.extend(Button, Kinetic.Group);

    Button.prototype.setEnabled = function setEnabled(enabled) {
        this.enabled = enabled;

        this.get('.text')[0].setFill(enabled ? 'white' : '#444444');

        this.get('.background')[0].setListening(enabled);

        this.getLayer().draw();
    };

    Button.prototype.getEnabled = function getEnabled() {
        return this.enabled;
    };

    Button.prototype.setPressed = function setPressed(pressed) {
        this.pressed = pressed;

        this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

        this.getLayer().batchDraw();
    };

    const ClueRecipientButton = function ClueRecipientButton(config) {
        Button.call(this, config);
        this.targetIndex = config.targetIndex;
    };

    Kinetic.Util.extend(ClueRecipientButton, Button);

    const NumberButton = function NumberButton(config) {
        Kinetic.Group.call(this, config);

        const w = this.getWidth();
        const h = this.getHeight();

        const background = new Kinetic.Rect({
            name: 'background',
            x: 0,
            y: 0,
            width: w,
            height: h,
            listening: true,
            cornerRadius: 0.12 * h,
            fill: 'black',
            opacity: 0.6,
        });

        this.add(background);

        const text = new Kinetic.Text({
            x: 0,
            y: 0.2 * h,
            width: w,
            height: 0.6 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            stroke: 'black',
            strokeWidth: 1,
            align: 'center',
            text: config.number.toString(),
        });

        this.add(text);

        this.pressed = false;

        this.clue = config.clue;

        background.on('mousedown', () => {
            background.setFill('#888888');
            background.getLayer().draw();

            const resetButton = () => {
                background.setFill('black');
                background.getLayer().draw();

                background.off('mouseup');
                background.off('mouseout');
            };

            background.on('mouseout', () => {
                resetButton();
            });
            background.on('mouseup', () => {
                resetButton();
            });
        });
    };

    Kinetic.Util.extend(NumberButton, Kinetic.Group);

    NumberButton.prototype.setPressed = function setPressed(pressed) {
        this.pressed = pressed;

        this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

        this.getLayer().batchDraw();
    };

    const ColorButton = function ColorButton(config) {
        Kinetic.Group.call(this, config);

        const w = this.getWidth();
        const h = this.getHeight();

        const background = new Kinetic.Rect({
            name: 'background',
            x: 0,
            y: 0,
            width: w,
            height: h,
            listening: true,
            cornerRadius: 0.12 * h,
            fill: 'black',
            opacity: 0.6,
        });

        this.add(background);

        const color = new Kinetic.Rect({
            x: 0.1 * w,
            y: 0.1 * h,
            width: 0.8 * w,
            height: 0.8 * h,
            listening: false,
            cornerRadius: 0.12 * 0.8 * h,
            fill: config.color,
            opacity: 0.9,
        });

        this.add(color);

        const text = new Kinetic.Text({
            x: 0,
            y: 0.2 * h,
            width: w,
            height: 0.6 * h,
            listening: false,
            fontSize: 0.5 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            stroke: 'black',
            strokeWidth: 1,
            align: 'center',
            text: config.text,
            visible: lobby.settings.showColorblindUI,
        });

        this.add(text);

        this.pressed = false;

        this.clue = config.clue;

        background.on('mousedown', () => {
            background.setFill('#888888');
            background.getLayer().draw();

            const resetButton = () => {
                background.setFill('black');
                background.getLayer().draw();

                background.off('mouseup');
                background.off('mouseout');
            };

            background.on('mouseout', () => {
                resetButton();
            });
            background.on('mouseup', () => {
                resetButton();
            });
        });
    };

    Kinetic.Util.extend(ColorButton, Kinetic.Group);

    ColorButton.prototype.setPressed = function setPressed(pressed) {
        this.pressed = pressed;

        this.get('.background')[0].setFill(pressed ? '#cccccc' : 'black');

        this.getLayer().batchDraw();
    };

    // A simple two-state button with text for each state
    const ToggleButton = function ToggleButton(config) {
        Button.call(this, config);
        let toggleState = false;

        const toggle = () => {
            toggleState = !toggleState;
            this.setText(toggleState ? config.alternateText : config.text);
            if (this.getLayer()) {
                this.getLayer().batchDraw();
            }
        };

        this.on('click tap', toggle);

        if (config.initialState) {
            toggle();
        }
    };

    Kinetic.Util.extend(ToggleButton, Button);

    const ButtonGroup = function ButtonGroup(config) {
        Kinetic.Node.call(this, config);

        this.list = [];
    };

    Kinetic.Util.extend(ButtonGroup, Kinetic.Node);

    ButtonGroup.prototype.add = function add(button) {
        const self = this;

        this.list.push(button);

        button.on('click tap', function buttonClick() {
            this.setPressed(true);

            for (let i = 0; i < self.list.length; i++) {
                if (self.list[i] !== this && self.list[i].pressed) {
                    self.list[i].setPressed(false);
                }
            }

            self.fire('change');
        });
    };

    ButtonGroup.prototype.getPressed = function getPressed() {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                return this.list[i];
            }
        }

        return null;
    };

    ButtonGroup.prototype.clearPressed = function clearPressed() {
        for (let i = 0; i < this.list.length; i++) {
            if (this.list[i].pressed) {
                this.list[i].setPressed(false);
            }
        }
    };

    const HanabiClueLog = function HanabiClueLog(config) {
        Kinetic.Group.call(this, config);
    };

    Kinetic.Util.extend(HanabiClueLog, Kinetic.Group);

    HanabiClueLog.prototype.add = function add(child) {
        Kinetic.Group.prototype.add.call(this, child);
        this.doLayout();
    };

    HanabiClueLog.prototype._setChildrenIndices = function _setChildrenIndices() {
        Kinetic.Group.prototype._setChildrenIndices.call(this);
        this.doLayout();
    };

    HanabiClueLog.prototype.doLayout = function doLayout() {
        let y = 0;

        for (let i = 0; i < this.children.length; i++) {
            const node = this.children[i];

            node.setY(y);

            y += node.getHeight() + 0.001 * winH;
        }
    };

    HanabiClueLog.prototype.checkExpiry = function checkExpiry() {
        const maxLength = 31;
        const childrenToRemove = this.children.length - maxLength;
        if (childrenToRemove < 1) {
            return;
        }
        let childrenRemoved = 0;
        for (let i = 0; i < this.children.length; i++) {
            childrenRemoved += this.children[i].checkExpiry();
            if (childrenRemoved >= childrenToRemove) {
                break;
            }
        }

        this.doLayout();
    };

    HanabiClueLog.prototype.showMatches = function showMatches(target) {
        for (let i = 0; i < this.children.length; i++) {
            this.children[i].showMatch(target);
        }
    };

    HanabiClueLog.prototype.clear = function clear() {
        for (let i = this.children.length - 1; i >= 0; i--) {
            this.children[i].remove();
        }
    };

    const HanabiClueEntry = function HanabiClueEntry(config) {
        Kinetic.Group.call(this, config);

        const w = config.width;
        const h = config.height;

        const background = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: w,
            height: h,
            fill: 'white',
            opacity: 0.1,
            listening: true,
        });
        this.background = background;

        this.add(background);

        const giver = new FitText({
            x: 0.05 * w,
            y: 0,
            width: 0.3 * w,
            height: h,
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.giver,
            listening: false,
        });
        this.add(giver);

        const target = new FitText({
            x: 0.4 * w,
            y: 0,
            width: 0.3 * w,
            height: h,
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.target,
            listening: false,
        });
        this.add(target);

        const name = new Kinetic.Text({
            x: 0.75 * w,
            y: 0,
            width: 0.2 * w,
            height: h,
            align: 'center',
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: config.clueName,
            listening: false,
        });
        this.add(name);

        const negativeMarker = new Kinetic.Text({
            x: 0.88 * w,
            y: 0,
            width: 0.2 * w,
            height: h,
            align: 'center',
            fontSize: 0.9 * h,
            fontFamily: 'Verdana',
            fill: 'white',
            text: '✘',
            listening: false,
            visible: false,
        });

        this.negativeMarker = negativeMarker;
        this.add(negativeMarker);

        this.list = config.list;
        this.neglist = config.neglist;

        // Add a mouseover highlighting effect
        background.on('mouseover tap', () => {
            clueLog.showMatches(null);

            background.setOpacity(0.4);
            background.getLayer().batchDraw();
        });
        background.on('mouseout', () => {
            // Fix the bug where the mouseout can happen after the clue has been destroyed
            if (background.getLayer() === null) {
                return;
            }

            background.setOpacity(0.1);
            background.getLayer().batchDraw();
        });

        // Store the turn that the clue occured inside this object for later
        this.turn = config.turn;

        // Click an entry in the clue log to go to that turn in the replay
        background.on('click', () => {
            if (globals.replay) {
                ui.inferSharedReplayMode();
            } else {
                ui.enterReplay(true);
            }
            ui.performReplay(this.turn + 1, true);
        });
    };

    Kinetic.Util.extend(HanabiClueEntry, Kinetic.Group);

    HanabiClueEntry.prototype.checkValid = (c) => {
        if (!globals.deck[c]) {
            return false;
        }

        if (!globals.deck[c].parent) {
            return false;
        }

        return globals.deck[c].isInPlayerHand();
    };

    // Returns number of expirations, either 0 or 1 depending on whether it expired
    HanabiClueEntry.prototype.checkExpiry = function checkExpiry() {
        for (let i = 0; i < this.list.length; i++) {
            if (this.checkValid(this.list[i])) {
                return 0;
            }
        }

        for (let i = 0; i < this.neglist.length; i++) {
            if (this.checkValid(this.neglist[i])) {
                return 0;
            }
        }

        this.off('mouseover tap');
        this.off('mouseout');

        this.remove();
        return 1;
    };

    HanabiClueEntry.prototype.showMatch = function showMatch(target) {
        this.background.setOpacity(0.1);
        this.background.setFill('white');
        this.negativeMarker.setVisible(false);

        for (let i = 0; i < this.list.length; i++) {
            if (globals.deck[this.list[i]] === target) {
                this.background.setOpacity(0.4);
            }
        }

        for (let i = 0; i < this.neglist.length; i++) {
            if (globals.deck[this.neglist[i]] === target) {
                this.background.setOpacity(0.4);
                this.background.setFill('#ff7777');
                if (lobby.settings.showColorblindUI) {
                    this.negativeMarker.setVisible(true);
                }
            }
        }
    };

    const HanabiNameFrame = function HanabiNameFrame(config) {
        Kinetic.Group.call(this, config);

        this.name = new Kinetic.Text({
            x: config.width / 2,
            y: 0,
            height: config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: config.height,
            text: config.name,
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0.9,
        });

        let w = this.name.getWidth();

        while (w > 0.65 * config.width && this.name.getFontSize() > 5) {
            this.name.setFontSize(this.name.getFontSize() * 0.9);

            w = this.name.getWidth();
        }

        this.name.setOffsetX(w / 2);
        const nameTextObject = this.name;
        this.name.on('click tap', (event) => {
            const username = nameTextObject.getText();
            if (event.evt.which === 1) { // Left-click
                msgLogGroup.showPlayerActions(username);
            } else if (event.evt.which === 3) { // Right-click
                this.giveLeader(username);
            }
        });
        this.add(this.name);

        w *= 1.4;

        this.leftline = new Kinetic.Line({
            points: [
                0,
                0,
                0,
                config.height / 2,
                config.width / 2 - w / 2,
                config.height / 2,
            ],
            stroke: '#d8d5ef',
            strokeWidth: 1,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0,
        });

        this.add(this.leftline);

        this.rightline = new Kinetic.Line({
            points: [
                config.width / 2 + w / 2,
                config.height / 2,
                config.width,
                config.height / 2,
                config.width,
                0,
            ],
            stroke: '#d8d5ef',
            strokeWidth: 1,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 5,
            shadowOffset: {
                x: 0,
                y: 3,
            },
            shadowOpacity: 0,
        });

        this.add(this.rightline);
    };

    Kinetic.Util.extend(HanabiNameFrame, Kinetic.Group);

    // Transfer leadership of the shared replay to another player
    HanabiNameFrame.prototype.giveLeader = function giveLeader(username) {
        // Only proceed if we are in a shared replay
        if (!globals.sharedReplay) {
            return;
        }

        // Only proceed if we are the replay leader
        if (globals.sharedReplayLeader !== lobby.username) {
            return;
        }

        // Only proceed if we chose someone else
        if (username === lobby.username) {
            return;
        }

        ui.sendMsg({
            type: 'replayAction',
            data: {
                type: 2, // Type 2 is a leader transfer
                name: username,
            },
        });
    };

    HanabiNameFrame.prototype.setActive = function setActive(active) {
        this.leftline.setStrokeWidth(active ? 3 : 1);
        this.rightline.setStrokeWidth(active ? 3 : 1);

        this.name.setShadowOpacity(active ? 0.6 : 0);
        this.leftline.setShadowOpacity(active ? 0.6 : 0);
        this.rightline.setShadowOpacity(active ? 0.6 : 0);

        this.name.setFontStyle(active ? 'bold' : 'normal');
    };

    HanabiNameFrame.prototype.setConnected = function setConnected(connected) {
        const color = connected ? '#d8d5ef' : '#e8233d';

        this.leftline.setStroke(color);
        this.rightline.setStroke(color);
        this.name.setFill(color);
    };

    const Loader = function Loader(cb) {
        this.cb = cb;

        this.filemap = {};

        const basic = [
            'trashcan',
            'redx',
            'replay',
            'rewind',
            'forward',
            'rewindfull',
            'forwardfull',
        ];

        for (let i = 0; i < basic.length; i++) {
            this.filemap[basic[i]] = `public/img/${basic[i]}.png`;
        }

        this.filemap.background = 'public/img/background.jpg';
    };

    Loader.prototype.addImage = function addImage(name, ext) {
        this.filemap[name] = `public/img/${name}.${ext}`;
    };

    Loader.prototype.addAlias = function addAlias(name, alias, ext) {
        this.filemap[name] = `public/img/${alias}.${ext}`;
    };

    Loader.prototype.start = function start() {
        const self = this;

        const total = Object.keys(self.filemap).length;

        this.map = {};
        this.numLoaded = 0;

        for (const name of Object.keys(this.filemap)) {
            const img = new Image();

            this.map[name] = img;

            img.onload = () => {
                self.numLoaded += 1;

                self.progress(self.numLoaded, total);

                if (self.numLoaded === total) {
                    self.cb();
                }
            };

            img.src = self.filemap[name];
        }

        self.progress(0, total);
    };

    Loader.prototype.progress = function progress(done, total) {
        if (this.progressCallback) {
            this.progressCallback(done, total);
        }
    };

    Loader.prototype.get = function get(name) {
        return this.map[name];
    };

    const ImageLoader = new Loader(() => {
        ui.buildCards();
        ui.buildUI();
        ui.sendMsg({
            type: 'ready',
            data: {},
        });
        ui.ready = true;
    });

    this.loadImages = () => {
        ImageLoader.start();
    };

    const showClueMatch = (target, clue) => {
        // Hide all of the existing arrows on the cards
        for (let i = 0; i < globals.deck.length; i++) {
            if (i === target) {
                continue;
            }

            globals.deck[i].setIndicator(false);
        }
        cardLayer.batchDraw();

        // We supply this function with an argument of "-1" if we just want to
        // clear the existing arrows and nothing else
        if (target < 0) {
            return false;
        }

        // Make an exception for the "Color Blind" variants
        // (all color clues touch all cards, so don't show the arrows for simplicity)
        if (globals.variant.name.startsWith('Color Blind') && clue.type === CLUE_TYPE.COLOR) {
            return true;
        }

        let match = false;
        for (let i = 0; i < playerHands[target].children.length; i++) {
            const child = playerHands[target].children[i];
            const card = child.children[0];

            let touched = false;
            let color;
            if (clue.type === CLUE_TYPE.RANK) {
                if (
                    clue.value === card.trueRank
                    || (globals.variant.name.startsWith('Multi-Fives') && card.trueRank === 5)
                ) {
                    touched = true;
                    color = INDICATOR.POSITIVE;
                }
            } else if (clue.type === CLUE_TYPE.COLOR) {
                const clueColor = clue.value;
                if (
                    card.trueSuit === SUIT.RAINBOW
                    || card.trueSuit === SUIT.RAINBOW1OE
                    || card.trueSuit.clueColors.includes(clueColor)
                ) {
                    touched = true;
                    color = clueColor.hexCode;
                }
            }

            if (touched) {
                match = true;
                card.setIndicator(true, color);
            } else {
                card.setIndicator(false);
            }
        }

        cardLayer.batchDraw();

        return match;
    };

    const cardImages = {};
    const scaleCardImages = {};

    const xrad = CARDW * 0.08;
    const yrad = CARDH * 0.08;

    // Draw texture lines on card
    const drawCardTexture = function drawCardTexture(ctx) {
        backpath(ctx, 4, xrad, yrad);

        ctx.fillStyle = 'white';
        ctx.fill();

        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.2;
        ctx.strokeStyle = 'black';

        for (let x = 0; x < CARDW; x += 4 + Math.random() * 4) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, CARDH);
            ctx.stroke();
        }

        for (let y = 0; y < CARDH; y += 4 + Math.random() * 4) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(CARDW, y);
            ctx.stroke();
        }

        ctx.restore();
    };

    const drawCardBase = function drawCardBase(ctx, suit, rank) {
        // Draw the background
        ctx.fillStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
        ctx.strokeStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
        if (ctx.fillStyle === COLOR.WHITE.hexCode) {
            ctx.strokeStyle = COLOR.BLACK.hexCode;
        }

        backpath(ctx, 4, xrad, yrad);

        ctx.save();
        // Draw the borders (on visible cards) and the color fill
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 8;
        // The borders should be more opaque for the stack base
        if (rank === 0) {
            ctx.globalAlpha = 1.0;
        }
        ctx.stroke();

        ctx.restore();
    };

    const drawCardIndex = function drawCardIndex(ctx, textYPos, indexLabel) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.fillText(indexLabel, 19, textYPos);
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.strokeText(indexLabel, 19, textYPos);
    };

    const drawMixedCardHelper = function drawMixedCardHelper(ctx, clueColors) {
        const [clueColor1, clueColor2] = clueColors;

        ctx.save();

        ctx.lineWidth = 1;

        const triangleSize = 50;
        const borderSize = 8;

        // Draw the first half of the top-right triangle
        ctx.beginPath();
        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
        ctx.lineTo(CARDW - borderSize - triangleSize, borderSize); // Move left
        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
        // Move down and right diagonally
        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor1.hexCode;
        drawshape(ctx);

        // Draw the second half of the top-right triangle
        ctx.beginPath();
        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top-right-hand corner
        ctx.lineTo(CARDW - borderSize, borderSize + triangleSize); // Move down
        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2));
        // Move up and left diagonally
        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor2.hexCode;
        drawshape(ctx);

        // Draw the first half of the bottom-left triangle
        ctx.beginPath();
        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
        ctx.lineTo(borderSize, CARDH - borderSize - triangleSize); // Move up
        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
        // Move right and down diagonally
        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor1.hexCode;
        drawshape(ctx);

        // Draw the second half of the bottom-left triangle
        ctx.beginPath();
        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
        ctx.lineTo(borderSize + triangleSize, CARDH - borderSize); // Move right
        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2));
        // Move left and up diagonally
        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor2.hexCode;
        drawshape(ctx);

        ctx.restore();
    };

    const drawSuitPips = function drawSuitPips(ctx, rank, suit, i) {
        const pathfunc = drawSuitShape(suit, i);
        const scale = 0.4;

        // The middle for cards 2 or 4
        if (rank === 1 || rank === 3) {
            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.scale(scale, scale);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();
        }

        // Top and bottom for cards 2, 3, 4, 5
        if (rank > 1 && rank <= 5) {
            const symbolYPos = lobby.settings.showColorblindUI ? 85 : 120;
            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.translate(0, -symbolYPos);
            ctx.scale(scale, scale);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();

            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.translate(0, symbolYPos);
            ctx.scale(scale, scale);
            ctx.rotate(Math.PI);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();
        }

        // Left and right for cards 4 and 5
        if (rank === 4 || rank === 5) {
            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.translate(-90, 0);
            ctx.scale(scale, scale);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();

            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.translate(90, 0);
            ctx.scale(scale, scale);
            ctx.rotate(Math.PI);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();
        }

        // Size, position, and alpha adjustment for the central icon on stack base and 5
        if (rank === 0 || rank === 5) {
            ctx.globalAlpha = 1.0;
            ctx.save();
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.scale(scale * 3 / 2, scale * 3 / 2);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();
        }

        // Unknown rank, so draw large faint suit
        if (rank === 6) {
            ctx.save();
            ctx.globalAlpha = lobby.settings.showColorblindUI ? 0.4 : 0.1;
            ctx.translate(CARDW / 2, CARDH / 2);
            ctx.scale(scale * 3, scale * 3);
            ctx.translate(-75, -100);
            pathfunc(ctx);
            drawshape(ctx);
            ctx.restore();
        }
    };

    const makeUnknownCardImage = function makeUnknownCardImage() {
        const cvs = document.createElement('canvas');
        cvs.width = CARDW;
        cvs.height = CARDH;

        const ctx = cvs.getContext('2d');

        drawCardTexture(ctx);

        ctx.fillStyle = 'black';

        backpath(ctx, 4, xrad, yrad);

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 8;
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#444444';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';

        ctx.translate(CARDW / 2, CARDH / 2);

        return cvs;
    };

    const makeDeckBack = function makeDeckBack() {
        const cvs = makeUnknownCardImage();
        const ctx = cvs.getContext('2d');

        const nSuits = globals.variant.suits.length;
        for (let i = 0; i < globals.variant.suits.length; i++) {
            const suit = globals.variant.suits[i];

            ctx.resetTransform();
            ctx.scale(0.4, 0.4);

            let x = Math.floor(CARDW * 1.25);
            let y = Math.floor(CARDH * 1.25);

            // Transform polar to cartesian coordinates
            // The magic number added to the offset is needed to center things properly
            x -= 1.05 * Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25); // eslint-disable-line
            y -= 1.05 * Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3); // eslint-disable-line
            ctx.translate(x, y);

            drawSuitShape(suit, i)(ctx);
            drawshape(ctx);
        }
        ctx.save();
        return cvs;
    };

    this.buildCards = function buildCards() {
        // The gray suit represents cards of unknown suit
        const suits = globals.variant.suits.concat(SUIT.GRAY);
        for (let i = 0; i < suits.length; i++) {
            const suit = suits[i];

            // Rank 0 is the stack base
            // Rank 1-5 are the normal cards
            // Rank 6 is a card of unknown rank
            // Rank 7 is a "START" card (in the "Up or Down" variants)
            for (let rank = 0; rank <= 7; rank++) {
                const cvs = document.createElement('canvas');
                cvs.width = CARDW;
                cvs.height = CARDH;

                const ctx = cvs.getContext('2d');

                if (rank > 0) {
                    drawCardTexture(ctx);
                }

                drawCardBase(ctx, suit, rank);

                ctx.shadowBlur = 10;
                ctx.fillStyle = suit.style(ctx, CARD_AREA.NUMBER);
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';

                if (rank !== 0 && rank !== 6) {
                    let textYPos;
                    let indexLabel;
                    let rankString = rank.toString();
                    if (rank === 7) {
                        // "START" cards are represented by rank 7
                        rankString = 'S';
                    }
                    let fontSize;
                    if (lobby.settings.showColorblindUI) {
                        fontSize = 68;
                        textYPos = 83;
                        indexLabel = suit.abbreviation + rankString;
                    } else {
                        fontSize = 96;
                        textYPos = 110;
                        indexLabel = rankString;
                    }

                    ctx.font = `bold ${fontSize}pt Arial`;

                    // Draw index on top left
                    drawCardIndex(ctx, textYPos, indexLabel);

                    // 'Index' cards are used to draw cards of learned but not yet known rank
                    cardImages[`Index-${suit.name}-${rank}`] = cloneCanvas(cvs);

                    // Draw index on bottom right
                    ctx.save();
                    ctx.translate(CARDW, CARDH);
                    ctx.rotate(Math.PI);
                    drawCardIndex(ctx, textYPos, indexLabel);
                    ctx.restore();
                }

                ctx.fillStyle = suit.style(ctx, CARD_AREA.SYMBOL);

                ctx.lineWidth = 5;

                // Make the special corners on cards for the mixed variant
                if (suit.clueColors !== null && suit.clueColors.length === 2) {
                    drawMixedCardHelper(ctx, suit.clueColors);
                }

                // 'NoPip' cards are used for
                //   cards of known rank before suit learned
                //   cards of unknown rank
                // Entirely unknown cards (Gray 6) have a custom image defined separately
                if (rank > 0 && (rank < 6 || suit !== SUIT.GRAY)) {
                    cardImages[`NoPip-${suit.name}-${rank}`] = cloneCanvas(cvs);
                }

                if (suit !== SUIT.GRAY) {
                    drawSuitPips(ctx, rank, suit, i);
                }

                // Gray Card images would be identical to NoPip images
                if (suit !== SUIT.GRAY) {
                    cardImages[`Card-${suit.name}-${rank}`] = cvs;
                }
            }
        }

        cardImages['NoPip-Gray-6'] = makeUnknownCardImage();
        cardImages['deck-back'] = makeDeckBack();
    };

    const sizeStage = (stage) => {
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

        stage.setWidth(cw);
        stage.setHeight(ch);
    };

    let stage = new Kinetic.Stage({
        container: 'game',
    });

    sizeStage(stage);

    let winW = stage.getWidth();
    let winH = stage.getHeight();

    const bgLayer = new Kinetic.Layer();
    const cardLayer = new Kinetic.Layer();
    const UILayer = new Kinetic.Layer();
    const overLayer = new Kinetic.Layer();
    const textLayer = new Kinetic.Layer({
        listening: false,
    });
    const timerLayer = new Kinetic.Layer({
        listening: false,
    });
    const playerHands = [];
    let drawDeckRect;
    let drawDeck;
    let messagePrompt;

    let cluesTextLabel;
    let cluesNumberLabel;
    let scoreTextLabel;
    let scoreNumberLabel;
    let turnTextLabel;
    let turnNumberLabel;
    let efficiencyTextLabel;
    let efficiencyNumberLabel;
    let paceTextLabel;
    let paceNumberLabel;

    let spectatorsLabel;
    let spectatorsNumLabel;
    let sharedReplayLeaderLabel;
    let sharedReplayLeaderLabelPulse;
    let strikes = [];
    const nameFrames = [];
    const playStacks = new Map();
    const discardStacks = new Map();
    let playArea;
    let discardArea;
    let clueLogRect;
    let clueLog;
    let clueArea;
    let clueTargetButtonGroup;
    let clueButtonGroup;
    let submitClue;
    let timer1;
    let timer2;
    let noClueLabel;
    let noClueBox;
    let noDiscardLabel;
    let noDoubleDiscardLabel;
    let deckPlayAvailableLabel;
    let scoreArea;
    let replayArea;
    let replayBar;
    let replayShuttleShared;
    let replayShuttle;
    let replayButton;
    let replayExitButton;
    let toggleSharedTurnButton; // Used in shared replays
    let lobbyButton;
    let helpButton;
    let chatButton;
    let cluesButton;
    let helpGroup;
    let msgLogGroup;
    let overback;
    const notesWritten = []; // An array containing all of the player's notes, indexed by card order

    const overPlayArea = pos => (
        pos.x >= playArea.getX()
        && pos.y >= playArea.getY()
        && pos.x <= playArea.getX() + playArea.getWidth()
        && pos.y <= playArea.getY() + playArea.getHeight()
    );

    const shareCurrentTurn = (target) => {
        if (globals.sharedReplayTurn !== target) {
            ui.sendMsg({
                type: 'replayAction',
                data: {
                    type: 0, // Type 0 is a new replay turn
                    turn: target,
                },
            });
            globals.sharedReplayTurn = target;
            ui.adjustReplayShuttle();
        }
    };

    this.buildUI = function buildUI() {
        const self = this;
        let x;
        let y;
        let width;
        let height;
        let yOffset;
        let rect;
        let button;

        const layers = stage.getLayers();

        for (let i = 0; i < layers.length; i++) {
            layers[i].remove();
        }

        const background = new Kinetic.Image({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            image: ImageLoader.get('background'),
        });

        bgLayer.add(background);

        /*
            Draw the discard area
        */

        // This is the invisible rectangle that players drag cards to in order to discard them
        discardArea = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.2 * winW,
            height: 0.4 * winH,
        });

        // The red border that surrounds the discard pile when the team is at 8 clues
        noDiscardLabel = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            stroke: '#df1c2d',
            strokeWidth: 0.007 * winW,
            cornerRadius: 0.01 * winW,
            visible: false,
        });
        UILayer.add(noDiscardLabel);

        // The yellow border that surrounds the discard pile when it is a "Double Discard" situation
        noDoubleDiscardLabel = new Kinetic.Rect({
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
        UILayer.add(noDoubleDiscardLabel);

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
        bgLayer.add(rect);

        // The icon over the discard pile
        const img = new Kinetic.Image({
            x: 0.82 * winW,
            y: 0.62 * winH,
            width: 0.15 * winW,
            height: 0.35 * winH,
            opacity: 0.2,
            image: ImageLoader.get('trashcan'),
        });
        bgLayer.add(img);

        /*
            The action log
        */

        const actionLogValues = {
            x: 0.2,
            y: 0.235,
            w: 0.4,
            h: 0.098,
        };
        if (lobby.settings.showBGAUI) {
            actionLogValues.x = 0.01;
            actionLogValues.y = 0.01;
            actionLogValues.h = 0.25;
        }
        const actionLog = new Kinetic.Group({
            x: actionLogValues.x * winW,
            y: actionLogValues.y * winH,
        });
        UILayer.add(actionLog);

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
            msgLogGroup.show();
            overback.show();

            overLayer.draw();

            overback.on('click tap', () => {
                overback.off('click tap');

                msgLogGroup.hide();
                overback.hide();

                overLayer.draw();
            });
        });

        // The action log
        let maxLines = 3;
        if (lobby.settings.showBGAUI) {
            maxLines = 8;
        }
        messagePrompt = new MultiFitText({
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
        actionLog.add(messagePrompt);

        // The dark overlay that appears when you click on the "Help" button
        overback = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            opacity: 0.3,
            fill: 'black',
            visible: false,
        });
        overLayer.add(overback);

        // The full action log (that appears when you click on the action log)
        msgLogGroup = new HanabiMsgLog();
        overLayer.add(msgLogGroup);

        // The rectangle that holds the turn, score, and clue count
        const scoreAreaValues = {
            x: 0.66,
            y: 0.81,
        };
        if (lobby.settings.showBGAUI) {
            scoreAreaValues.x = 0.168;
            scoreAreaValues.y = 0.81;
        }
        scoreArea = new Kinetic.Group({
            x: scoreAreaValues.x * winW,
            y: scoreAreaValues.y * winH,
        });
        UILayer.add(scoreArea);

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
        scoreArea.add(rect);

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

        turnTextLabel = basicTextLabel.clone({
            text: 'Turn',
            x: 0.03 * winW,
            y: 0.01 * winH,
        });
        scoreArea.add(turnTextLabel);

        turnNumberLabel = basicNumberLabel.clone({
            text: '1',
            x: 0.07 * winW,
            y: 0.01 * winH,
        });
        scoreArea.add(turnNumberLabel);

        scoreTextLabel = basicTextLabel.clone({
            text: 'Score',
            x: 0.03 * winW,
            y: 0.045 * winH,
        });
        scoreArea.add(scoreTextLabel);

        scoreNumberLabel = basicNumberLabel.clone({
            text: '0',
            x: 0.07 * winW,
            y: 0.045 * winH,
        });
        scoreArea.add(scoreNumberLabel);

        cluesTextLabel = basicTextLabel.clone({
            text: 'Clues',
            x: 0.03 * winW,
            y: 0.08 * winH,
        });
        scoreArea.add(cluesTextLabel);

        cluesNumberLabel = basicNumberLabel.clone({
            text: '8',
            x: 0.07 * winW,
            y: 0.08 * winH,
        });
        scoreArea.add(cluesNumberLabel);

        // Draw the 3 strike (bomb) indicators
        for (let i = 0; i < 3; i++) {
            rect = new Kinetic.Rect({
                x: (0.01 + 0.04 * i) * winW,
                y: 0.115 * winH,
                width: 0.03 * winW,
                height: 0.053 * winH,
                fill: 'black',
                opacity: 0.6,
                cornerRadius: 0.003 * winW,
            });

            scoreArea.add(rect);
        }

        /*
            The "eyes" symbol to show that one or more people are spectating the game
        */

        const spectatorsLabelValues = {
            x: 0.623,
            y: 0.9,
        };
        if (lobby.settings.showBGAUI) {
            spectatorsLabelValues.x = 0.01;
            spectatorsLabelValues.y = 0.72;
        }
        spectatorsLabel = new Kinetic.Text({
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
        UILayer.add(spectatorsNumLabel);

        // Shared replay leader indicator
        const sharedReplayLeaderLabelValues = {
            x: 0.623,
            y: 0.85,
        };
        if (lobby.settings.showBGAUI) {
            sharedReplayLeaderLabelValues.x = spectatorsLabelValues.x + 0.03;
            sharedReplayLeaderLabelValues.y = spectatorsLabelValues.y;
        }
        sharedReplayLeaderLabel = new Kinetic.Text({
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

        // The user can right-click on the crown to pass the replay leader to an arbitrary person
        sharedReplayLeaderLabel.on('click', (event) => {
            // Do nothing if this is not a right-click
            if (event.evt.which !== 3) {
                return;
            }

            // Do nothing if we are not the shared replay leader
            if (globals.sharedReplayLeader !== lobby.username) {
                return;
            }

            let msg = 'What is the number of the person that you want to pass the replay leader to?\n\n';
            msg += ui.lastSpectators.names.map((name, i) => `${i + 1} - ${name}\n`).join('');
            let target = window.prompt(msg);
            if (Number.isNaN(target)) {
                return;
            }
            target -= 1;
            target = ui.lastSpectators.names[target];

            // Only proceed if we chose someone else
            if (target === lobby.username) {
                return;
            }

            ui.sendMsg({
                type: 'replayAction',
                data: {
                    type: 2, // Type 2 is a leader transfer
                    name: target,
                },
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
        clueLogRect = new Kinetic.Rect({
            x: clueLogValues.x * winW,
            y: clueLogValues.y * winH,
            width: clueLogValues.w * winW,
            height: clueLogValues.h * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });
        bgLayer.add(clueLogRect);

        const spacing = 0.01;
        clueLog = new HanabiClueLog({
            x: (clueLogValues.x + spacing) * winW,
            y: (clueLogValues.y + spacing) * winH,
            width: (clueLogValues.w - spacing * 2) * winW,
            height: (clueLogValues.h - spacing * 2) * winH,
        });
        UILayer.add(clueLog);

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
        bgLayer.add(rect);

        paceTextLabel = basicTextLabel.clone({
            text: 'Pace',
            x: 0.825 * winW,
            y: 0.54 * winH,
            fontSize: 0.02 * winH,
        });
        UILayer.add(paceTextLabel);

        paceNumberLabel = basicNumberLabel.clone({
            text: '-',
            x: 0.9 * winW,
            y: 0.54 * winH,
            fontSize: 0.02 * winH,
            align: 'left',
        });
        UILayer.add(paceNumberLabel);

        efficiencyTextLabel = basicTextLabel.clone({
            text: 'Efficiency',
            x: 0.825 * winW,
            y: 0.56 * winH,
            fontSize: 0.02 * winH,
        });
        UILayer.add(efficiencyTextLabel);

        efficiencyNumberLabel = basicNumberLabel.clone({
            text: '-',
            x: 0.9 * winW,
            y: 0.56 * winH,
            width: 0.08 * winW,
            fontSize: 0.02 * winH,
            align: 'left',
        });
        UILayer.add(efficiencyNumberLabel);

        this.handleEfficiency = function handleEfficiency(cardsGottenDelta) {
            this.cardsGotten += cardsGottenDelta;
            const efficiency = (this.cardsGotten / this.cluesSpentPlusStrikes).toFixed(2);
            // Round it to 2 decimal places

            // Calculate the minimum amount of efficiency needed in order to win this variant
            // First, calculate starting pace with the following formula:
            // total cards in the deck -
            // ((number of cards in a player's hand - 1) * number of players) -
            // (5 * number of suits)
            let totalCardsInTheDeck = 0;
            for (const suit of globals.variant.suits) {
                totalCardsInTheDeck += 10;
                if (suit.oneOfEach) {
                    totalCardsInTheDeck -= 5;
                } else if (globals.variant.name.startsWith('Up or Down')) {
                    totalCardsInTheDeck -= 1;
                }
            }
            const numberOfPlayers = globals.playerNames.length;
            let cardsInHand = 5;
            if (numberOfPlayers === 4 || numberOfPlayers === 5) {
                cardsInHand = 4;
            } else if (numberOfPlayers === 6) {
                cardsInHand = 3;
            }
            let startingPace = totalCardsInTheDeck;
            startingPace -= (cardsInHand - 1) * numberOfPlayers;
            startingPace -= 5 * globals.variant.suits.length;

            // Second, use the pace to calculate the efficiency required with the following formula:
            // (5 * number of suits) / (pace + number of suits + 7 (- 1 if a 5/6-player game))
            const minEfficiencyNumerator = 5 * globals.variant.suits.length;
            let minEfficiencyDenominator = startingPace + globals.variant.suits.length + 7;
            if (numberOfPlayers === 5 || numberOfPlayers === 6) {
                minEfficiencyDenominator -= 1;
            }
            const minEfficiency = (minEfficiencyNumerator / minEfficiencyDenominator).toFixed(2);
            // Round it to 2 decimal places

            efficiencyNumberLabel.setText(`${efficiency} / ${minEfficiency}`);
        };

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
        if (lobby.settings.showBGAUI) {
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
        this.suitLabelTexts = [];
        {
            let i = 0;
            for (const suit of globals.variant.suits) {
                const playStackX = playStackValues.x + (width + playStackValues.spacing) * i;

                pileback = new Kinetic.Image({
                    x: playStackX * winW,
                    y: playStackValues.y * winH,
                    width: width * winW,
                    height: height * winH,
                    image: cardImages[`Card-${suit.name}-0`],
                });

                bgLayer.add(pileback);

                const thisSuitPlayStack = new CardStack({
                    x: playStackX * winW,
                    y: playStackValues.y * winH,
                    width: width * winW,
                    height: height * winH,
                });
                playStacks.set(suit, thisSuitPlayStack);
                cardLayer.add(thisSuitPlayStack);

                const thisSuitDiscardStack = new CardLayout({
                    x: 0.81 * winW,
                    y: (0.61 + y * i) * winH,
                    width: 0.17 * winW,
                    height: 0.17 * winH,
                });
                discardStacks.set(suit, thisSuitDiscardStack);
                cardLayer.add(thisSuitDiscardStack);

                // Draw the suit name next to each suit
                // (a text description of the suit)
                if (globals.variant.showSuitNames) {
                    let text = suit.name;
                    if (
                        lobby.settings.showColorblindUI
                        && suit.clueColors.length > 1
                        && suit !== SUIT.RAINBOW
                        && suit !== SUIT.RAINBOW1OE
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
                    textLayer.add(suitLabelText);
                    this.suitLabelTexts.push(suitLabelText);
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
        if (lobby.settings.showBGAUI) {
            playAreaValues.x = 0.01;
            playAreaValues.y = 0.279;
            playAreaValues.w = 0.4;
        }
        playArea = new Kinetic.Rect({
            x: (playAreaValues.x - overlap) * winW,
            y: (playAreaValues.y - overlap) * winH,
            width: (playAreaValues.w + overlap * 2) * winW,
            height: (playAreaValues.h + overlap * 2) * winH,
        });

        /*
            Draw the deck
        */

        // This is the faded rectangle that is hidden until all of the deck has been depleted
        drawDeckRect = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.006 * winW,
        });
        bgLayer.add(drawDeckRect);

        drawDeck = new CardDeck({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            cardback: 'deck-back',
            suits: globals.variant.suits,
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
                    data: {
                        type: ACT.DECKPLAY,
                    },
                });

                self.stopAction();

                savedAction = null;
            } else {
                // The card was dragged to an invalid location,
                // so animate the card back to where it was
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

        const goToTurn = (event) => {
            // Do nothing if this is not a right-click
            if (event.evt.which !== 3) {
                return;
            }

            const turn = parseInt(window.prompt('Which turn do you want to go to?'), 10) - 1;
            // We need to decrement the turn because
            // the turn shown to the user is always one greater than the real turn

            if (globals.replay) {
                ui.inferSharedReplayMode();
            } else {
                ui.enterReplay(true);
            }
            ui.performReplay(turn, true);
        };
        drawDeck.cardback.on('click', goToTurn);
        drawDeckRect.on('click', goToTurn);
        // We also want to be able to right-click if all the cards are drawn

        cardLayer.add(drawDeck);

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
            if (lobby.settings.showBGAUI) {
                // If Board Game Arena mode is on, then we need to reverse every hand
                reverse = true;
            }
            if (lobby.settings.reverseHands) {
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
            if (lobby.settings.showBGAUI) {
                playerHandPos = handPosBGA;
            }

            let invertCards = false;
            if (i !== globals.playerUs) {
                // We want to flip the cards for other players
                invertCards = true;
            }
            if (lobby.settings.showBGAUI) {
                // On the BGA layout, all the hands should not be flipped
                invertCards = false;
            }

            playerHands[i] = new CardLayout({
                x: playerHandPos[nump][j].x * winW,
                y: playerHandPos[nump][j].y * winH,
                width: playerHandPos[nump][j].w * winW,
                height: playerHandPos[nump][j].h * winH,
                rotationDeg: playerHandPos[nump][j].rot,
                align: 'center',
                reverse: isHandReversed(j),
                invertCards,
            });

            cardLayer.add(playerHands[i]);

            // Draw the faded shade that shows where the "new" side of the hand is
            // (but don't bother drawing it in Board Game Arena mode since
            // all the hands face the same way)
            if (!lobby.settings.showBGAUI) {
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

                bgLayer.add(rect);
            }

            let playerNamePos = namePos;
            if (lobby.settings.showBGAUI) {
                playerNamePos = namePosBGA;
            }
            nameFrames[i] = new HanabiNameFrame({
                x: playerNamePos[nump][j].x * winW,
                y: playerNamePos[nump][j].y * winH,
                width: playerNamePos[nump][j].w * winW,
                height: playerNamePos[nump][j].h * winH,
                name: globals.playerNames[i],
            });
            UILayer.add(nameFrames[i]);

            // Draw the tooltips on the player names that show the time
            if (!globals.replay) {
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
                    text: CHARACTERS[globals.characterAssignments[i]].emoji,
                    fill: 'yellow',
                    shadowColor: 'black',
                    shadowBlur: 10,
                    shadowOffset: {
                        x: 0,
                        y: 0,
                    },
                    shadowOpacity: 0.9,
                });
                UILayer.add(charIcon);

                charIcon.on('mousemove', function charIconMouseMove() {
                    ui.activeHover = this;

                    const tooltipX = this.getWidth() / 2 + this.attrs.x;
                    const tooltip = $(`#tooltip-character-assignment-${i}`);
                    tooltip.css('left', tooltipX);
                    tooltip.css('top', this.attrs.y);

                    const character = CHARACTERS[globals.characterAssignments[i]];
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
        if (lobby.settings.showBGAUI) {
            clueAreaValues.x = playStackValues.x - 0.102;
            clueAreaValues.y = playStackValues.y + 0.22;
        }
        clueArea = new Kinetic.Group({
            x: clueAreaValues.x * winW,
            y: clueAreaValues.y * winH,
            width: clueAreaValues.w * winW,
            height: clueAreaValues.h * winH,
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

            clueArea.add(button);
            clueTargetButtonGroup.add(button);

            x += 0.0875 * winW;
        }

        // Rank buttons
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
                clue: new Clue(CLUE_TYPE.RANK, i),
            });

            // Add it to the tracking array (for keyboard hotkeys)
            rankClueButtons.push(button);

            clueArea.add(button);

            clueButtonGroup.add(button);
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
            x: 0.183 * winW,
            y: 0.172 * winH,
            width: 0.236 * winW,
            height: 0.051 * winH,
            text: 'Give Clue',
        });
        clueArea.add(submitClue);
        clueArea.hide();

        UILayer.add(clueArea);

        const noClueBoxValues = {
            x: 0.275,
            y: 0.56,
        };
        if (lobby.settings.showBGAUI) {
            noClueBoxValues.x = clueAreaValues.x + 0.178;
            noClueBoxValues.y = clueAreaValues.y;
        }
        noClueBox = new Kinetic.Rect({
            x: noClueBoxValues.x * winW,
            y: noClueBoxValues.y * winH,
            width: 0.25 * winW,
            height: 0.15 * winH,
            cornerRadius: 0.01 * winW,
            fill: 'black',
            opacity: 0.5,
            visible: false,
        });
        UILayer.add(noClueBox);

        const noClueLabelValues = {
            x: noClueBoxValues.x - 0.125,
            y: noClueBoxValues.y + 0.025,
        };
        noClueLabel = new Kinetic.Text({
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
        UILayer.add(noClueLabel);

        /*
            Draw the timer
        */

        this.stopLocalTimer();

        // We don't want the timer to show in replays
        if (!globals.replay && (globals.timed || lobby.settings.showTimerInUntimed)) {
            const timerValues = {
                x1: 0.155,
                x2: 0.565,
                y1: 0.592,
                y2: 0.592,
            };
            if (lobby.settings.showBGAUI) {
                timerValues.x1 = 0.31;
                timerValues.x2 = 0.31;
                timerValues.y1 = 0.77;
                timerValues.y2 = 0.885;
            }

            timer1 = new TimerDisplay({
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

            timerLayer.add(timer1);

            timer2 = new TimerDisplay({
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

            timerLayer.add(timer2);
        }

        /*
            Draw the replay area
        */

        // Navigating as a follower in a shared replay disables replay actions
        const inferSharedReplayMode = () => {
            if (
                globals.replay
                && globals.sharedReplay
                && globals.sharedReplayLeader !== lobby.username
                && ui.useSharedTurns
            ) {
                // Replay actions currently enabled, so disable them
                toggleSharedTurnButton.dispatchEvent(new MouseEvent('click'));
            }
        };
        this.inferSharedReplayMode = inferSharedReplayMode;
        // Make it available so that we can use it elsewhere in the code

        const replayAreaValues = {
            x: 0.15,
            y: 0.51,
            w: 0.5,
        };
        if (lobby.settings.showBGAUI) {
            replayAreaValues.x = 0.01;
            replayAreaValues.y = 0.49;
            replayAreaValues.w = 0.4;
        }
        replayArea = new Kinetic.Group({
            x: replayAreaValues.x * winW,
            y: replayAreaValues.y * winH,
            width: replayAreaValues.w * winW,
            height: 0.27 * winH,
        });

        replayBar = new Kinetic.Rect({
            x: 0,
            y: 0.0425 * winH,
            width: replayAreaValues.w * winW,
            height: 0.01 * winH,
            fill: 'black',
            cornerRadius: 0.005 * winH,
            listening: false,
        });

        replayArea.add(replayBar);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: replayAreaValues.w * winW,
            height: 0.05 * winH,
            opacity: 0,
        });

        rect.on('click', function rectClick(event) {
            const rectX = event.evt.x - this.getAbsolutePosition().x;
            const w = this.getWidth();
            const step = w / globals.replayMax;
            const newTurn = Math.floor((rectX + step / 2) / step);
            if (newTurn !== globals.replayTurn) {
                inferSharedReplayMode();
                self.performReplay(newTurn, true);
            }
        });

        replayArea.add(rect);

        replayShuttleShared = new Kinetic.Rect({
            x: 0,
            y: 0.0325 * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            cornerRadius: 0.01 * winW,
            fill: '#d1d1d1',
            visible: !ui.useSharedTurns,
        });

        replayShuttleShared.on('click tap', () => {
            ui.performReplay(globals.sharedReplayTurn, true);
        });

        replayArea.add(replayShuttleShared);

        replayShuttle = new Kinetic.Rect({
            x: 0,
            y: 0.0325 * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            fill: '#0000cc',
            cornerRadius: 0.01 * winW,
            draggable: true,
            dragBoundFunc: function dragBoundFunc(pos) {
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
                const step = w / globals.replayMax;
                const newTurn = Math.floor((shuttleX + step / 2) / step);
                if (newTurn !== globals.replayTurn) {
                    inferSharedReplayMode();
                    self.performReplay(newTurn, true);
                }
                shuttleX = newTurn * step;
                return {
                    x: min + shuttleX,
                    y: shuttleY,
                };
            },
        });
        replayShuttle.on('dragend', () => {
            cardLayer.draw();
            UILayer.draw();
        });
        replayArea.add(replayShuttle);
        ui.adjustReplayShuttle();

        const replayButtonValues = {
            x: 0.1,
            y: 0.07,
            spacing: 0.08,
        };
        if (lobby.settings.showBGAUI) {
            replayButtonValues.x = 0.05;
        }

        // Rewind to the beginning (the left-most button)
        button = new Button({
            x: replayButtonValues.x * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewindfull',
        });
        const rewindFullFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(0);
        };
        button.on('click tap', rewindFullFunction);
        replayArea.add(button);

        // Rewind one turn (the second left-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewind',
        });
        const backwardFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(globals.replayTurn - 1, true);
        };
        button.on('click tap', backwardFunction);
        replayArea.add(button);

        // Go forward one turn (the second right-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing * 2) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forward',
        });
        const forwardFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(globals.replayTurn + 1);
        };
        button.on('click tap', forwardFunction);
        replayArea.add(button);

        // Go forward to the end (the right-most button)
        button = new Button({
            x: (replayButtonValues.x + replayButtonValues.spacing * 3) * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forwardfull',
        });
        const forwardFullFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(globals.replayMax, true);
        };
        button.on('click tap', forwardFullFunction);
        replayArea.add(button);

        // The "Exit Replay" button
        replayExitButton = new Button({
            x: (replayButtonValues.x + 0.05) * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Exit Replay',
            visible: !globals.replay && !globals.sharedReplay,
        });
        replayExitButton.on('click tap', () => {
            if (globals.replay) {
                ui.sendMsg({
                    type: 'gameUnattend',
                    data: {},
                });

                this.stopLocalTimer();
                game.hide();
            } else {
                // Mark the time that the user clicked the "Exit Replay" button
                // (so that we can avoid an accidental "Give Clue" double-click)
                ui.accidentalClueTimer = Date.now();
                self.enterReplay(false);
            }
        });
        replayArea.add(replayExitButton);

        // The "Pause Shared Turns"  / "Use Shared Turns" button
        toggleSharedTurnButton = new ToggleButton({
            x: (replayButtonValues.x + 0.05) * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Pause Shared Turns',
            alternateText: 'Use Shared Turns',
            initialState: !ui.useSharedTurns,
            visible: false,
        });
        toggleSharedTurnButton.on('click tap', () => {
            ui.useSharedTurns = !ui.useSharedTurns;
            replayShuttleShared.setVisible(!ui.useSharedTurns);
            if (ui.useSharedTurns) {
                if (globals.sharedReplayLeader === lobby.username) {
                    shareCurrentTurn(globals.replayTurn);
                } else {
                    ui.performReplay(globals.sharedReplayTurn);
                }
            }
        });
        replayArea.add(toggleSharedTurnButton);

        replayArea.hide();
        UILayer.add(replayArea);

        /*
            Keyboard shortcuts
        */

        const backwardRound = () => {
            inferSharedReplayMode();
            ui.performReplay(globals.replayTurn - nump, true);
        };

        const forwardRound = () => {
            inferSharedReplayMode();
            ui.performReplay(globals.replayTurn + nump);
        };

        const mouseClickHelper = elem => () => {
            elem.dispatchEvent(new MouseEvent('click'));
        };

        // Navigation during replays
        const replayNavigationKeyMap = {
            'End': forwardFullFunction,
            'Home': rewindFullFunction,

            'ArrowLeft': backwardFunction,
            'ArrowRight': forwardFunction,

            '[': backwardRound,
            ']': forwardRound,
        };

        // Build an object that contains all of the keyboard hotkeys along with
        // how they should interact with clue UI
        const clueKeyMap = {};

        // Add "Tab" for player selection
        clueKeyMap.Tab = () => {
            clueTargetButtonGroup.selectNextTarget();
        };

        // Add "12345" to the map (for number clues)
        for (let i = 0; i < rankClueButtons.length; i++) {
            // The button for "1" is at array index 0, etc.
            clueKeyMap[i + 1] = mouseClickHelper(rankClueButtons[i]);
        }

        // Add "qwert" (for color clues)
        // (we want to use qwert since they are conveniently next to 12345, and also
        // because the clue colors can change between different variants)
        const clueKeyRow = ['q', 'w', 'e', 'r', 't', 'y', 'u'];
        for (let i = 0; i < suitClueButtons.length && i < clueKeyRow.length; i++) {
            clueKeyMap[clueKeyRow[i]] = mouseClickHelper(suitClueButtons[i]);
        }

        // The hotkey for giving a clue is enabled separately in the "keyNavigation()" function

        // Keyboard actions for playing and discarding cards
        const promptOwnHandOrder = (actionString) => {
            const playerCards = playerHands[globals.playerUs].children;
            const maxSlotIndex = playerCards.length;
            const msg = `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${actionString}.`;
            const response = window.prompt(msg);

            if (/^deck$/i.test(response)) {
                return 'deck';
            }

            if (!/^\d+$/.test(response)) {
                return null;
            }

            const numResponse = parseInt(response, 10);
            if (numResponse < 1 || numResponse > maxSlotIndex) {
                return null;
            }

            return playerCards[maxSlotIndex - numResponse].children[0].order;
        };

        const doKeyboardCardAction = (tryPlay) => {
            const intendedPlay = tryPlay === true;
            const cardOrder = promptOwnHandOrder(intendedPlay ? 'play' : 'discard');

            if (cardOrder === null) {
                return;
            }
            if (cardOrder === 'deck' && !(intendedPlay && savedAction.canBlindPlayDeck)) {
                return;
            }

            const data = {};
            if (cardOrder === 'deck') {
                data.type = ACT.DECKPLAY;
            } else {
                data.type = intendedPlay ? ACT.PLAY : ACT.DISCARD;
                data.target = cardOrder;
            }

            ui.sendMsg({
                type: 'action',
                data,
            });
            ui.stopAction();
            savedAction = null;
        };

        const doKeyboardCardPlay = () => {
            doKeyboardCardAction(true);
        };

        const doKeyboardCardDiscard = () => {
            doKeyboardCardAction(false);
        };

        const playKeyMap = {
            'a': doKeyboardCardPlay, // The main play hotkey
            '+': doKeyboardCardPlay, // For numpad users
        };

        const discardKeyMap = {
            'd': doKeyboardCardDiscard, // The main discard hotkey
            '-': doKeyboardCardDiscard, // For numpad users
        };

        this.keyNavigation = (event) => {
            // Make sure that the editing note variable is not set
            if (ui.editingNote !== null) {
                return;
            }

            // Make sure we are not typing anything into the in-game chat
            if ($('#game-chat-input').is(':focus')) {
                return;
            }

            if (event.key === 'Z') { // Shift + z
                // This is used for fun in shared replays
                globals.sharedReplaySendSound('buzz');
                return;
            }
            if (event.key === 'X') { // Shift + x
                // This is used as a sound test
                ui.game.sounds.play('turn_us');
                return;
            }
            if (event.ctrlKey && event.key === 'Enter') { // Ctrl + Enter
                // Click on the 'Give Clue' button
                submitClue.dispatchEvent(new MouseEvent('click'));
                return;
            }

            // Don't interfere with other kinds of hotkeys
            if (event.ctrlKey || event.altKey) {
                return;
            }

            // Speedrun hotkey helper functions
            const getOrderFromSlot = (slot) => {
                const playerCards = playerHands[globals.playerUs].children;
                const maxSlotIndex = playerCards.length;
                return playerCards[maxSlotIndex - slot].children[0].order;
            };
            const speedrunAction = (type, target, clue = null) => {
                if (clue !== null && !showClueMatch(target, clue)) {
                    return;
                }
                const action = {
                    type: 'action',
                    data: {
                        type,
                        target,
                        clue,
                    },
                };
                ui.endTurn(action);
            };

            // Check for speedrun keyboard hotkeys
            if (lobby.settings.speedrunHotkeys) {
                // Play cards (ACT.PLAY)
                if (event.key === '1') {
                    speedrunAction(ACT.PLAY, getOrderFromSlot(1));
                } else if (event.key === '2') {
                    speedrunAction(ACT.PLAY, getOrderFromSlot(2));
                } else if (event.key === '3') {
                    speedrunAction(ACT.PLAY, getOrderFromSlot(3));
                } else if (event.key === '4') {
                    speedrunAction(ACT.PLAY, getOrderFromSlot(4));
                } else if (event.key === '5') {
                    speedrunAction(ACT.PLAY, getOrderFromSlot(5));
                }

                // Discard cards (ACT.DISCARD)
                if (event.key === 'q') {
                    speedrunAction(ACT.DISCARD, getOrderFromSlot(1));
                } else if (event.key === 'w') {
                    speedrunAction(ACT.DISCARD, getOrderFromSlot(2));
                } else if (event.key === 'e') {
                    speedrunAction(ACT.DISCARD, getOrderFromSlot(3));
                } else if (event.key === 'r') {
                    speedrunAction(ACT.DISCARD, getOrderFromSlot(4));
                } else if (event.key === 't') {
                    speedrunAction(ACT.DISCARD, getOrderFromSlot(5));
                }

                // Check for a clue recipient
                const target = clueTargetButtonGroup.getPressed();
                if (!target) {
                    return;
                }
                const who = target.targetIndex;

                // Give a number clue
                if (event.key === '!') { // Shift + 1
                    speedrunAction(ACT.CLUE, who, {
                        type: 0,
                        value: 1,
                    });
                } else if (event.key === '@') { // Shift + 2
                    speedrunAction(ACT.CLUE, who, {
                        type: 0,
                        value: 2,
                    });
                } else if (event.key === '#') { // Shift + 3
                    speedrunAction(ACT.CLUE, who, {
                        type: 0,
                        value: 3,
                    });
                } else if (event.key === '$') { // Shift + 4
                    speedrunAction(ACT.CLUE, who, {
                        type: 0,
                        value: 4,
                    });
                } else if (event.key === '%') { // Shift + 5
                    speedrunAction(ACT.CLUE, who, {
                        type: 0,
                        value: 5,
                    });
                }

                // Give a color clue
                if (event.key === 'Q') { // Shift + q
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 0,
                    });
                } else if (event.key === 'W') { // Shift + w
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 1,
                    });
                } else if (event.key === 'E') { // Shift + e
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 2,
                    });
                } else if (event.key === 'R') { // Shift + r
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 3,
                    });
                } else if (event.key === 'T') { // Shift + t
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 4,
                    });
                } else if (event.key === 'Y') { // Shift + y
                    speedrunAction(ACT.CLUE, who, {
                        type: 1,
                        value: 5,
                    });
                }

                return;
            }

            // Check for non-speedrun keyboard hotkeys
            if (event.shiftKey) {
                // There are no non-speedrun related keyboard hotkeys that use shift
                return;
            }
            let currentNavigation;
            if (replayArea.visible()) {
                currentNavigation = replayNavigationKeyMap[event.key];
            } else if (savedAction !== null) { // current user can take an action
                if (savedAction.canClue) {
                    currentNavigation = clueKeyMap[event.key];
                }
                if (savedAction.canDiscard) {
                    currentNavigation = currentNavigation || discardKeyMap[event.key];
                }
                currentNavigation = currentNavigation || playKeyMap[event.key];
            }

            if (currentNavigation !== undefined) {
                event.preventDefault();
                currentNavigation();
            }
        };

        $(document).keydown(this.keyNavigation);

        /*
            End of keyboard shortcuts
        */

        globals.sharedReplaySendSound = (sound) => {
            // Only enable sound effects in a shared replay
            if (!globals.replay || !globals.sharedReplay) {
                return;
            }

            // Only enable sound effects for shared replay leaders
            if (globals.sharedReplayLeader !== lobby.username) {
                return;
            }

            // Send it
            ui.sendMsg({
                type: 'replayAction',
                data: {
                    type: 4,
                    sound,
                },
            });

            // Play the sound effect manually so that
            // we don't have to wait for the client to server round-trip
            ui.game.sounds.play(sound);
        };

        helpGroup = new Kinetic.Group({
            x: 0.1 * winW,
            y: 0.1 * winH,
            width: 0.8 * winW,
            height: 0.8 * winH,
            visible: false,
            listening: false,
        });

        overLayer.add(helpGroup);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.8 * winW,
            height: 0.8 * winH,
            opacity: 0.9,
            fill: 'black',
            cornerRadius: 0.01 * winW,
        });
        helpGroup.add(rect);

        const helpText = `Welcome to Hanabi!

When it is your turn, you may play a card by dragging it to the play stacks in the center of the screen.

To discard, drag a card to the discard area in the lower right. However, note that you are not allowed to discard when there are 8 clues available. (A red border will appear around the discard area to signify this.)

To give a clue, use the boxes in the center of the screen. You may mouseover a card to see what clues have been given about it. You can also mouseover the clues in the log to see which cards it referenced.

You can rewind the game state with the arrow button in the bottom-left.

Keyboard hotkeys:
- Play: "a" or "+"
- Discard: "d" or "-"
- Clue: "Tab", then 1/2/3/4/5 or Q/W/E/R/T, then "Enter"
- Rewind: "Left", or "[" for a full rotation, or "Home" for the beginning
- Fast-forward: "Right", or "]" for a full rotation, or "End" for the end`;
        const text = new Kinetic.Text({
            x: 0.03 * winW,
            y: 0.03 * winH,
            width: 0.74 * winW,
            height: 0.74 * winH,
            fontSize: 0.019 * winW,
            fontFamily: 'Verdana',
            fill: 'white',
            text: helpText,
        });
        helpGroup.add(text);

        deckPlayAvailableLabel = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            stroke: 'yellow',
            cornerRadius: 6,
            strokeWidth: 10,
            visible: false,
        });
        UILayer.add(deckPlayAvailableLabel);

        replayButton = new Button({
            x: 0.01 * winW,
            y: 0.8 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            image: 'replay',
            visible: false,
        });
        replayButton.on('click tap', () => {
            self.enterReplay(!globals.inReplay);
        });

        UILayer.add(replayButton);

        helpButton = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            text: 'Help',
            visible: false, // Currently disabled in favor of a chat button
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

        const toggleChat = (show) => {
            chatButton.setVisible(!show);
            cluesButton.setVisible(show);
            clueLog.setVisible(!show);
            if (show) {
                $('#tooltip-chat').css('left', clueLogRect.attrs.x);
                $('#tooltip-chat').css('top', clueLogRect.attrs.y);
                $('#tooltip-chat').css('width', clueLogRect.attrs.width);
                $('#tooltip-chat').tooltipster('instance').option('minWidth', clueLogRect.attrs.width);
                $('#tooltip-chat').tooltipster('instance').option('maxWidth', clueLogRect.attrs.width);
                const chatHeight = clueLogRect.attrs.height - 0.027 * winH;
                $('#game-chat').css('min-height', chatHeight);
                $('#game-chat').css('min-height', chatHeight);
                $('#tooltip-chat').tooltipster('open');
            } else {
                $('#tooltip-chat').tooltipster('close');
            }
            UILayer.draw();
        };

        chatButton = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            text: 'Chat',
        });
        UILayer.add(chatButton);
        chatButton.on('click tap', () => {
            toggleChat(true);
        });

        cluesButton = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            text: 'Clues',
            visible: false,
        });
        UILayer.add(cluesButton);
        cluesButton.on('click tap', () => {
            toggleChat(false);
        });

        lobbyButton = new Button({
            x: 0.01 * winW,
            y: 0.94 * winH,
            width: 0.06 * winW,
            height: 0.05 * winH,
            text: 'Lobby',
        });
        UILayer.add(lobbyButton);

        lobbyButton.on('click tap', () => {
            lobbyButton.off('click tap');
            ui.sendMsg({
                type: 'gameUnattend',
                data: {},
            });

            this.stopLocalTimer();
            game.hide();
        });

        if (globals.inReplay) {
            replayArea.show();
        }

        stage.add(bgLayer);
        stage.add(textLayer);
        stage.add(UILayer);
        stage.add(timerLayer);
        stage.add(cardLayer);
        stage.add(overLayer);
    };

    this.reset = function reset() {
        messagePrompt.setMultiText('');
        msgLogGroup.reset();

        const { suits } = globals.variant;

        for (const suit of suits) {
            playStacks.get(suit).removeChildren();
            discardStacks.get(suit).removeChildren();
        }

        for (let i = 0; i < globals.playerNames.length; i++) {
            playerHands[i].removeChildren();
        }

        globals.deck = [];
        ui.postAnimationLayout = null;

        clueLog.clear();
        messagePrompt.reset();

        // This should always be overridden before it gets displayed
        drawDeck.setCount(99);

        for (let i = 0; i < strikes.length; i++) {
            strikes[i].remove();
        }

        strikes = [];

        this.animateFast = true;
    };

    this.saveReplay = function saveReplay(msg) {
        const msgData = msg.data;

        globals.replayLog.push(msg);

        if (msgData.type === 'turn') {
            this.replayMax = msgData.num;
        }
        if (msgData.type === 'gameOver') {
            this.replayMax += 1;
        }

        if (!globals.replay && this.replayMax > 0) {
            replayButton.show();
        }

        if (globals.inReplay) {
            this.adjustReplayShuttle();
            UILayer.draw();
        }
    };

    const positionReplayShuttle = (shuttle, turn) => {
        const w = shuttle.getParent().getWidth() - shuttle.getWidth();
        shuttle.setX(turn * w / this.replayMax);
    };

    this.adjustReplayShuttle = () => {
        positionReplayShuttle(replayShuttle, globals.replayTurn);
        positionReplayShuttle(replayShuttleShared, globals.sharedReplayTurn);
    };

    this.enterReplay = function enterReplay(enter) {
        if (!globals.inReplay && enter) {
            globals.inReplay = true;
            globals.replayPos = globals.replayLog.length;
            globals.replayTurn = this.replayMax;
            this.adjustReplayShuttle();
            this.stopAction();
            replayArea.show();
            for (let i = 0; i < globals.deck.length; i++) {
                globals.deck[i].setBareImage();
            }
            UILayer.draw();
            cardLayer.draw();
        } else if (globals.inReplay && !enter) {
            this.performReplay(this.replayMax, true);
            globals.inReplay = false;
            replayArea.hide();

            if (savedAction) {
                this.handleAction(savedAction);
            }
            for (let i = 0; i < globals.deck.length; i++) {
                globals.deck[i].setBareImage();
            }
            UILayer.draw();
            cardLayer.draw();
        }
    };

    // This function is necessary because the server does not send a 'status'
    // message for the initial configuration of cards
    this.resetLabels = function resetLabels() {
        cluesNumberLabel.setText('8');
        cluesNumberLabel.setFill('#df1c2d');
        scoreNumberLabel.setText('0');
        paceNumberLabel.setText('-'); // The deck count hasn't updated yet, so just set this to a default value
        efficiencyNumberLabel.setText('-'); // Since no clues have been given yet, we can't divide by 0
    };

    this.performReplay = function performReplay(target, fast) {
        let rewind = false;

        if (target < 0) {
            target = 0;
        }
        if (target > this.replayMax) {
            target = this.replayMax;
        }

        if (target < globals.replayTurn) {
            rewind = true;
            this.resetLabels();
            this.cardsGotten = 0;
            this.cluesSpentPlusStrikes = 0;
        }

        if (globals.replayTurn === target) {
            return; // We're already there, nothing to do!
        }

        if (
            globals.sharedReplay
            && globals.sharedReplayLeader === lobby.username
            && this.useSharedTurns
        ) {
            shareCurrentTurn(target);
        }

        globals.replayTurn = target;

        this.adjustReplayShuttle();
        if (fast) {
            this.animateFast = true;
        }

        if (rewind) {
            this.reset();
            globals.replayPos = 0;
        }

        rebuildReplay();

        this.animateFast = false;
        msgLogGroup.refreshText();
        messagePrompt.refreshText();
        cardLayer.draw();
        UILayer.draw();
    };

    this.replayAdvanced = function replayAdvanced() {
        this.animateFast = false;

        if (globals.inReplay) {
            this.performReplay(0);
        }

        cardLayer.draw();

        // There's a bug on the emulator where the text doesn't show upon first
        // loading a game; doing this seems to fix it
        UILayer.draw();
    };

    this.showConnected = function showConnected(list) {
        if (!this.ready) {
            return;
        }

        for (let i = 0; i < list.length; i++) {
            nameFrames[i].setConnected(list[i]);
        }

        UILayer.draw();
    };

    function showLoading() {
        const loadinglayer = new Kinetic.Layer();

        const loadinglabel = new Kinetic.Text({
            fill: '#d8d5ef',
            stroke: '#747278',
            strokeWidth: 1,
            text: 'Loading...',
            align: 'center',
            x: 0,
            y: 0.7 * winH,
            width: winW,
            height: 0.05 * winH,
            fontFamily: 'Arial',
            fontStyle: 'bold',
            fontSize: 0.05 * winH,
        });

        loadinglayer.add(loadinglabel);

        const progresslabel = new Kinetic.Text({
            fill: '#d8d5ef',
            stroke: '#747278',
            strokeWidth: 1,
            text: '0 / 0',
            align: 'center',
            x: 0,
            y: 0.8 * winH,
            width: winW,
            height: 0.05 * winH,
            fontFamily: 'Arial',
            fontStyle: 'bold',
            fontSize: 0.05 * winH,
        });

        loadinglayer.add(progresslabel);

        ImageLoader.progressCallback = (done, total) => {
            progresslabel.setText(`${done}/${total}`);
            loadinglayer.draw();
        };

        stage.add(loadinglayer);
    }

    showLoading();

    this.getNote = (cardOrder) => {
        const note = notesWritten[cardOrder];
        if (typeof note === 'undefined') {
            return null;
        }
        return note;
    };

    this.setNote = function setNote(order, note) {
        if (note === '') {
            note = undefined;
        }
        notesWritten[order] = note;
    };

    this.handleNotify = function handleNotify(data) {
        // If an action in the game happens,
        // mark to make the tooltip go away after the user has finished entering their note
        if (ui.editingNote !== null) {
            ui.editingNoteActionOccured = true;
        }

        // Automatically disable any tooltips once an action in the game happens
        if (ui.activeHover) {
            ui.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            ui.activeHover = null;
        }

        const { type } = data;
        if (type === 'text') {
            this.setMessage(data);
        } else if (type === 'draw') {
            if (data.suit === -1) {
                delete data.suit;
            }
            if (data.rank === -1) {
                delete data.rank;
            }
            const suit = msgSuitToSuit(data.suit, globals.variant);
            if (!ui.learnedCards[data.order]) {
                ui.learnedCards[data.order] = {
                    possibleSuits: globals.variant.suits.slice(),
                    possibleRanks: globals.variant.ranks.slice(),
                };
            }
            globals.deck[data.order] = new HanabiCard({
                suit,
                rank: data.rank,
                order: data.order,
                suits: globals.variant.suits.slice(),
                ranks: globals.variant.ranks.slice(),
                holder: data.who,
            });

            const child = new LayoutChild();
            child.add(globals.deck[data.order]);

            const pos = drawDeck.cardback.getAbsolutePosition();

            child.setAbsolutePosition(pos);
            child.setRotation(-playerHands[data.who].getRotation());

            const scale = drawDeck.cardback.getWidth() / CARDW;
            child.setScale({
                x: scale,
                y: scale,
            });

            playerHands[data.who].add(child);
            playerHands[data.who].moveToTop();

            // Adding speedrun code; make all cards in our hand draggable from the get-go
            // except for cards we have already played or discarded
            if (
                lobby.settings.speedrunPreplay
                && data.who === globals.playerUs
                && !globals.replay
                && !globals.spectating
                && !ui.learnedCards[data.order].revealed
            ) {
                child.setDraggable(true);
                child.on('dragend.play', dragendPlay);
            }
        } else if (type === 'drawSize') {
            drawDeck.setCount(data.size);
        } else if (type === 'play') {
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            showClueMatch(-1);

            const child = globals.deck[data.which.order].parent;
            const card = child.children[0];
            if (!card.isClued()) {
                this.handleEfficiency(+1);
            }

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            globals.deck[data.which.order].showOnlyLearned = false;
            globals.deck[data.which.order].trueSuit = suit;
            globals.deck[data.which.order].trueRank = data.which.rank;
            globals.deck[data.which.order].setBareImage();

            globals.deck[data.which.order].hideClues();

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            card.suitPips.hide();
            card.rankPips.hide();
            child.remove();
            child.setAbsolutePosition(pos);

            playStacks.get(suit).add(child);
            playStacks.get(suit).moveToTop();

            clueLog.checkExpiry();
        } else if (type === 'discard') {
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            showClueMatch(-1);

            const cardObject = globals.deck[data.which.order];
            if (typeof cardObject === 'undefined') {
                console.error(`Failed to find card ${data.which.order} in the deck. (There are ${globals.deck.length} cards in the deck.)`);
                return;
            }
            const child = cardObject.parent;
            const card = child.children[0];
            if (card.isClued()) {
                this.handleEfficiency(-1);
            }

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            globals.deck[data.which.order].showOnlyLearned = false;
            globals.deck[data.which.order].trueSuit = suit;
            globals.deck[data.which.order].trueRank = data.which.rank;
            globals.deck[data.which.order].setBareImage();

            globals.deck[data.which.order].hideClues();

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            card.suitPips.hide();
            card.rankPips.hide();
            child.remove();
            child.setAbsolutePosition(pos);

            discardStacks.get(suit).add(child);

            for (const discardStack of discardStacks) {
                if (discardStack[1]) {
                    discardStack[1].moveToTop();
                }
            }

            let finished = false;
            do {
                const n = child.getZIndex();

                if (!n) {
                    break;
                }

                if (data.which.rank < child.parent.children[n - 1].children[0].trueRank) {
                    child.moveDown();
                } else {
                    finished = true;
                }
            } while (!finished);

            clueLog.checkExpiry();
        } else if (type === 'reveal') {
            // Has the following data:
            /*
                {
                    type: 'reveal',
                    which: {
                        order: 5,
                        rank: 2,
                        suit: 1,
                    },
                }
            */
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            const card = globals.deck[data.which.order];

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            card.showOnlyLearned = false;
            card.trueSuit = suit;
            card.trueRank = data.which.rank;
            card.setBareImage();

            card.hideClues();
            card.suitPips.hide();
            card.rankPips.hide();

            if (!this.animateFast) {
                cardLayer.draw();
            }
        } else if (type === 'clue') {
            this.cluesSpentPlusStrikes += 1;
            this.handleEfficiency(0);

            const clue = msgClueToClue(data.clue, globals.variant);
            showClueMatch(-1);

            for (let i = 0; i < data.list.length; i++) {
                const card = globals.deck[data.list[i]];
                if (!card.isClued()) {
                    this.handleEfficiency(+1);
                } else {
                    this.handleEfficiency(0);
                }
                let color;
                if (clue.type === 0) {
                    // Number (rank) clues
                    color = INDICATOR.POSITIVE;
                } else {
                    // Color clues
                    color = clue.value.hexCode;
                }
                card.setIndicator(true, color);
                card.cluedBorder.show();
                card.applyClue(clue, true);
                card.setBareImage();
            }

            const neglist = [];

            for (let i = 0; i < playerHands[data.target].children.length; i++) {
                const child = playerHands[data.target].children[i];

                const card = child.children[0];
                const { order } = card;

                if (data.list.indexOf(order) < 0) {
                    neglist.push(order);
                    card.applyClue(clue, false);
                    card.setBareImage();
                }
            }

            let clueName;
            if (data.clue.type === CLUE_TYPE.RANK) {
                clueName = clue.value.toString();
            } else {
                clueName = clue.value.name;
            }

            const entry = new HanabiClueEntry({
                width: clueLog.getWidth(),
                height: 0.017 * winH,
                giver: globals.playerNames[data.giver],
                target: globals.playerNames[data.target],
                clueName,
                list: data.list,
                neglist,
                turn: data.turn,
            });

            clueLog.add(entry);

            clueLog.checkExpiry();
        } else if (type === 'status') {
            // Update internal state variables
            this.currentClues = data.clues; // Used for the pre-move feature
            if (globals.variant.name.startsWith('Clue Starved')) {
                // In "Clue Starved" variants, 1 clue is represented on the server by 2
                // Thus, in order to get the "real" clue count, we have to divide by 2
                this.currentClues /= 2;
            }

            // Update the number of clues in the bottom-right hand corner of the screen
            cluesNumberLabel.setText(`${this.currentClues}`);
            if (this.currentClues === 0 || this.currentClues === 8) {
                cluesNumberLabel.setFill('#df1c2d'); // Red
            } else if (this.currentClues === 1) {
                cluesNumberLabel.setFill('#ef8c1d'); // Orange
            } else if (this.currentClues === 2) {
                cluesNumberLabel.setFill('#efef1d'); // Yellow
            } else {
                cluesNumberLabel.setFill('#d8d5ef'); // White
            }

            if (this.currentClues === 8) {
                // Show the red border around the discard pile
                // (to reinforce the fact that being at 8 clues is a special situation)
                noDiscardLabel.show();
                noDoubleDiscardLabel.hide();
            } else if (data.doubleDiscard) {
                // Show a yellow border around the discard pile
                // (to reinforce that this is a "Double Discard" situation)
                noDiscardLabel.hide();
                noDoubleDiscardLabel.show();
            } else {
                noDiscardLabel.hide();
                noDoubleDiscardLabel.hide();
            }

            // Update the score (in the bottom-right-hand corner)
            scoreNumberLabel.setText(data.score);

            /*
                Calculate some "End-Game" metrics
            */

            const adjustedScorePlusDeck = data.score + drawDeck.getCountAsInt() - data.maxScore;

            // Formula derived by Libster;
            // the number of discards that can happen while still getting the maximum number of
            // points (this is represented to the user as "Pace" on the user interface)
            const endGameThreshold1 = adjustedScorePlusDeck + globals.playerNames.length;

            // Formula derived by Florrat;
            // a strategical estimate of "End-Game" that tries to account for the number of players
            const endGameThreshold2 = adjustedScorePlusDeck + Math.floor(globals.playerNames.length / 2); // eslint-disable-line

            // Formula derived by Hyphen-ated;
            // a more conservative estimate of "End-Game" that does not account for
            // the number of players
            const endGameThreshold3 = adjustedScorePlusDeck;

            // Update the pace
            // (part of the efficiency statistics on the right-hand side of the screen)
            // If there are no cards left in the deck, pace is meaningless
            if (drawDeck.getCountAsInt() === 0) {
                paceNumberLabel.setText('-');
                paceNumberLabel.setFill('#d8d5ef'); // White
            } else {
                let paceText = endGameThreshold1.toString();
                if (endGameThreshold1 > 0) {
                    paceText = `+${endGameThreshold1}`;
                }
                paceNumberLabel.setText(paceText);

                // Color the pace label depending on how "risky" it would be to discard
                // (approximately)
                if (endGameThreshold1 <= 0) {
                    // No more discards can occur in order to get a maximum score
                    paceNumberLabel.setFill('#df1c2d'); // Red
                } else if (endGameThreshold2 < 0) {
                    // It would probably be risky to discard
                    paceNumberLabel.setFill('#ef8c1d'); // Orange
                } else if (endGameThreshold3 < 0) {
                    // It might be risky to discard
                    paceNumberLabel.setFill('#efef1d'); // Yellow
                } else {
                    // We are not even close to the "End-Game", so give it the default color
                    paceNumberLabel.setFill('#d8d5ef'); // White
                }
            }

            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'stackDirections') {
            // Update the stack directions (only in "Up or Down" variants)
            if (globals.variant.name.startsWith('Up or Down')) {
                for (let i = 0; i < data.directions.length; i++) {
                    const direction = data.directions[i];
                    let text;
                    if (direction === 0) {
                        text = ''; // Undecided
                    } else if (direction === 1) {
                        text = 'Up';
                    } else if (direction === 2) {
                        text = 'Down';
                    } else if (direction === 3) {
                        text = 'Finished';
                    } else {
                        text = 'Unknown';
                    }
                    this.suitLabelTexts[i].setText(text);
                    textLayer.draw();
                }
            }
        } else if (type === 'strike') {
            this.cluesSpentPlusStrikes += 1;
            this.handleEfficiency(0);
            const x = new Kinetic.Image({
                x: (0.015 + 0.04 * (data.num - 1)) * winW,
                y: 0.125 * winH,
                width: 0.02 * winW,
                height: 0.036 * winH,
                image: ImageLoader.get('redx'),
                opacity: 0,
            });

            strikes[data.num - 1] = x;

            scoreArea.add(x);

            if (ui.animateFast) {
                x.setOpacity(1.0);
            } else {
                new Kinetic.Tween({
                    node: x,
                    opacity: 1.0,
                    duration: ui.animateFast ? 0.001 : 1.0,
                    runonce: true,
                }).play();
            }
        } else if (type === 'turn') {
            // Keep track of whether or not it is our turn (speedrun)
            this.ourTurn = (data.who === globals.playerUs);
            if (!this.ourTurn) {
                // Adding this here to avoid bugs with pre-moves
                clueArea.hide();
            }

            for (let i = 0; i < globals.playerNames.length; i++) {
                nameFrames[i].setActive(data.who === i);
            }

            if (!this.animateFast) {
                UILayer.draw();
            }

            turnNumberLabel.setText(`${data.num + 1}`);

            if (this.queuedAction !== null && this.ourTurn) {
                setTimeout(() => {
                    ui.sendMsg(this.queuedAction);
                    ui.stopAction();

                    this.queuedAction = null;
                }, 250);
            }
        } else if (type === 'gameOver') {
            for (let i = 0; i < globals.playerNames.length; i++) {
                nameFrames[i].off('mousemove');
            }

            if (timer1) {
                timer1.hide();
            }

            timerLayer.draw();

            this.stopLocalTimer();

            // If the game just finished for the players,
            // start the process of transforming it into a shared replay
            if (!globals.replay) {
                globals.replay = true;
                globals.replayTurn = this.replayMax;
                globals.sharedReplayTurn = globals.replayTurn;
                replayButton.hide();
                // Hide the in-game replay button in the bottom-left-hand corner
            }

            // We could be in the middle of an in-game replay when the game ends,
            // so don't jerk them out of the in-game replay
            if (!globals.inReplay) {
                this.enterReplay(true);
            }

            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'reorder') {
            const hand = playerHands[data.target];
            // TODO: Throw an error if hand and note.hand dont have the same numbers in them

            // Get the LayoutChild objects in the hand and
            // put them in the right order in a temporary array
            const newChildOrder = [];
            const handSize = hand.children.length;
            for (let i = 0; i < handSize; i++) {
                const order = data.handOrder[i];
                const child = globals.deck[order].parent;
                newChildOrder.push(child);

                // Take them out of the hand itself
                child.remove();
            }

            // Put them back into the hand in the new order
            for (let i = 0; i < handSize; i++) {
                const child = newChildOrder[i];
                hand.add(child);
            }
        } else if (type === 'boot') {
            this.stopLocalTimer();
            game.hide();
        }
    };

    this.handleSpectators = (data) => {
        if (!spectatorsLabel) {
            // Sometimes we can get here without the spectators label being initiated yet
            return;
        }

        // Remember the current list of spectators
        this.spectators = data.names;

        const shouldShowLabel = data.names.length > 0;
        spectatorsLabel.setVisible(shouldShowLabel);
        spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectatorsNumLabel.setText(data.names.length);

            // Build the string that shows all the names
            const nameEntries = data.names.map(name => `<li>${name}</li>`).join('');
            let content = '<strong>';
            if (globals.replay) {
                content += 'Shared Replay Viewers';
            } else {
                content += 'Spectators';
            }
            content += `:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
            $('#tooltip-spectators').tooltipster('instance').content(content);
        } else {
            $('#tooltip-spectators').tooltipster('close');
        }

        // We might also need to update the content of replay leader icon
        if (globals.sharedReplay) {
            let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
            if (!this.spectators.includes(globals.sharedReplayLeader)) {
                // Check to see if the leader is away
                content += ' (away)';
            }
            $('#tooltip-leader').tooltipster('instance').content(content);
        }

        UILayer.batchDraw();
    };

    this.handleClock = (activeIndex) => {
        this.stopLocalTimer();

        // Check to see if the second timer has been drawn
        if (typeof timer2 === 'undefined') {
            return;
        }

        const currentUserTurn = activeIndex === globals.playerUs && !globals.spectating;

        // Update onscreen time displays
        if (!globals.spectating) {
            // The visibilty of this timer does not change during a game
            let time = ui.playerTimes[globals.playerUs];
            if (!globals.timed) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timer1.setText(millisecondsToTimeDisplay(time));
        }

        if (!currentUserTurn) {
            // Update the ui with the value of the timer for the active player
            let time = ui.playerTimes[activeIndex];
            if (!globals.timed) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timer2.setText(millisecondsToTimeDisplay(time));
        }

        const shoudShowTimer2 = !currentUserTurn && activeIndex !== null;
        timer2.setVisible(shoudShowTimer2);
        timerLayer.draw();

        // Update the timer tooltips for each player
        for (let i = 0; i < ui.playerTimes.length; i++) {
            setTickingDownTimeTooltip(i);
        }

        // If no timer is running on the server, do not configure local approximation
        if (activeIndex === null) {
            return;
        }

        // Start the local timer for the active player
        const activeTimerUIText = (currentUserTurn ? timer1 : timer2);
        ui.timerID = window.setInterval(() => {
            setTickingDownTime(activeTimerUIText, activeIndex);
            setTickingDownTimeTooltip(activeIndex);
        }, 1000);
    };

    // Recieved by the client when spectating a game
    // Has the following data:
    /*
        {
            order: 16,
            note: '<strong>Zamiel:</strong> note1<br /><strong>Duneaught:</strong> note2<br />',
        }
    */
    this.handleNote = (data) => {
        // Set the note
        // (which is the combined notes from all of the players, formatted by the server)
        ui.setNote(data.order, data.notes);

        // Draw (or hide) the note indicator
        const card = globals.deck[data.order];
        if (!card) {
            return;
        }

        // Show or hide the note indicator
        if (data.notes.length > 0) {
            card.noteGiven.show();
            if (!card.noteGiven.rotated) {
                card.noteGiven.rotate(15);
                card.noteGiven.rotated = true;
            }
        } else {
            card.noteGiven.hide();
        }

        cardLayer.batchDraw();
    };

    // Recieved by the client when:
    // - joining a replay (will get all notes)
    // - joining a shared replay (will get all notes)
    // - joining an existing game as a spectator (will get all notes)
    // - reconnecting an existing game as a player (will only get your own notes)
    // Has the following data:
    /*
        {
            notes: [
                null,
                null,
                null,
                zamiel: 'g1\nsankala: g1/g2',
            ],
        }
    */
    this.handleNotes = (data) => {
        for (let order = 0; order < data.notes.length; order++) {
            const note = data.notes[order];

            // Set the note
            ui.setNote(order, note);

            // The following code is mosly copied from the "handleNote" function
            // Draw (or hide) the note indicator
            const card = globals.deck[order];
            if (!card) {
                continue;
            }
            if (note !== null && note !== '') {
                card.note = note;
            }
            if (note !== null && note !== '') {
                card.noteGiven.show();
                if (globals.spectating && !card.noteGiven.rotated) {
                    card.noteGiven.rotate(15);
                    card.noteGiven.rotated = true;
                }
            }
        }

        cardLayer.batchDraw();
    };

    this.handleReplayLeader = function handleReplayLeader(data) {
        // We might be entering this function after a game just ended
        globals.sharedReplay = true;
        replayExitButton.hide();

        // Update the stored replay leader
        globals.sharedReplayLeader = data.name;

        // Update the UI
        sharedReplayLeaderLabel.show();
        let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
        if (!this.spectators.includes(globals.sharedReplayLeader)) {
            // Check to see if the leader is away
            content += ' (away)';
        }
        $('#tooltip-leader').tooltipster('instance').content(content);

        sharedReplayLeaderLabelPulse.play();

        toggleSharedTurnButton.show();
        UILayer.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(data) {
        globals.sharedReplayTurn = data.turn;
        this.adjustReplayShuttle();
        if (ui.useSharedTurns) {
            this.performReplay(globals.sharedReplayTurn);
        } else {
            replayShuttleShared.getLayer().batchDraw();
        }
    };

    this.handleReplayIndicator = (data) => {
        // Ensure that the card exists as a sanity-check
        const indicated = globals.deck[data.order];
        if (indicated) {
            // Either show or hide the arrow (if it is already visible)
            const visible = !(
                indicated.indicatorArrow.visible()
                && indicated.indicatorArrow.getFill() === INDICATOR.REPLAY_LEADER
            );
            // (if the arrow is showing but is a different kind of arrow,
            // then just overwrite the existing arrow)
            showClueMatch(-1);
            indicated.setIndicator(visible, INDICATOR.REPLAY_LEADER);
        }
    };

    this.stopAction = () => {
        clueArea.hide();

        noClueLabel.hide();
        noClueBox.hide();
        noDiscardLabel.hide();
        noDoubleDiscardLabel.hide();

        showClueMatch(-1);
        clueTargetButtonGroup.off('change');
        clueButtonGroup.off('change');

        // Make all of the cards in our hand not draggable
        // (but we need to keep them draggable if the pre-play setting is enabled)
        if (!lobby.settings.speedrunPreplay) {
            for (let i = 0; i < playerHands[globals.playerUs].children.length; i++) {
                const child = playerHands[globals.playerUs].children[i];
                child.off('dragend.play');
                child.setDraggable(false);
            }
        }

        drawDeck.cardback.setDraggable(false);
        deckPlayAvailableLabel.setVisible(false);

        // This is necessary to prevent multiple messages being sent from one click of the
        // "Submit Clue" button
        submitClue.off('click tap');
    };

    this.endTurn = function endTurn(action) {
        if (ui.ourTurn) {
            ui.sendMsg(action);
            ui.stopAction();
            savedAction = null;
        } else {
            ui.queuedAction = action;
        }
    };

    let savedAction = null;

    this.handleAction = function handleAction(data) {
        savedAction = data;

        if (globals.inReplay) {
            return;
        }

        if (data.canClue) {
            // Show the clue UI
            clueArea.show();
        } else {
            noClueLabel.show();
            noClueBox.show();
            if (!this.animateFast) {
                UILayer.draw();
            }
        }

        // We have to redraw the UI layer to avoid a bug with the clue UI
        UILayer.draw();

        if (globals.playerNames.length === 2) {
            // Default the clue recipient button to the only other player available
            clueTargetButtonGroup.list[0].setPressed(true);
        }

        playerHands[globals.playerUs].moveToTop();

        // Set our hand to being draggable
        // (this is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable)
        if (!lobby.settings.speedrunPreplay) {
            for (let i = 0; i < playerHands[globals.playerUs].children.length; i++) {
                const child = playerHands[globals.playerUs].children[i];
                child.setDraggable(true);
                child.on('dragend.play', dragendPlay);
            }
        }

        if (globals.deckPlays) {
            drawDeck.cardback.setDraggable(data.canBlindPlayDeck);
            deckPlayAvailableLabel.setVisible(data.canBlindPlayDeck);

            // Ensure the deck is above other cards and UI elements
            if (data.canBlindPlayDeck) {
                drawDeck.moveToTop();
            }
        }

        const checkClueLegal = () => {
            const target = clueTargetButtonGroup.getPressed();
            const clueButton = clueButtonGroup.getPressed();

            if (!target || !clueButton) {
                submitClue.setEnabled(false);
                return;
            }

            const who = target.targetIndex;
            const match = showClueMatch(who, clueButton.clue);

            if (!match && !globals.emptyClues) {
                // Disable the "Submit Clue" button if the given clue will touch no cards
                // (but allow all clues if they have the optional setting for "Empty Clues"
                // turned on)
                submitClue.setEnabled(false);
                return;
            }

            submitClue.setEnabled(true);
        };

        clueTargetButtonGroup.on('change', checkClueLegal);
        clueButtonGroup.on('change', checkClueLegal);

        submitClue.on('click tap', function submitClueClick() {
            if (!data.canClue) {
                return;
            }

            if (!this.getEnabled()) {
                return;
            }

            // Prevent the user from accidentally giving a clue in certain situations
            if (Date.now() - ui.accidentalClueTimer < 1000) {
                return;
            }

            const target = clueTargetButtonGroup.getPressed();
            if (!target) {
                return;
            }
            const clueButton = clueButtonGroup.getPressed();
            if (!clueButton) {
                return;
            }

            showClueMatch(target.targetIndex, {});

            const action = {
                type: 'action',
                data: {
                    type: ACT.CLUE,
                    target: target.targetIndex,
                    clue: clueToMsgClue(clueButton.clue, globals.variant),
                },
            };
            ui.endTurn(action);
        });
    };

    const dragendPlay = function dragendPlay() {
        const pos = this.getAbsolutePosition();

        pos.x += this.getWidth() * this.getScaleX() / 2;
        pos.y += this.getHeight() * this.getScaleY() / 2;

        // Figure out if it currently our turn
        if (overPlayArea(pos)) {
            const action = {
                type: 'action',
                data: {
                    type: ACT.PLAY,
                    target: this.children[0].order,
                },
            };
            ui.endTurn(action);
            if (ui.ourTurn) {
                this.setDraggable(false);
            }
        } else if (
            pos.x >= discardArea.getX()
            && pos.y >= discardArea.getY()
            && pos.x <= discardArea.getX() + discardArea.getWidth()
            && pos.y <= discardArea.getY() + discardArea.getHeight()
            && ui.currentClues !== 8
        ) {
            const action = {
                type: 'action',
                data: {
                    type: ACT.DISCARD,
                    target: this.children[0].order,
                },
            };
            ui.endTurn(action);
            if (ui.ourTurn) {
                this.setDraggable(false);
            }
        } else {
            playerHands[globals.playerUs].doLayout();
        }
    };

    this.setMessage = (msg) => {
        msgLogGroup.addMessage(msg.text);

        messagePrompt.setMultiText(msg.text);
        if (!this.animateFast) {
            UILayer.draw();
            overLayer.draw();
        }
    };

    this.destroy = function destroy() {
        stage.destroy();
        window.removeEventListener('resize', resizeCanvas, false);
        $(document).unbind('keydown', this.keyNavigation);
        this.stopLocalTimer();
    };
}

/*
    End of Hanabi UI
*/

HanabiUI.prototype.handleMessage = function handleMessage(msgType, msgData) {
    const msg = {};
    msg.type = msgType;
    msg.data = msgData;

    if (msgType === 'init') {
        // Game settings
        globals.playerNames = msgData.names;
        globals.variant = constants.VARIANTS[msgData.variant];
        globals.playerUs = msgData.seat;
        globals.spectating = msgData.spectating;
        globals.replay = msgData.replay;
        globals.sharedReplay = msgData.sharedReplay;

        // Optional settings
        globals.timed = msgData.timed;
        globals.deckPlays = msgData.deckPlays;
        globals.emptyClues = msgData.emptyClues;
        globals.characterAssignments = msgData.characterAssignments;
        globals.characterMetadata = msgData.characterMetadata;

        // Also set some extra variables
        globals.inReplay = msgData.replay;
        if (globals.inReplay) {
            globals.replayTurn = -1;
        }

        this.loadImages();
    } else if (msgType === 'advanced') {
        this.replayAdvanced();
    } else if (msgType === 'connected') {
        this.showConnected(msgData.list);
    } else if (msgType === 'notify') {
        this.saveReplay(msg);

        if (!globals.inReplay || msgData.type === 'reveal' || msgData.type === 'boot') {
            this.handleNotify(msgData);
        }
    } else if (msgType === 'action') {
        this.lastAction = msgData;
        this.handleAction.call(this, msgData);

        if (this.animateFast) {
            return;
        }

        if (this.lobby.settings.sendTurnNotify) {
            this.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        this.lastSpectators = msgData;
        // This is used to update the names of the people currently spectating the game
        this.handleSpectators.call(this, msgData);
    } else if (msgType === 'clock') {
        if (msgData.active === -1) {
            msgData.active = null;
        }

        // This is used for timed games
        this.stopLocalTimer();
        this.playerTimes = msgData.times;
        this.activeClockIndex = msgData.active;
        this.handleClock.call(this, msgData.active);
    } else if (msgType === 'note') {
        // This is used for spectators
        this.handleNote.call(this, msgData);
    } else if (msgType === 'notes') {
        // This is a list of all of your notes, sent upon reconnecting to a game
        this.handleNotes.call(this, msgData);
    } else if (msgType === 'replayLeader') {
        // This is used in shared replays
        this.handleReplayLeader.call(this, msgData);
    } else if (msgType === 'replayTurn') {
        // This is used in shared replays
        this.handleReplayTurn.call(this, msgData);
    } else if (msgType === 'replayIndicator') {
        // This is used in shared replays
        if (globals.sharedReplayLeader === this.lobby.username) {
            // We don't have to draw any arrows;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        this.handleReplayIndicator.call(this, msgData);
    } else if (msgType === 'replayMorph') {
        // This is used in shared replays to make hypothetical game states
        if (globals.sharedReplayLeader === this.lobby.username) {
            // We don't have to reveal anything;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        const revealMsg = {
            type: 'reveal',
            which: {
                order: msgData.order,
                rank: msgData.rank,
                suit: msgData.suit,
            },
        };
        this.handleNotify(revealMsg);
    } else if (msgType === 'replaySound') {
        // This is used in shared replays to make fun sounds
        if (globals.sharedReplayLeader === this.lobby.username) {
            // We don't have to play anything;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        this.game.sounds.play(msgData.sound);
    }
};

HanabiUI.prototype.setBackend = function setBackend(backend) {
    this.backend = backend;

    this.sendMsg({
        type: 'hello',
        data: {},
    });
};

HanabiUI.prototype.sendMsg = function sendMsg(msg) {
    const { type } = msg;
    let { data } = msg;
    if (typeof data === 'undefined') {
        data = {};
    }

    if (globals.debug) {
        console.log(`%cSent (UI) ${type}:`, 'color: green;');
        console.log(data);
    }
    this.backend.emit(type, data);
};

function stripHTMLtags(input) {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || '';
}

const TimerDisplay = function TimerDisplay(config) {
    Kinetic.Group.call(this, config);

    const rectangle = new Kinetic.Rect({
        x: 0,
        y: 0,
        width: config.width,
        height: config.height,
        fill: 'black',
        cornerRadius: config.cornerRadius,
        opacity: 0.2,
        listening: false,
    });
    this.add(rectangle);

    const label = new Kinetic.Text({
        x: 0,
        y: 6 * config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.labelFontSize || config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: config.label,
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(label);

    const text = new Kinetic.Text({
        x: 0,
        y: config.spaceH,
        width: config.width,
        height: config.height,
        fontSize: config.fontSize,
        fontFamily: 'Verdana',
        align: 'center',
        text: '??:??',
        fill: '#d8d5ef',
        shadowColor: 'black',
        shadowBlur: 10,
        shadowOffset: {
            x: 0,
            y: 0,
        },
        shadowOpacity: 0.9,
        listening: false,
    });
    this.add(text);

    this.setText = s => text.setText(s);
};
Kinetic.Util.extend(TimerDisplay, Kinetic.Group);

module.exports = HanabiUI;
