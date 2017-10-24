function HanabiUI(lobby, gameID) {
    this.showDebugMessages = true;

    this.lobby = lobby;
    this.gameID = gameID;

    const ui = this;

    const {
        ACT,
        CLUE_TYPE,
        COLOR,
        SUIT,
        CARD_AREA,
        CARDH,
        CARDW,
        PATHFUNC,
        backpath,
        drawshape,
        INDICATOR,
    } = constants;

    this.deck = [];

    this.playerUs = -1;
    this.playerNames = [];
    this.variant = 0;
    this.replay = false;
    this.sharedReplay = false;
    this.sharedReplayLeader = ''; // Equal to the username of the shared replay leader
    this.sharedReplayTurn = -1;
    this.applyReplayActions = true;
    this.replayOnly = false;
    this.spectating = false;
    this.replayMax = 0;
    this.animateFast = true;
    this.ready = false;
    // In replays, we can show information about a card that was not
    // known at the time, but is known now; these are cards we have "learned"
    this.learnedCards = [];

    this.activeHover = null;

    // A function called after an action from the server moves cards
    this.postAnimationLayout = null;

    this.timedGame = false;
    this.lastTimerUpdateTimeMS = new Date().getTime();

    this.playerTimes = [];
    this.timerID = null;

    // Stored variables for rebuilding the game state
    this.lastAction = null;
    this.activeClockIndex = null;
    this.lastSpectators = null;

    // This below code block deals with automatic resizing
    // Start listening to resize events and draw canvas.
    window.addEventListener('resize', resizeCanvas, false);

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
        self.buildUI();
        self.buildCards();

        self.reset();

        // This shit resets all the msgs so that everything shows up again,
        // since the server doesn't replay them and the client only draws streamed
        // information and doesn't maintain a full game state.

        // Rebuilds for a replay.
        if (self.replayOnly) {
            let msg;
            // Iterate over the replay, stop at the current turn or at the end
            self.replayPos = 0;
            while (true) { // eslint-disable-line no-constant-condition
                msg = self.replayLog[self.replayPos];
                self.replayPos += 1;

                // Stop at end of replay
                if (!msg) {
                    break;
                }

                // Rebuild all messages and notifies - this will correctly position cards and text
                if (msg.type === 'message') {
                    self.setMessage(msg.resp);
                } else if (msg.type === 'notify') {
                    self.handleNotify(msg.resp);
                }

                // Stop if you're at the current turn
                if (msg.type === 'notify' && msg.resp.type === 'turn') {
                    if (msg.resp.num === self.replayTurn) {
                        break;
                    }
                }
            }
        // Rebuilds for a game
        } else {
            let msg;
            let whoseTurn = 0;

            // Iterate over all moves to date.
            for (let i = 0; i < self.replayLog.length; i++) {
                msg = self.replayLog[i];

                // Rebuild all messages and notifies - this will correctly position cards and text
                if (msg.type === 'message') {
                    self.setMessage(msg.resp);
                } else if (msg.type === 'notify') {
                    self.handleNotify(msg.resp);
                    // Correctly record and handle whose turn it is
                    if (msg.resp.type === 'turn') {
                        whoseTurn = msg.resp.who;
                    }
                }
            }
            // If it's your turn, setup the clue area
            if (whoseTurn === self.playerUs && !self.spectating) {
                self.handleAction.call(self, self.lastAction);
            }
            // Setup the timers
            self.handleClock.call(self, self.activeClockIndex);
        }

        // Restore Drag and Drop Functionality
        self.animateFast = false;

        // Restore Replay Button if applicable
        if (!self.replayOnly && self.replayMax > 0) { replayButton.show(); }

        // Restore Shared Replay Button if applicable
        if (self.sharedReplay) {
            self.handleReplayLeader({
                name: self.sharedReplayLeader,
            });
        }

        // Restore Spectator Icon if applicable
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
        tipLayer.draw();
        overLayer.draw();
    }

    // Runs each time the DOM window resize event fires.
    // Resets the canvas dimensions to match window,
    // then draws the new borders accordingly.
    function resizeCanvas() {
        $('canvas').each((index, canvas) => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            $(canvas).css('width', window.innerWidth);
            $(canvas).css('height', window.innerHeight);
        });
        redraw();
    }
    // End Block

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

    function setTickingDownTime(textObjects, activeIndex) {
        // Compute elapsed time since last timer update
        const now = new Date().getTime();
        const timeElapsed = now - ui.lastTimerUpdateTimeMS;
        ui.lastTimerUpdateTimeMS = now;
        if (timeElapsed < 0) {
            return;
        }

        // Update the time in local array to approximate server times
        ui.playerTimes[activeIndex] -= timeElapsed;
        if (ui.timedGame && ui.playerTimes[activeIndex] < 0) {
            // Don't let the timer go into negative values, or else it will mess up the display
            // (but in non-timed games, we want this to happen)
            ui.playerTimes[activeIndex] = 0;
        }

        let millisecondsLeft = ui.playerTimes[activeIndex];
        if (!ui.timedGame) {
            // Invert it to show how much time each player is taking
            millisecondsLeft *= -1;
        }
        const displayString = millisecondsToTimeDisplay(millisecondsLeft);

        // Update displays
        textObjects.forEach((textHolder) => {
            textHolder.setText(displayString);
            textHolder.getLayer().batchDraw();
        });

        // Play a sound to indicate that the current player is almost out of time
        // Do not play it more frequently than about once per second
        if (
            ui.timedGame &&
            lobby.sendTimerSound &&
            millisecondsLeft > 0 &&
            millisecondsLeft <= 5000 &&
            timeElapsed > 900 &&
            timeElapsed < 1100
        ) {
            lobby.playSound('tone');
        }
    }

    function imageName(card) {
        let prefix = 'Card';

        const learnedCard = ui.learnedCards[card.order];
        const showLearnedCards = true;

        const rank =
            (showLearnedCards && learnedCard.rank) ||
            (card.rankKnown() && card.trueRank);

        const suit =
            (showLearnedCards && learnedCard.suit) ||
            (card.suitKnown() && card.trueSuit);

        // Do not select an image with pips while the dynamic suit pips are shown
        if (
            !card.suitKnown()
        ) {
            if (!card.rankKnown() && rank) {
                prefix = 'Index';
            } else {
                prefix = 'NoPip';
            }
        }

        return `${prefix}-${(suit || SUIT.GRAY).name}-${rank || 6}`;
    }

    const scaleCardImage = function scaleCardImage(context, name) {
        const width = this.getWidth();
        const height = this.getHeight();
        const am = this.getAbsoluteTransform();
        let src = cardImages[name];

        if (!src) {
            console.error(`The image '${name}' was not generated.`);
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

        while (this._getTextSize(this.getText()).width > this.getWidth() && this.getFontSize() > 5) {
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
        for (let i = 0; i < this.maxLines; ++i) {
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
        // Performance optimization: setText on the children is slow, so don't
        // actually do it until its time to display things.
        // We also have to call refreshText after any time we manipulate replay
        // position
        if (!ui.replay || !ui.animateFast) {
            this.refreshText();
        }
    };

    MultiFitText.prototype.refreshText = function refreshText() {
        for (let i = 0; i < this.children.length; ++i) {
            let msg = this.smallHistory[i];
            if (!msg) {
                msg = '';
            }
            this.children[i].setText(msg);
        }
    };

    MultiFitText.prototype.reset = function reset() {
        this.smallHistory = [];
        for (let i = 0; i < this.children.length; ++i) {
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
        for (let i = 0; i < ui.playerNames.length; i++) {
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
            numbers.setMultiText(drawDeck.getCount());
        };

        appendLine(this.logtext, this.lognumbers, msg);
        for (let i = 0; i < ui.playerNames.length; i++) {
            if (msg.startsWith(ui.playerNames[i])) {
                appendLine(this.playerLogs[i], this.playerLogNumbers[i], msg);
                break;
            }
        }
    };

    HanabiMsgLog.prototype.showPlayerActions = function showPlayerActions(playerName) {
        let playerIDX;
        for (let i = 0; i < ui.playerNames.length; i++) {
            if (ui.playerNames[i] === playerName) {
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
        for (let i = 0; i < ui.playerNames.length; i++) {
            this.playerLogs[i].refreshText();
            this.playerLogNumbers[i].refreshText();
        }
    };

    HanabiMsgLog.prototype.reset = function reset() {
        this.logtext.reset();
        this.lognumbers.reset();
        for (let i = 0; i < ui.playerNames.length; i++) {
            this.playerLogs[i].reset();
            this.playerLogNumbers[i].reset();
        }
    };

    const HanabiCard = function HanabiCard(config) {
        const self = this;

        this.holder = config.holder;
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
        });
        this.suitPips = new Kinetic.Group({
            x: 0,
            y: 0,
            width: Math.floor(CARDW),
            height: Math.floor(CARDH),
        });
        this.add(this.rankPips);
        this.add(this.suitPips);
        if (!this.rankKnown()) {
            for (let i = 1; i <= 5; i++) {
                const rankPip = new Kinetic.Rect({
                    x: Math.floor(CARDW * (i * 0.19 - 0.14)),
                    y: 0,
                    width: Math.floor(CARDW * 0.15),
                    height: Math.floor(CARDH * 0.10),
                    fill: 'black',
                    stroke: 'black',
                    name: i.toString(),
                });
                if (!ui.learnedCards[this.order].possibleRanks.includes(i)) {
                    rankPip.setOpacity(0.3);
                }
                this.rankPips.add(rankPip);
            }
        }
        if (!this.suitKnown()) {
            const nSuits = this.possibleSuits.length;
            let i = 0;
            for (const suit of this.possibleSuits) {
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
                    // I don't know why it's needed... perhaps something to do with the pathfuncs
                    offset: {
                        x: Math.floor(CARDW * 0.7 * Math.cos((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.25),
                        y: Math.floor(CARDW * 0.7 * Math.sin((-i / nSuits + 0.25) * Math.PI * 2) + CARDW * 0.3),
                    },
                    fill: (suit === SUIT.MULTI ? undefined : suit.fillColors.hexCode),
                    stroke: 'black',
                    name: suit.name,
                    drawFunc: (ctx) => {
                        PATHFUNC.get(suit.shape)(ctx);
                        ctx.closePath();
                        ctx.fillStrokeShape(suitPip);
                    },
                });
                // Gradient numbers are magic
                if (suit === SUIT.MULTI) {
                    suitPip.fillRadialGradientColorStops([0.3, 'blue', 0.425, 'green', 0.65, 'yellow', 0.875, 'red', 1, 'purple']);
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
                i += 1;
            }
        }

        if (this.identityKnown()) {
            ui.learnedCards[this.order].suit = this.trueSuit;
            ui.learnedCards[this.order].possibleSuits = [this.trueSuit];
            ui.learnedCards[this.order].rank = this.trueRank;
            ui.learnedCards[this.order].possibleRanks = [this.trueRank];
        }

        this.barename = '';

        this.setBareImage();

        this.cluedBorder = new Kinetic.Rect({
            x: 5,
            y: 5,
            width: config.width - 10,
            height: config.height - 10,
            cornerRadius: 6,
            strokeWidth: 12,
            stroke: '#ffdf00',
            visible: false,
            listening: false,
        });

        this.add(this.cluedBorder);

        this.indicatorArrow = new Kinetic.Text({
            x: ((this.holder === ui.playerUs) ? 0.7 : 0.3) * config.width,
            y: ((this.holder === ui.playerUs) ? 0.18 : 0.82) * config.height,
            width: 0.4 * config.width,
            height: 0.5 * config.height,
            fontSize: 0.2 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: '⬆',
            rotation: (this.holder === ui.playerUs) ? 180 : 0,
            fill: '#ffffff',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
            visible: false,
        });

        this.add(this.indicatorArrow);

        // Define the "note indicator" square
        this.noteGiven = new Kinetic.Rect({
            x: 0.854 * config.width,
            y: (ui.variant.offsetCardIndicators ? 0.16 : 0.065) * config.height,
            width: 0.09 * config.width,
            height: 0.09 * config.width,
            fill: 'white',
            stroke: 'black',
            strokeWidth: 4,
            visible: false,
        });

        this.add(this.noteGiven);

        // Add a slight pulse to the note marker to demonstrate that it has new info
        this.notePulse = new Kinetic.Tween({
            node: this.noteGiven,
            scaleX: 1.1,
            scaleY: 1.1,
            duration: 0.5,
            easing: Kinetic.Easings.BounceEaseIn,
            onFinish: () => {
                this.notePulse.reset();
                this.notePulse.play();
            },
        });

        this.notePulse.anim.addLayer(cardLayer);

        // Create the note tooltip
        this.tooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });
        // An elusive bug permanently draws a copy of the tag at this location.
        // We work around it by setting the starting location to be offscreen.

        this.tooltip.add(new Kinetic.Tag({
            fill: '#3E4345',
            pointerDirection: 'left',
            pointerWidth: 0.02 * winW,
            pointerHeight: 0.015 * winH,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 3,
                y: 3,
            },
            shadowOpacity: 0.6,
        }));

        /*
            Hyphen originally programmed this with "FitText" instead of
            "Kinetic.Text", so that the tooltips would remain the same size;
            however, this leads to really small text on long notes. It is much
            better to just let the tooltip grow bigger for bigger notes.
        */
        this.tooltip.add(new Kinetic.Text({
            fill: 'white',
            align: 'left',
            padding: 0.01 * winH,
            fontSize: 0.04 * winH,
            minFontSize: 0.02 * winH,
            width: 0.3 * winW,
            // This needs to be fairly wide so that it doesn't wrap for spectators
            // (spectators will have the player name as a prefix for the note)
            fontFamily: 'Verdana',
            text: '',
        }));

        tipLayer.add(this.tooltip);

        this.on('mousemove', () => {
            if (self.noteGiven.visible()) {
                const mousePos = stage.getPointerPosition();
                self.tooltip.setX(mousePos.x + 15);
                self.tooltip.setY(mousePos.y + 5);

                self.tooltip.show();

                self.notePulse.reset();

                tipLayer.draw();
            }
            ui.activeHover = this;
        });

        this.on('mouseout', () => {
            self.tooltip.hide();
            tipLayer.draw();
        });

        this.reset();
    };

    Kinetic.Util.extend(HanabiCard, Kinetic.Group);

    HanabiCard.prototype.reset = function reset() {
        this.hideClues();
        const note = ui.getNote(this.order);
        if (note !== null) {
            this.tooltip.getText().setText(note);
            this.tooltip.getTag().setWidth();
            this.noteGiven.show();
        }
        this.addListeners();
    };

    HanabiCard.prototype.addListeners = function addListeners() {
        const self = this;

        this.on('mousemove tap', () => {
            clueLog.showMatches(self);
            UILayer.draw();
        });

        this.on('mouseout', () => {
            clueLog.showMatches(null);
            UILayer.draw();
        });

        this.on('click', (event) => {
            if (ui.sharedReplay && event.evt.which === 1 && ui.sharedReplayLeader === lobby.username) {
                // In a replay that is shared, the leader left-clicks a card to draw attention to it

                if (ui.applyReplayActions) {
                    ui.sendMsg({
                        type: 'replayAction',
                        resp: {
                            type: 1,
                            value: self.order,
                        },
                    });

                    // Draw the indicator for the user
                    ui.handleReplayIndicator({
                        order: self.order,
                    });
                }

                return;
            }

            if (event.evt.which !== 3) { // Right click
                // We only care about right clicks
                return;
            }

            let note = ui.getNote(self.order);
            if (note === null) {
                note = '';
            }
            const newNote = window.prompt('Note on card:', note);
            if (newNote === null) {
                // The user clicked the "cancel" button, so do nothing else
                return;
            }

            // The user clicked "OK", regardless of whether they changed the existing note or not
            self.tooltip.getText().setText(newNote);
            ui.setNote(self.order, newNote);
            note = newNote;

            if (note.length > 0) {
                self.noteGiven.show();
                if (self.spectating) {
                    self.notePulse.play();
                }
            } else {
                self.noteGiven.hide();
                self.tooltip.hide();
                tipLayer.draw();
            }
            UILayer.draw();
            cardLayer.draw();

            // Also send the note to the server
            if (!ui.replayOnly) {
                // Update the spectators about the new note
                ui.sendMsg({
                    type: 'note',
                    resp: {
                        order: self.order,
                        note,
                    },
                });
            }
        });
    };

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
        if (clue.type === CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            const removed = filterInPlace(this.possibleSuits, suit => suit.clueColors.includes(clueColor) === positive);
            removed.forEach(suit => this.suitPips.find(`.${suit.name}`).hide());
            if (this.possibleSuits.length === 1) {
                [this.trueSuit] = this.possibleSuits;
                this.suitPips.hide();
                ui.learnedCards[this.order].suit = this.trueSuit;
            }
            // Ensure that the learned card data is not overwritten with less recent information
            filterInPlace(ui.learnedCards[this.order].possibleSuits, s => this.possibleSuits.includes(s));
        } else {
            const clueRank = clue.value;
            const removed = filterInPlace(this.possibleRanks, rank => (rank === clueRank) === positive);
            removed.forEach(rank => this.rankPips.find(`.${rank}`).hide());
            if (this.possibleRanks.length === 1) {
                [this.trueRank] = this.possibleRanks;
                this.rankPips.hide();
                ui.learnedCards[this.order].rank = this.trueRank;
            }
            // Ensure that the learned card data is not overwritten with less recent information
            filterInPlace(ui.learnedCards[this.order].possibleRanks, s => this.possibleRanks.includes(s));
        }
    };

    HanabiCard.prototype.hideClues = function hideClues() {
        this.cluedBorder.hide();
        this.noteGiven.hide();
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
    };

    Kinetic.Util.extend(CardLayout, Kinetic.Group);

    CardLayout.prototype.add = function add(child) {
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

    CardDeck.prototype.getCount = function getCount() {
        return this.count.getText();
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
            visible: lobby.showColorblindUI,
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
        const self = this;

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

        background.on('mousemove tap', () => {
            clueLog.showMatches(null);

            background.setOpacity(0.4);
            background.getLayer().batchDraw();

            showClueMatch(-1);

            for (let i = 0; i < self.list.length; i++) {
                if (!self.checkValid(self.list[i])) {
                    continue;
                }

                ui.deck[self.list[i]].setIndicator(true);
            }

            for (let i = 0; i < self.neglist.length; i++) {
                if (!self.checkValid(self.neglist[i])) {
                    continue;
                }

                ui.deck[self.neglist[i]].setIndicator(true, INDICATOR.NEGATIVE);
            }

            cardLayer.batchDraw();
            ui.activeHover = this;
        });

        background.on('mouseout', () => {
            background.setOpacity(0.1);
            const backgroundLayer = background.getLayer();
            if (backgroundLayer) {
                backgroundLayer.batchDraw();
            }

            showClueMatch(-1);
        });
    };

    Kinetic.Util.extend(HanabiClueEntry, Kinetic.Group);

    HanabiClueEntry.prototype.checkValid = (c) => {
        if (!ui.deck[c]) {
            return false;
        }

        if (!ui.deck[c].parent) {
            return false;
        }

        return ui.deck[c].isInPlayerHand();
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

        this.background.off('mouseover tap');
        this.background.off('mouseout');

        this.remove();
        return 1;
    };

    HanabiClueEntry.prototype.showMatch = function showMatch(target) {
        this.background.setOpacity(0.1);
        this.background.setFill('white');
        this.negativeMarker.setVisible(false);

        for (let i = 0; i < this.list.length; i++) {
            if (ui.deck[this.list[i]] === target) {
                this.background.setOpacity(0.4);
            }
        }

        for (let i = 0; i < this.neglist.length; i++) {
            if (ui.deck[this.neglist[i]] === target) {
                this.background.setOpacity(0.4);
                this.background.setFill('#ff7777');
                if (lobby.showColorblindUI) {
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
        this.name.on('click tap', () => {
            msgLogGroup.showPlayerActions(nameTextObject.getText());
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
            'button',
            'button_pressed',
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
            resp: {},
        });
        ui.ready = true;
    });

    this.loadImages = () => {
        ImageLoader.start();
    };

    const showClueMatch = (target, clue, showNeg) => {
        let match = false;
        for (let i = 0; i < ui.playerNames.length; i++) {
            if (i === target) {
                continue;
            }

            for (let j = 0; j < playerHands[i].children.length; j++) {
                const child = playerHands[i].children[j];
                const card = child.children[0];
                card.setIndicator(false);
            }
        }

        cardLayer.batchDraw();

        if (target < 0) {
            return match;
        }

        for (let i = 0; i < playerHands[target].children.length; i++) {
            const child = playerHands[target].children[i];
            const card = child.children[0];

            let touched = false;
            if (clue.type === CLUE_TYPE.RANK) {
                if (clue.value === card.trueRank) {
                    touched = true;
                }
            } else if (clue.type === CLUE_TYPE.COLOR) {
                const clueColor = clue.value;
                if (card.trueSuit === SUIT.MULTI || card.trueSuit.clueColors.includes(clueColor)) {
                    touched = true;
                }
            }

            if (touched) {
                match = true;
                card.setIndicator(true);
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
        ctx.strokeStyle = (ctx.fillStyle === COLOR.WHITE.hexCode) ? COLOR.BLACK.hex_code : suit.style(ctx, CARD_AREA.BACKGROUND);

        backpath(ctx, 4, xrad, yrad);

        ctx.save();
        // Draw the borders (on visible cards) and the color fill
        ctx.globalAlpha = 0.3;
        ctx.fill();
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 8;
        // The borders should be more opaque for the stack base.
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
        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top right-hand corner
        ctx.lineTo(CARDW - borderSize - triangleSize, borderSize); // Move left
        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move down and right diagonally
        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor1.hexCode;
        drawshape(ctx);

        // Draw the second half of the top-right triangle
        ctx.beginPath();
        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top right-hand corner
        ctx.lineTo(CARDW - borderSize, borderSize + triangleSize); // Move down
        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move up and left diagonally
        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor2.hexCode;
        drawshape(ctx);

        // Draw the first half of the bottom-left triangle
        ctx.beginPath();
        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
        ctx.lineTo(borderSize, CARDH - borderSize - triangleSize); // Move up
        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2)); // Move right and down diagonally
        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor1.hexCode;
        drawshape(ctx);

        // Draw the second half of the bottom-left triangle
        ctx.beginPath();
        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
        ctx.lineTo(borderSize + triangleSize, CARDH - borderSize); // Move right
        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2)); // Move left and up diagonally
        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
        ctx.fillStyle = clueColor2.hexCode;
        drawshape(ctx);

        ctx.restore();
    };

    const drawSuitPips = function drawSuitPips(ctx, rank, shape) {
        const pathfunc = PATHFUNC.get(shape);
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
            const symbolYPos = lobby.showColorblindUI ? 85 : 120;
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
            ctx.globalAlpha = lobby.showColorblindUI ? 0.4 : 0.1;
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
        const cvs = document.createElement('canvas');
        cvs.width = CARDW;
        cvs.height = CARDH;

        // Deck back image
        const ctx = cvs.getContext('2d');
        const imageObj = new Image();

        imageObj.onload = function loadImg() {
            ctx.drawImage(imageObj, -30, -10);
        };
        imageObj.src = 'public/img/fireworks.jpg';
        ctx.save();

        return cvs;
    };

    this.buildCards = function buildCards() {
        // The Gray suit represents cards of unknown suit
        const suits = this.variant.suits.concat(SUIT.GRAY);
        for (const suit of suits) {
            // 0 is the stack base. 1-5 are the cards. 6 is a card of unknown rank.
            for (let rank = 0; rank <= 6; rank++) {
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

                if (rank > 0 && rank < 6) {
                    let textYPos;
                    let indexLabel;
                    let fontSize;
                    if (lobby.showColorblindUI) {
                        fontSize = 68;
                        textYPos = 83;
                        indexLabel = suit.abbreviation + rank.toString();
                    } else {
                        fontSize = 96;
                        textYPos = 110;
                        indexLabel = rank.toString();
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
                if (suit.clueColors.length === 2) {
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
                    drawSuitPips(ctx, rank, suit.shape);
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
    const tipLayer = new Kinetic.Layer({
        listening: false,
    });
    const timerLayer = new Kinetic.Layer({
        listening: false,
    });
    const playerHands = [];
    let drawDeck;
    let messagePrompt;
    let clueLabel;
    let scoreLabel;
    let spectatorsLabel;
    let spectatorsNumLabel;
    let spectatorsLabelTooltip;
    let sharedReplayLeaderLabel;
    let sharedReplayLeaderLabelTooltip;
    let strikes = [];
    const nameFrames = [];
    const playStacks = new Map();
    const discardStacks = new Map();
    let playArea;
    let discardArea;
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
    let deckPlayAvailableLabel;
    let replayArea;
    let replayBar;
    let replayShuttleShared;
    let replayShuttle;
    let replayButton;
    let toggleSharedTurnButton; // Used in shared replays
    let lobbyButton;
    let helpButton;
    let helpGroup;
    let msgLogGroup;
    let overback;
    let notesWritten = []; // An array containing all of the player's notes, indexed by card order

    const overPlayArea = pos => (
        pos.x >= playArea.getX() &&
        pos.y >= playArea.getY() &&
        pos.x <= playArea.getX() + playArea.getWidth() &&
        pos.y <= playArea.getY() + playArea.getHeight()
    );

    function nameFramesMouseMove() {
        const mousePos = stage.getPointerPosition();
        this.tooltip.setX(mousePos.x + 15);
        this.tooltip.setY(mousePos.y + 5);

        this.tooltip.show();
        tipLayer.draw();

        ui.activeHover = this;
    }

    function nameFramesMouseOut() {
        this.tooltip.hide();
        tipLayer.draw();
    }

    const shareCurrentTurn = (target) => {
        if (ui.sharedReplayTurn !== target) {
            ui.sendMsg({
                type: 'replayAction',
                resp: {
                    type: 0, // Type 0 is a new replay turn
                    value: target,
                },
            });
            ui.sharedReplayTurn = target;
            ui.adjustReplayShuttle();
        }
    };

    this.buildUI = function buildUI() {
        const self = this;
        let x;
        let y;
        let width;
        let height;
        let offset;
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

        playArea = new Kinetic.Rect({
            x: 0.183 * winW,
            y: 0.3 * winH,
            width: 0.435 * winW,
            height: 0.189 * winH,
        });

        discardArea = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.2 * winW,
            height: 0.4 * winH,
        });

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

        const img = new Kinetic.Image({
            x: 0.82 * winW,
            y: 0.62 * winH,
            width: 0.15 * winW,
            height: 0.35 * winH,
            opacity: 0.2,
            image: ImageLoader.get('trashcan'),
        });

        bgLayer.add(img);

        rect = new Kinetic.Rect({
            x: 0.2 * winW,
            y: 0.235 * winH,
            width: 0.4 * winW,
            height: 0.098 * winH,
            fill: 'black',
            opacity: 0.3,
            cornerRadius: 0.01 * winH,
            listening: true,
        });

        bgLayer.add(rect);

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
            x: 0.21 * winW,
            y: 0.238 * winH,
            width: 0.38 * winW,
            height: 0.095 * winH,
            maxLines: 3,
        });

        UILayer.add(messagePrompt);

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

        msgLogGroup = new HanabiMsgLog();

        overLayer.add(msgLogGroup);

        rect = new Kinetic.Rect({
            x: 0.66 * winW,
            y: 0.81 * winH,
            width: 0.13 * winW,
            height: 0.18 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });

        bgLayer.add(rect);

        for (let i = 0; i < 3; i++) {
            rect = new Kinetic.Rect({
                x: (0.67 + 0.04 * i) * winW,
                y: 0.91 * winH,
                width: 0.03 * winW,
                height: 0.053 * winH,
                fill: 'black',
                opacity: 0.6,
                cornerRadius: 0.003 * winW,
            });

            bgLayer.add(rect);
        }

        clueLabel = new Kinetic.Text({
            x: 0.67 * winW,
            y: 0.83 * winH,
            width: 0.11 * winW,
            height: 0.03 * winH,
            fontSize: 0.03 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: 'Clues: 8',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });

        UILayer.add(clueLabel);

        scoreLabel = new Kinetic.Text({
            x: 0.67 * winW,
            y: 0.87 * winH,
            width: 0.11 * winW,
            height: 0.03 * winH,
            fontSize: 0.03 * winH,
            fontFamily: 'Verdana',
            align: 'center',
            text: 'Score: 0',
            fill: '#d8d5ef',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 0,
                y: 0,
            },
            shadowOpacity: 0.9,
        });

        UILayer.add(scoreLabel);

        /*
            The 'eyes' symbol to show that one or more people are spectating the game
        */

        spectatorsLabel = new Kinetic.Text({
            x: 0.623 * winW,
            y: 0.9 * winH,
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

        /*
            Tooltip for the eyes
        */

        spectatorsLabelTooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });

        spectatorsLabelTooltip.add(new Kinetic.Tag({
            fill: '#3E4345',
            pointerDirection: 'down',
            pointerWidth: 0.02 * winW,
            pointerHeight: 0.015 * winH,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 3,
                y: 3,
            },
            shadowOpacity: 0.6,
        }));

        spectatorsLabelTooltip.add(new Kinetic.Text({
            fill: 'white',
            align: 'left',
            padding: 0.01 * winH,
            fontSize: 0.025 * winH,
            minFontSize: 0.02 * winH,
            width: 0.225 * winW,
            fontFamily: 'Verdana',
            text: '',
        }));

        tipLayer.add(spectatorsLabelTooltip);
        spectatorsLabel.tooltip = spectatorsLabelTooltip;

        spectatorsLabel.on('mousemove', function spectatorsLabelMouseMove() {
            const mousePos = stage.getPointerPosition();
            this.tooltip.setX(mousePos.x);
            this.tooltip.setY(mousePos.y - 5);

            this.tooltip.show();
            tipLayer.draw();

            ui.activeHover = this;
        });

        spectatorsLabel.on('mouseout', function spectatorsLabelMouseOut() {
            this.tooltip.hide();
            tipLayer.draw();
        });

        /*
            End tooltip
        */

        spectatorsNumLabel = new Kinetic.Text({
            x: 0.583 * winW,
            y: 0.934 * winH,
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

        /*
            Shared replay leader indicator
        */

        sharedReplayLeaderLabel = new Kinetic.Text({
            x: 0.623 * winW,
            y: 0.85 * winH,
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

        /*
            Tooltip for the crown
        */

        sharedReplayLeaderLabelTooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });

        sharedReplayLeaderLabelTooltip.add(new Kinetic.Tag({
            fill: '#3E4345',
            pointerDirection: 'left',
            pointerWidth: 0.02 * winW,
            pointerHeight: 0.015 * winH,
            lineJoin: 'round',
            shadowColor: 'black',
            shadowBlur: 10,
            shadowOffset: {
                x: 3,
                y: 3,
            },
            shadowOpacity: 0.6,
        }));

        sharedReplayLeaderLabelTooltip.add(new Kinetic.Text({
            fill: 'white',
            align: 'left',
            padding: 0.01 * winH,
            fontSize: 0.04 * winH,
            minFontSize: 0.02 * winH,
            width: 0.2 * winW,
            fontFamily: 'Verdana',
            text: '',
        }));

        tipLayer.add(sharedReplayLeaderLabelTooltip);
        sharedReplayLeaderLabel.tooltip = sharedReplayLeaderLabelTooltip;

        sharedReplayLeaderLabel.on('mousemove', function sharedReplayLeaderLabelMouseMove() {
            const mousePos = stage.getPointerPosition();
            this.tooltip.setX(mousePos.x + 15);
            this.tooltip.setY(mousePos.y + 5);

            this.tooltip.show();
            tipLayer.draw();

            ui.activeHover = this;
        });

        sharedReplayLeaderLabel.on('mouseout', function sharedReplayLeaderLabelMouseOut() {
            this.tooltip.hide();
            tipLayer.draw();
        });

        /*
            End tooltip
        */

        /*
            End of spectator / shared replay stuff
        */

        rect = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.01 * winH,
            width: 0.19 * winW,
            height: 0.58 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });

        bgLayer.add(rect);

        clueLog = new HanabiClueLog({
            x: 0.81 * winW,
            y: 0.02 * winH,
            width: 0.17 * winW,
            height: 0.56 * winH,
        });

        UILayer.add(clueLog);

        let pileback;

        if (this.variant.suits.length === 6) {
            y = 0.04;
            width = 0.06;
            height = 0.151;
            offset = 0.019;
        } else { // 5 stacks
            y = 0.05;
            width = 0.075;
            height = 0.189;
            offset = 0;
        }

        // TODO: move blocks like this into their own functions
        let playAreaY = 0.345;
        if (this.variant.showSuitNames) {
            playAreaY = 0.327;
        }
        {
            let i = 0;
            for (const suit of this.variant.suits) {
                pileback = new Kinetic.Image({
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (playAreaY + offset) * winH,
                    width: width * winW,
                    height: height * winH,
                    image: cardImages[`Card-${suit.name}-0`],
                });

                bgLayer.add(pileback);

                const thisSuitPlayStack = new CardStack({
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (playAreaY + offset) * winH,
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
                if (this.variant.showSuitNames) {
                    const text = new FitText({
                        x: (0.173 + (width + 0.015) * i) * winW, //
                        y: (playAreaY + 0.155 + offset) * winH,
                        width: 0.08 * winW,
                        height: 0.051 * winH,
                        fontSize: 0.02 * winH,
                        fontFamily: 'Verdana',
                        align: 'center',
                        text: suit.name,
                        fill: '#d8d5ef',
                    });
                    textLayer.add(text);
                }

                i += 1;
            }
        }

        rect = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.006 * winW,
        });

        bgLayer.add(rect);

        drawDeck = new CardDeck({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            cardback: 'deck-back',
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

        const handPos = {
            2: [
                {
                    x: 0.19,
                    y: 0.77,
                    w: 0.42,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.19,
                    y: 0.01,
                    w: 0.42,
                    h: 0.189,
                    rot: 0,
                },
            ],
            3: [
                {
                    x: 0.19,
                    y: 0.77,
                    w: 0.42,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.01,
                    y: 0.71,
                    w: 0.41,
                    h: 0.189,
                    rot: -78,
                },
                {
                    x: 0.705,
                    y: 0,
                    w: 0.41,
                    h: 0.189,
                    rot: 78,
                },
            ],
            4: [
                {
                    x: 0.23,
                    y: 0.77,
                    w: 0.34,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.015,
                    y: 0.7,
                    w: 0.34,
                    h: 0.189,
                    rot: -78,
                },
                {
                    x: 0.23,
                    y: 0.01,
                    w: 0.34,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.715,
                    y: 0.095,
                    w: 0.34,
                    h: 0.189,
                    rot: 78,
                },
            ],
            5: [
                {
                    x: 0.23,
                    y: 0.77,
                    w: 0.34,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.03,
                    y: 0.77,
                    w: 0.301,
                    h: 0.18,
                    rot: -90,
                },
                {
                    x: 0.025,
                    y: 0.009,
                    w: 0.34,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.445,
                    y: 0.009,
                    w: 0.34,
                    h: 0.189,
                    rot: 0,
                },
                {
                    x: 0.77,
                    y: 0.22,
                    w: 0.301,
                    h: 0.18,
                    rot: 90,
                },
            ],
        };

        const shadePos = {
            2: [
                {
                    x: 0.185,
                    y: 0.762,
                    w: 0.43,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.185,
                    y: 0.002,
                    w: 0.43,
                    h: 0.205,
                    rot: 0,
                },
            ],
            3: [
                {
                    x: 0.185,
                    y: 0.762,
                    w: 0.43,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.005,
                    y: 0.718,
                    w: 0.42,
                    h: 0.205,
                    rot: -78,
                },
                {
                    x: 0.708,
                    y: -0.008,
                    w: 0.42,
                    h: 0.205,
                    rot: 78,
                },
            ],
            4: [
                {
                    x: 0.225,
                    y: 0.762,
                    w: 0.35,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.01,
                    y: 0.708,
                    w: 0.35,
                    h: 0.205,
                    rot: -78,
                },
                {
                    x: 0.225,
                    y: 0.002,
                    w: 0.35,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.718,
                    y: 0.087,
                    w: 0.35,
                    h: 0.205,
                    rot: 78,
                },
            ],
            5: [
                {
                    x: 0.225,
                    y: 0.762,
                    w: 0.35,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.026,
                    y: 0.775,
                    w: 0.311,
                    h: 0.196,
                    rot: -90,
                },
                {
                    x: 0.02,
                    y: 0.001,
                    w: 0.35,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.44,
                    y: 0.001,
                    w: 0.35,
                    h: 0.205,
                    rot: 0,
                },
                {
                    x: 0.774,
                    y: 0.215,
                    w: 0.311,
                    h: 0.196,
                    rot: 90,
                },
            ],
        };

        const namePos = {
            2: [
                {
                    x: 0.18,
                    y: 0.97,
                    w: 0.44,
                    h: 0.02,
                },
                {
                    x: 0.18,
                    y: 0.21,
                    w: 0.44,
                    h: 0.02,
                },
            ],
            3: [
                {
                    x: 0.18,
                    y: 0.97,
                    w: 0.44,
                    h: 0.02,
                },
                {
                    x: 0.01,
                    y: 0.765,
                    w: 0.12,
                    h: 0.02,
                },
                {
                    x: 0.67,
                    y: 0.765,
                    w: 0.12,
                    h: 0.02,
                },
            ],
            4: [
                {
                    x: 0.22,
                    y: 0.97,
                    w: 0.36,
                    h: 0.02,
                },
                {
                    x: 0.01,
                    y: 0.74,
                    w: 0.13,
                    h: 0.02,
                },
                {
                    x: 0.22,
                    y: 0.21,
                    w: 0.36,
                    h: 0.02,
                },
                {
                    x: 0.66,
                    y: 0.74,
                    w: 0.13,
                    h: 0.02,
                },
            ],
            5: [
                {
                    x: 0.22,
                    y: 0.97,
                    w: 0.36,
                    h: 0.02,
                },
                {
                    x: 0.025,
                    y: 0.775,
                    w: 0.116,
                    h: 0.02,
                },
                {
                    x: 0.015,
                    y: 0.199,
                    w: 0.36,
                    h: 0.02,
                },
                {
                    x: 0.435,
                    y: 0.199,
                    w: 0.36,
                    h: 0.02,
                },
                {
                    x: 0.659,
                    y: 0.775,
                    w: 0.116,
                    h: 0.02,
                },
            ],
        };

        const nump = this.playerNames.length;

        for (let i = 0; i < nump; i++) {
            let j = i - this.playerUs;

            if (j < 0) {
                j += nump;
            }

            playerHands[i] = new CardLayout({
                x: handPos[nump][j].x * winW,
                y: handPos[nump][j].y * winH,
                width: handPos[nump][j].w * winW,
                height: handPos[nump][j].h * winH,
                rotationDeg: handPos[nump][j].rot,
                align: 'center',
                reverse: j === 0,
            });

            cardLayer.add(playerHands[i]);

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
                x: namePos[nump][j].x * winW,
                y: namePos[nump][j].y * winH,
                width: namePos[nump][j].w * winW,
                height: namePos[nump][j].h * winH,
                name: this.playerNames[i],
            });

            UILayer.add(nameFrames[i]);

            // Draw the tooltips on the player names that show the time
            // (the code is copied from HanabiCard)
            if (!this.replayOnly) {
                const frameHoverTooltip = new Kinetic.Label({
                    x: -1000,
                    y: -1000,
                });

                frameHoverTooltip.add(new Kinetic.Tag({
                    fill: '#3E4345',
                    pointerDirection: 'left',
                    pointerWidth: 0.02 * winW,
                    pointerHeight: 0.015 * winH,
                    lineJoin: 'round',
                    shadowColor: 'black',
                    shadowBlur: 10,
                    shadowOffset: {
                        x: 3,
                        y: 3,
                    },
                    shadowOpacity: 0.6,
                }));

                frameHoverTooltip.add(new FitText({
                    fill: 'white',
                    align: 'left',
                    padding: 0.01 * winH,
                    fontSize: 0.04 * winH,
                    minFontSize: 0.02 * winH,
                    width: 0.08 * winW,
                    fontFamily: 'Verdana',
                    text: '??:??',
                }));

                tipLayer.add(frameHoverTooltip);
                nameFrames[i].tooltip = frameHoverTooltip;

                nameFrames[i].on('mousemove', nameFramesMouseMove);

                nameFrames[i].on('mouseout', nameFramesMouseOut);
            }
        }

        noClueBox = new Kinetic.Rect({
            x: 0.275 * winW,
            y: 0.56 * winH,
            width: 0.25 * winW,
            height: 0.15 * winH,
            cornerRadius: 0.01 * winW,
            fill: 'black',
            opacity: 0.5,
            visible: false,
        });

        UILayer.add(noClueBox);

        noClueLabel = new Kinetic.Text({
            x: 0.15 * winW,
            y: 0.585 * winH,
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

        clueArea = new Kinetic.Group({
            x: 0.10 * winW,
            y: 0.54 * winH,
            width: 0.55 * winW,
            height: 0.27 * winH,
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

        x = 0.26 * winW - (nump - 2) * 0.044 * winW;

        for (let i = 0; i < nump - 1; i++) {
            const j = (this.playerUs + i + 1) % nump;

            button = new ClueRecipientButton({
                x,
                y: 0,
                width: 0.08 * winW,
                height: 0.025 * winH,
                text: this.playerNames[j],
                targetIndex: j,
            });

            clueArea.add(button);

            x += 0.0875 * winW;

            clueTargetButtonGroup.add(button);
        }

        for (let i = 1; i <= 5; i++) {
            button = new NumberButton({
                x: (0.183 + (i - 1) * 0.049) * winW,
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

        /*
            Draw the timer
        */

        this.stopLocalTimer();

        // We don't want the timer to show in replays
        if (!this.replayOnly) {
            const timerY = 0.592;

            timer1 = new TimerDisplay({
                x: 0.155 * winW,
                y: timerY * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
                cornerRadius: 0.005 * winH,
                spaceH: 0.01 * winH,
                label: 'You',
                visible: !this.spectating,
            });

            timerLayer.add(timer1);

            timer2 = new TimerDisplay({
                x: 0.565 * winW,
                y: timerY * winH,
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
                ui.sharedReplay &&
                ui.sharedReplayLeader !== lobby.username &&
                ui.applyReplayActions
            ) {
                // replay actions currently enabled, so disable them
                toggleSharedTurnButton.dispatchEvent(new MouseEvent('click'));
            }
        };

        replayArea = new Kinetic.Group({
            x: 0.15 * winW,
            y: 0.51 * winH,
            width: 0.5 * winW,
            height: 0.27 * winH,
        });

        replayBar = new Kinetic.Rect({
            x: 0,
            y: 0.0425 * winH,
            width: 0.5 * winW,
            height: 0.01 * winH,
            fill: 'black',
            cornerRadius: 0.005 * winH,
            listening: false,
        });

        replayArea.add(replayBar);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.5 * winW,
            height: 0.05 * winH,
            opacity: 0,
        });

        rect.on('click', function rectClick(event) {
            const rectX = event.evt.x - this.getAbsolutePosition().x;
            const w = this.getWidth();
            const step = w / self.replayMax;
            const newTurn = Math.floor((rectX + step / 2) / step);
            if (newTurn !== self.replayTurn) {
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
            visible: !ui.applyReplayActions,
        });

        replayShuttleShared.on('click tap', () => {
            ui.performReplay(ui.sharedReplayTurn, true);
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
                const step = w / self.replayMax;
                const newTurn = Math.floor((shuttleX + step / 2) / step);
                if (newTurn !== self.replayTurn) {
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

        // Rewind to the beginning (the left-most button)
        button = new Button({
            x: 0.1 * winW,
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
            x: 0.18 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewind',
        });

        const backwardFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(self.replayTurn - 1, true);
        };

        button.on('click tap', backwardFunction);

        replayArea.add(button);

        // Go forward one turn (the second right-most button)
        button = new Button({
            x: 0.26 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forward',
        });

        const forwardFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(self.replayTurn + 1);
        };

        button.on('click tap', forwardFunction);

        replayArea.add(button);

        // Go forward to the end (the right-most button)
        button = new Button({
            x: 0.34 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forwardfull',
        });

        const forwardFullFunction = () => {
            inferSharedReplayMode();
            ui.performReplay(self.replayMax, true);
        };

        button.on('click tap', forwardFullFunction);

        replayArea.add(button);

        // The "Exit Replay" button
        button = new Button({
            x: 0.15 * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Exit Replay',
            visible: !this.replayOnly,
        });

        button.on('click tap', () => {
            if (self.replayOnly) {
                ui.sendMsg({
                    type: 'unattendTable',
                    resp: {},
                });

                this.stopLocalTimer();

                ui.lobby.gameEnded();
            } else {
                self.enterReplay(false);
            }
        });

        replayArea.add(button);

        toggleSharedTurnButton = new ToggleButton({
            x: 0.15 * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Pause Shared Turns',
            alternateText: 'Use Shared Turns',
            initialState: !ui.applyReplayActions,
            visible: false,
        });

        toggleSharedTurnButton.on('click tap', () => {
            ui.applyReplayActions = !ui.applyReplayActions;
            replayShuttleShared.setVisible(!ui.applyReplayActions);
            if (ui.applyReplayActions) {
                if (ui.sharedReplayLeader === lobby.username) {
                    shareCurrentTurn(ui.replayTurn);
                } else {
                    ui.performReplay(ui.sharedReplayTurn);
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
            ui.performReplay(self.replayTurn - nump, true);
        };

        const forwardRound = () => {
            inferSharedReplayMode();
            ui.performReplay(self.replayTurn + nump);
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

        // Add "Enter" for pressing the 'Give Clue' button
        clueKeyMap.Enter = mouseClickHelper(submitClue);

        // Keyboard actions for playing and discarding cards
        const promptOwnHandOrder = (actionString) => {
            const playerCards = playerHands[ui.playerUs].children;
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

            const resp = {};
            if (cardOrder === 'deck') {
                resp.type = ACT.DECKPLAY;
            } else {
                resp.type = intendedPlay ? ACT.PLAY : ACT.DISCARD;
                resp.target = cardOrder;
            }

            ui.sendMsg({
                type: 'action',
                resp,
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
            if (event.ctrlKey || event.altKey) {
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
            self.enterReplay(!self.replay);
        });

        UILayer.add(replayButton);

        helpButton = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
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
                type: 'unattendTable',
                resp: {},
            });

            this.stopLocalTimer();

            ui.lobby.gameEnded();
        });

        if (ui.replay) {
            replayArea.show();
        }

        stage.add(bgLayer);
        stage.add(textLayer);
        stage.add(UILayer);
        stage.add(timerLayer);
        stage.add(cardLayer);
        stage.add(tipLayer);
        stage.add(overLayer);
    };

    this.reset = function reset() {
        messagePrompt.setMultiText('');
        msgLogGroup.reset();

        const { suits } = this.variant;

        for (const suit of suits) {
            playStacks.get(suit).removeChildren();
            discardStacks.get(suit).removeChildren();
        }

        for (let i = 0; i < this.playerNames.length; i++) {
            playerHands[i].removeChildren();
        }

        ui.deck = [];
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
        const msgData = msg.resp;

        this.replayLog.push(msg);

        if (msgData.type === 'turn') {
            this.replayMax = msgData.num;
        }
        if (msgData.type === 'gameOver') {
            this.replayMax += 1;
        }

        if (!this.replayOnly && this.replayMax > 0) {
            replayButton.show();
        }

        if (this.replay) {
            this.adjustReplayShuttle();
            UILayer.draw();
        }
    };

    const positionReplayShuttle = (shuttle, turn) => {
        const w = shuttle.getParent().getWidth() - shuttle.getWidth();
        shuttle.setX(turn * w / this.replayMax);
    };

    this.adjustReplayShuttle = () => {
        positionReplayShuttle(replayShuttle, this.replayTurn);
        positionReplayShuttle(replayShuttleShared, this.sharedReplayTurn);
    };

    this.enterReplay = function enterReplay(enter) {
        if (!this.replay && enter) {
            this.replay = true;
            this.replayPos = this.replayLog.length;
            this.replayTurn = this.replayMax;
            this.adjustReplayShuttle();
            this.stopAction(true);
            replayArea.show();
            for (let i = 0; i < this.deck.length; ++i) {
                this.deck[i].setBareImage();
            }
            UILayer.draw();
            cardLayer.draw();
        } else if (this.replay && !enter) {
            this.performReplay(this.replayMax, true);
            this.replay = false;
            replayArea.hide();

            if (savedAction) {
                this.handleAction(savedAction);
            }
            for (let i = 0; i < this.deck.length; ++i) {
                this.deck[i].setBareImage();
            }
            UILayer.draw();
            cardLayer.draw();
        }
    };

    this.performReplay = function performReplay(target, fast) {
        let rewind = false;

        if (target < 0) {
            target = 0;
        }
        if (target > this.replayMax) {
            target = this.replayMax;
        }

        if (target < this.replayTurn) {
            rewind = true;
        }

        if (this.replayTurn === target) {
            return; // We're already there, nothing to do!
        }

        if (
            this.sharedReplay &&
            this.sharedReplayLeader === lobby.username &&
            this.applyReplayActions
        ) {
            shareCurrentTurn(target);
        }

        this.replayTurn = target;

        this.adjustReplayShuttle();
        if (fast) {
            this.animateFast = true;
        }

        if (rewind) {
            this.reset();
            this.replayPos = 0;
        }

        let msg;
        while (true) { // eslint-disable-line no-constant-condition
            msg = this.replayLog[this.replayPos];
            this.replayPos += 1;

            if (!msg) {
                break;
            }

            if (msg.type === 'message') {
                this.setMessage(msg.resp);
            } else if (msg.type === 'notify') {
                this.handleNotify(msg.resp);
            }

            if (msg.type === 'notify' && msg.resp.type === 'turn') {
                if (msg.resp.num === this.replayTurn) {
                    break;
                }
            }
        }

        this.animateFast = false;
        msgLogGroup.refreshText();
        messagePrompt.refreshText();
        cardLayer.draw();
        UILayer.draw();
    };

    this.replayAdvanced = function replayAdvanced() {
        this.animateFast = false;

        if (this.replay) {
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
        notesWritten[order] = note;
    };

    this.handleNotify = function handleNotify(data) {
        const { type } = data;
        if (ui.activeHover) {
            ui.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            ui.activeHover = null;
        }

        if (type === 'draw') {
            const suit = msgSuitToSuit(data.suit, ui.variant);
            if (!ui.learnedCards[data.order]) {
                ui.learnedCards[data.order] = {
                    possibleSuits: this.variant.suits.slice(),
                    possibleRanks: this.variant.ranks.slice(),
                };
            }
            ui.deck[data.order] = new HanabiCard({
                suit,
                rank: data.rank,
                order: data.order,
                suits: this.variant.suits.slice(),
                ranks: this.variant.ranks.slice(),
                holder: data.who,
            });

            const child = new LayoutChild();
            child.add(ui.deck[data.order]);

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
        } else if (type === 'drawSize') {
            drawDeck.setCount(data.size);
        } else if (type === 'played') {
            const suit = msgSuitToSuit(data.which.suit, ui.variant);
            showClueMatch(-1);

            const child = ui.deck[data.which.order].parent;

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            ui.deck[data.which.order].trueSuit = suit;
            ui.deck[data.which.order].trueRank = data.which.rank;
            ui.deck[data.which.order].setBareImage();

            ui.deck[data.which.order].hideClues();

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            const card = child.children[0];
            card.suitPips.hide();
            card.rankPips.hide();
            child.remove();
            child.setAbsolutePosition(pos);

            playStacks.get(suit).add(child);
            playStacks.get(suit).moveToTop();

            clueLog.checkExpiry();
        } else if (type === 'discard') {
            const suit = msgSuitToSuit(data.which.suit, ui.variant);
            showClueMatch(-1);

            const child = ui.deck[data.which.order].parent;

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            ui.deck[data.which.order].trueSuit = suit;
            ui.deck[data.which.order].trueRank = data.which.rank;
            ui.deck[data.which.order].setBareImage();

            ui.deck[data.which.order].hideClues();

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            const card = child.children[0];
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
            const suit = msgSuitToSuit(data.which.suit, ui.variant);
            const card = ui.deck[data.which.order];

            const learnedCard = ui.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

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
            const clue = msgClueToClue(data.clue, ui.variant);
            showClueMatch(-1);

            for (let i = 0; i < data.list.length; i++) {
                ui.deck[data.list[i]].setIndicator(true);
                ui.deck[data.list[i]].cluedBorder.show();

                if (data.target === ui.playerUs && !ui.replayOnly && !ui.spectating) {
                    ui.deck[data.list[i]].applyClue(clue, true);
                    ui.deck[data.list[i]].setBareImage();
                }
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
                giver: ui.playerNames[data.giver],
                target: ui.playerNames[data.target],
                clueName,
                list: data.list,
                neglist,
            });

            clueLog.add(entry);

            clueLog.checkExpiry();
        } else if (type === 'status') {
            clueLabel.setText(`Clues: ${data.clues}`);

            if (data.clues === 0 || data.clues === 8) {
                clueLabel.setFill('#df1c2d');
            } else if (data.clues === 1) {
                clueLabel.setFill('#ef8c1d');
            } else if (data.clues === 2) {
                clueLabel.setFill('#efef1d');
            } else {
                clueLabel.setFill('#d8d5ef');
            }

            scoreLabel.setText(`Score: ${data.score}`);
            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'strike') {
            const x = new Kinetic.Image({
                x: (0.675 + 0.04 * (data.num - 1)) * winW,
                y: 0.918 * winH,
                width: 0.02 * winW,
                height: 0.036 * winH,
                image: ImageLoader.get('redx'),
                opacity: 0,
            });

            strikes[data.num - 1] = x;

            UILayer.add(x);

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
            for (let i = 0; i < ui.playerNames.length; i++) {
                nameFrames[i].setActive(data.who === i);
            }

            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'gameOver') {
            for (let i = 0; i < this.playerNames.length; i++) {
                nameFrames[i].off('mousemove');
            }

            if (timer1) {
                timer1.hide();
            }

            timerLayer.draw();

            this.stopLocalTimer();
            this.replayOnly = true;
            replayButton.hide();
            if (!this.replay) {
                this.enterReplay(true);
            }
            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'reorder') {
            const hand = playerHands[data.target];
            // TODO: Throw an error if hand and note.hand dont have the same numbers in them

            // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
            const newChildOrder = [];
            const handSize = hand.children.length;
            for (let i = 0; i < handSize; ++i) {
                const order = data.handOrder[i];
                const child = ui.deck[order].parent;
                newChildOrder.push(child);

                // Take them out of the hand itself
                child.remove();
            }

            // Put them back into the hand in the new order
            for (let i = 0; i < handSize; ++i) {
                const child = newChildOrder[i];
                hand.add(child);
            }
        } else if (type === 'boot') {
            this.stopLocalTimer();

            alert(`The game was ended by: ${data.who}`);
            ui.lobby.gameEnded();
        }
    };

    this.handleSpectators = (data) => {
        const shouldShowLabel = data.names.length > 0;
        spectatorsLabel.setVisible(shouldShowLabel);
        spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectatorsNumLabel.setText(data.names.length);

            // Build the string that shows all the names
            const nameEntries = data.names.map((name, i) => `${i + 1}) ${name}`).join('\n');
            const tooltipString = `Spectators:\n${nameEntries}`;

            spectatorsLabelTooltip.getText().setText(tooltipString);
        } else {
            spectatorsLabelTooltip.hide();
        }
        UILayer.batchDraw();
        tipLayer.batchDraw();
    };

    this.handleClock = (activeIndex) => {
        this.stopLocalTimer();

        // Check to see if the second timer has been drawn
        if (typeof timer2 === 'undefined') {
            return;
        }

        const currentUserTurn = activeIndex === ui.playerUs && !ui.spectating;

        // Update onscreen time displays
        if (!ui.spectating) {
            // The visibilty of this timer does not change during a game
            let time = ui.playerTimes[ui.playerUs];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timer1.setText(millisecondsToTimeDisplay(time));
        }

        if (!currentUserTurn) {
            // Update the ui with the value of the timer for the active player
            let time = ui.playerTimes[activeIndex];
            if (!ui.timedGame) {
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
            let time = ui.playerTimes[i];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            nameFrames[i].tooltip.getText().setText(millisecondsToTimeDisplay(time));
        }

        tipLayer.draw();

        // If no timer is running on the server, do not configure local approximation
        if (activeIndex === null) {
            return;
        }

        // Start the local timer for the active player
        const activeTimerUIText = currentUserTurn ? timer1 : timer2;
        const textUpdateTargets = [activeTimerUIText, nameFrames[activeIndex].tooltip.getText()];
        ui.timerID = window.setInterval(() => {
            setTickingDownTime(textUpdateTargets, activeIndex);
        }, 1000);
    };

    // Recieved by the client when spectating a game
    // Has the following data:
    /*
        {
            order: 16,
            note: [
                'm3,m2', // Player 1's note
                'probably m3', // Player 2's note
            ],
        }
    */
    this.handleNote = (data) => {
        // Build the note text from the "notes" array given by the server
        let newNote = '';
        for (let i = 0; i < data.notes.length; i++) {
            if (data.notes[i] !== null) {
                newNote += `${ui.playerNames[i]}: ${data.notes[i]}\n`;
            }
        }
        if (newNote.length > 0) {
            newNote = newNote.slice(0, -1); // Chop off the trailing newline
        }

        // Set the note
        ui.setNote(data.order, newNote);

        // Draw (or hide) the note indicator
        const card = ui.deck[data.order];
        card.tooltip.getText().setText(newNote);
        if (newNote.length > 0) {
            card.noteGiven.show();
            if (ui.spectating) {
                card.notePulse.play();
            }
        } else {
            card.noteGiven.hide();
            card.tooltip.hide();
            tipLayer.draw();
        }

        UILayer.draw();
        cardLayer.draw();
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
        notesWritten = data.notes;

        for (let order = 0; order < notesWritten.length; order++) {
            const note = notesWritten[order];

            // The following code is mosly copied from the "handleNote" function
            // Draw (or hide) the note indicator
            const card = ui.deck[order];
            if (note === null) {
                card.tooltip.getText().setText('');
                card.noteGiven.hide();
                card.tooltip.hide();
            } else {
                card.tooltip.getText().setText(note);
                card.noteGiven.show();
                if (ui.spectating) {
                    card.notePulse.play();
                }
            }
        }
        tipLayer.draw();
        UILayer.draw();
        cardLayer.draw();
    };

    this.handleReplayLeader = function handleReplayLeader(data) {
        this.sharedReplayLeader = data.name;

        sharedReplayLeaderLabel.show();
        sharedReplayLeaderLabelTooltip.getText().setText(`Leader: ${this.sharedReplayLeader}`);

        if (this.sharedReplayLeader === lobby.username) {
            sharedReplayLeaderLabel.fill('yellow');
        }

        toggleSharedTurnButton.show();
        UILayer.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(data) {
        this.sharedReplayTurn = data.turn;
        this.adjustReplayShuttle();
        if (ui.applyReplayActions) {
            this.performReplay(this.sharedReplayTurn);
        } else {
            replayShuttleShared.getLayer().batchDraw();
        }
    };

    this.handleReplayIndicator = (data) => {
        const indicated = ui.deck[data.order];
        if (indicated && indicated.isInPlayerHand() && ui.applyReplayActions) {
            showClueMatch(-1);
            indicated.setIndicator(true, INDICATOR.REPLAY_LEADER);
        }
    };

    this.stopAction = (fast) => {
        if (fast) {
            clueArea.hide();
        } else {
            new Kinetic.Tween({
                node: clueArea,
                opacity: 0.0,
                duration: 0.5,
                runonce: true,
                onFinish: () => {
                    clueArea.hide();
                },
            }).play();
        }

        noClueLabel.hide();
        noClueBox.hide();
        noDiscardLabel.hide();

        showClueMatch(-1);
        clueTargetButtonGroup.off('change');
        clueButtonGroup.off('change');

        for (let i = 0; i < playerHands[ui.playerUs].children.length; i++) {
            const child = playerHands[ui.playerUs].children[i];

            child.off('dragend.play');
            child.setDraggable(false);
        }

        drawDeck.cardback.setDraggable(false);
        deckPlayAvailableLabel.setVisible(false);

        submitClue.off('click tap');
    };

    let savedAction = null;

    this.handleAction = function handleAction(data) {
        const self = this;

        savedAction = data;

        if (this.replay) {
            return;
        }

        if (data.canClue) {
            clueArea.show();

            new Kinetic.Tween({
                node: clueArea,
                opacity: 1.0,
                duration: 0.5,
                runonce: true,
            }).play();
        } else {
            noClueLabel.show();
            noClueBox.show();
            if (!this.animateFast) {
                UILayer.draw();
            }
        }

        if (!data.canDiscard) {
            noDiscardLabel.show();
            if (!this.animateFast) {
                UILayer.draw();
            }
        }

        submitClue.setEnabled(false);

        clueTargetButtonGroup.clearPressed();
        clueButtonGroup.clearPressed();

        if (this.playerNames.length === 2) {
            clueTargetButtonGroup.list[0].setPressed(true);
        }

        playerHands[ui.playerUs].moveToTop();

        for (let i = 0; i < playerHands[ui.playerUs].children.length; i++) {
            const child = playerHands[ui.playerUs].children[i];

            child.setDraggable(true);

            // eslint-disable-next-line no-loop-func
            child.on('dragend.play', function dragendPlay() {
                const pos = this.getAbsolutePosition();

                pos.x += this.getWidth() * this.getScaleX() / 2;
                pos.y += this.getHeight() * this.getScaleY() / 2;

                if (overPlayArea(pos)) {
                    ui.sendMsg({
                        type: 'action',
                        resp: {
                            type: ACT.PLAY,
                            target: this.children[0].order,
                        },
                    });

                    self.stopAction();
                    this.setDraggable(false);
                    savedAction = null;
                } else if (
                    pos.x >= discardArea.getX() &&
                    pos.y >= discardArea.getY() &&
                    pos.x <= discardArea.getX() + discardArea.getWidth() &&
                    pos.y <= discardArea.getY() + discardArea.getHeight() &&
                    data.canDiscard
                ) {
                    ui.sendMsg({
                        type: 'action',
                        resp: {
                            type: ACT.DISCARD,
                            target: this.children[0].order,
                        },
                    });
                    self.stopAction();

                    this.setDraggable(false);
                    savedAction = null;
                } else {
                    playerHands[ui.playerUs].doLayout();
                }
            });
        }

        drawDeck.cardback.setDraggable(data.canBlindPlayDeck);

        deckPlayAvailableLabel.setVisible(data.canBlindPlayDeck);

        // Ensure deck blindplay is above other cards, ui elements
        if (data.canBlindPlayDeck) {
            drawDeck.moveToTop();
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

            if (!match) {
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

            const target = clueTargetButtonGroup.getPressed();
            const clueButton = clueButtonGroup.getPressed();

            showClueMatch(target.targetIndex, {});

            ui.sendMsg({
                type: 'action',
                resp: {
                    type: ACT.CLUE,
                    target: target.targetIndex,
                    clue: clueToMsgClue(clueButton.clue, ui.variant),
                },
            });

            self.stopAction();

            savedAction = null;
        });
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

    this.replayLog = [];
    this.replayPos = 0;
    this.replayTurn = 0;
}

/*
    End of Hanabi UI
*/

HanabiUI.prototype.handleMessage = function handleMessage(msg) {
    const msgType = msg.type;
    const msgData = msg.resp;

    if (msgType === 'message') {
        this.replayLog.push(msg);

        if (!this.replay) {
            this.setMessage.call(this, msgData);
        }
    } else if (msgType === 'init') {
        this.playerUs = msgData.seat;
        this.playerNames = msgData.names;
        this.variant = constants.VARIANT_INTEGER_MAPPING[msgData.variant];
        this.replay = msgData.replay;
        this.replayOnly = msgData.replay;
        this.spectating = msgData.spectating;
        this.timedGame = msgData.timed;
        this.sharedReplay = msgData.sharedReplay;
        this.reorderCards = msgData.reorderCards;

        if (this.replayOnly) {
            this.replayTurn = -1;
        }

        this.loadImages();
    } else if (msgType === 'advanced') {
        this.replayAdvanced();
    } else if (msgType === 'connected') {
        this.showConnected(msgData.list);
    } else if (msgType === 'notify') {
        this.saveReplay(msg);

        if (!this.replay || msgData.type === 'reveal') {
            this.handleNotify(msgData);
        }
    } else if (msgType === 'action') {
        this.lastAction = msgData;
        this.handleAction.call(this, msgData);

        if (this.animateFast) {
            return;
        }

        if (this.lobby.sendTurnNotify) {
            this.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        this.lastSpectators = msgData;
        // This is used to update the names of the people currently spectating the game
        this.handleSpectators.call(this, msgData);
    } else if (msgType === 'clock') {
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
        this.handleReplayIndicator.call(this, msgData);
    }
};

HanabiUI.prototype.setBackend = function setBackend(backend) {
    this.backend = backend;

    this.sendMsg({
        type: 'hello',
        resp: {},
    });
};

HanabiUI.prototype.sendMsg = function sendMsg(msg) {
    if (this.showDebugMessages) {
        console.log(`%cSent (UI) ${msg.type}:`, 'color: green;');
        console.log(msg.resp);
    }
    this.backend.emit('message', msg);
};
