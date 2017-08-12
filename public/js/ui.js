function HanabiUI(lobby, gameID) {
    this.showDebugMessages = true;

    this.lobby = lobby;
    this.gameID = gameID;

    const ui = this;

    const ACT = constants.ACT;
    const CLUE_TYPE = constants.CLUE_TYPE;
    const COLOR = constants.COLOR;
    const SUIT = constants.SUIT;
    const CARD_AREA = constants.CARD_AREA;
    const CARDH = constants.CARDH;
    const CARDW = constants.CARDW;
    const PATHFUNC = constants.PATHFUNC;
    const backpath = constants.backpath;
    const drawshape = constants.drawshape;

    this.deck = [];

    this.playerUs = -1;
    this.playerNames = [];
    this.variant = 0;
    this.replay = false;
    this.sharedReplay = false;
    this.sharedReplayLeader = ''; // Equal to the username of the shared replay leader
    this.sharedReplayTurn = -1;
    this.replayOnly = false;
    this.spectating = false;
    this.replayMax = 0;
    this.animateFast = true;
    this.ready = false;
    // In replays, we can show a grayed-out version of a card face if it was not
    // known at the time, but we know it now; these are cards we have "learned"
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
    this.lastClock = [];
    this.lastSpectators = null;

    // This below code block deals with automatic resizing
    // Start listening to resize events and draw canvas.
    window.addEventListener('resize', resizeCanvas, false);

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
        if (self.replay) {
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
            self.handleClock.call(self, self.lastClock);
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
        cursorLayer.draw();
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
            msgClueValue = variant.clueColors.findIndex(
                color => color === clueColor,
            );
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

    // textObjects are expected to be on the timerLayer or tipLayer
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
        });
        timerLayer.draw();
        tipLayer.draw();

        // Play a sound to indicate that the current player is almost out of time
        // Do not play it more frequently than about once per second
        if (
            ui.timedGame &&
            lobby.sendTurnSound &&
            millisecondsLeft > 0 &&
            millisecondsLeft <= 5000 &&
            timeElapsed > 900 &&
            timeElapsed < 1100
        ) {
            lobby.playSound('tone');
        }
    }

    function imageName(card) {
        const prefix = 'card';
        let suitName = SUIT.GRAY.name;
        let rank = 6;
        const learnedCard = ui.learnedCards[card.order];
        const isLearnedCard = (ui.replay && learnedCard);
        if (isLearnedCard) {
            if (learnedCard.suit) suitName = learnedCard.suit.name;
            if (learnedCard.rank) rank = learnedCard.rank;
        } else {
            if (card.suitKnown()) suitName = card.trueSuit.name;
            if (card.rankKnown()) rank = card.trueRank;
        }
        return `${prefix}-${suitName}-${rank}`;
    }

    const scaleCardImage = function scaleCardImage(context, name) {
        const width = this.getWidth();
        const height = this.getHeight();
        const am = this.getAbsoluteTransform();
        let src = cardImages[name];

        if (!src) {
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
        this.possibleRanks = [1, 2, 3, 4, 5];
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
            for (let i = 0; i < 5; i++) {
                const rankPip = new Kinetic.Rect({
                    x: Math.floor(CARDW * 0.05 + i * CARDW * 0.19),
                    y: 0,
                    width: Math.floor(CARDW * 0.15),
                    height: Math.floor(CARDH * 0.10),
                    fill: 'black',
                    stroke: 'black',
                    name: (i + 1).toString(),
                });
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
                this.suitPips.add(suitPip);
                i += 1;
            }
        }

        if (this.identityKnown()) {
            ui.learnedCards[this.order] = {
                suit: this.trueSuit,
                rank: this.trueRank,
            };
        }

        this.barename = '';

        this.setBareImage();

        this.indicateRect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            cornerRadius: 6,
            strokeWidth: 12,
            stroke: '#ccccee',
            visible: false,
            listening: false,
        });

        this.add(this.indicateRect);

        // Draw the circle that is the "clue indicator" on the card
        this.clueGiven = new Kinetic.Circle({
            x: 0.9 * config.width,
            y: (ui.variant.offsetCardIndicators ? 0.2 : 0.1) * config.height,
            radius: 0.05 * config.width,
            fill: 'white',
            stroke: 'black',
            strokeWidth: 4,
            visible: false,
        });

        this.add(this.clueGiven);

        // Define the "note indicator" square
        this.noteGiven = new Kinetic.Rect({
            x: 0.854 * config.width,
            y: (ui.variant.offsetCardIndicators ? 0.26 : 0.165) * config.height,
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
            width: 0.15 * winW,
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
        if (this.order in notesWritten) {
            const note = notesWritten[this.order];
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
            if (ui.sharedReplayLeader === lobby.username) {
                // Don't popup the alert for shared replay leaders;
                // we want right click to be dedicated to sending the cursor
                // position to the other people in the replay
                return;
            }

            if (event.evt.which !== 3) { // Right click
                // We only care about right clicks
                return;
            }

            let note = ui.getNote(self.order);
            const newNote = prompt('Note on card:', note);
            if (newNote !== null) {
                self.tooltip.getText().setText(newNote);
                ui.setNote(self.order, newNote);
                note = newNote;
            }

            // Do nothing if there was no old note and no new note
            if (typeof note === 'undefined') {
                return;
            }

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

                // Also send the server a new copy of all of our notes
                ui.sendMsg({
                    type: 'notes',
                    resp: {
                        notes: notesWritten,
                    },
                });
            }
        });
    };

    HanabiCard.prototype.setBareImage = function setBareImage() {
        this.barename = imageName(this);
    };

    HanabiCard.prototype.setIndicator = function setIndicator(indicate, negative) {
        if (negative) {
            this.indicateRect.setStroke('#ff7777');
        } else {
            this.indicateRect.setStroke('#ddeecc');
        }
        this.indicateRect.setVisible(indicate);
        this.getLayer().batchDraw();
    };

    // TODO: refactor addNegativeClue and addClue into one function to avoid repeating code
    HanabiCard.prototype.addNegativeClue = function addNegativeClue(clue) {
        if (!ui.learnedCards[this.order]) {
            ui.learnedCards[this.order] = {};
        }
        if (clue.type === CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            this.possibleSuits = this.possibleSuits.filter((suit) => {
                const remove = suit.clueColors.includes(clueColor);
                if (remove) this.suitPips.find(`.${suit.name}`).hide();
                return !remove;
            });
            if (this.possibleSuits.length === 1) {
                this.trueSuit = this.possibleSuits[0];
                this.suitPips.hide();
                ui.learnedCards[this.order].suit = this.trueSuit;
            }
        } else {
            const clueRank = clue.value;
            this.rankPips.find(`.${clueRank}`).hide();
            this.possibleRanks = this.possibleRanks.filter(
                rank => rank !== clueRank,
            );
            if (this.possibleRanks.length === 1) {
                this.trueRank = this.possibleRanks[0];
                this.rankPips.hide();
                ui.learnedCards[this.order].rank = this.trueRank;
            }
        }
    };

    // TODO: add in color letters for colorblind mode
    HanabiCard.prototype.addClue = function addClue(clue) {
        if (!ui.learnedCards[this.order]) {
            ui.learnedCards[this.order] = {};
        }

        if (clue.type === CLUE_TYPE.COLOR) {
            // Draw the color squares
            const clueColor = clue.value;
            this.possibleSuits = this.possibleSuits.filter((suit) => {
                const remove = !suit.clueColors.includes(clueColor);
                if (remove) this.suitPips.find(`.${suit.name}`).hide();
                return !remove;
            });
            if (this.possibleSuits.length === 1) {
                this.trueSuit = this.possibleSuits[0];
                this.suitPips.hide();
                ui.learnedCards[this.order].suit = this.trueSuit;
            }
        } else {
            this.rankPips.hide();
            const clueRank = clue.value;
            this.trueRank = clueRank;
            ui.learnedCards[this.order].rank = clueRank;
        }
    };

    HanabiCard.prototype.hideClues = function hideClues() {
        this.clueGiven.hide();
        this.noteGiven.hide();
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

        this.targetIndex = config.targetIndex;

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

                ui.deck[self.neglist[i]].setIndicator(true, true);
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

        return playerHands.indexOf(ui.deck[c].parent.parent) !== -1;
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
        notesWritten = ui.loadNotes();

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

    this.buildCards = function buildCards() {
        let cvs;
        let ctx;
        const xrad = CARDW * 0.08;
        const yrad = CARDH * 0.08;

        // 0-5 are the real suits; 6 is a "white" suit for replays
        const suits = this.variant.suits.concat(SUIT.GRAY);
        for (const suit of suits) {
            // 0 is the stack base. 1-5 are the cards 1-5. 6 is a numberless card for replays.
            for (let j = 0; j < 7; j++) {
                cvs = document.createElement('canvas');
                cvs.width = CARDW;
                cvs.height = CARDH;

                const name = `card-${suit.name}-${j}`;
                cardImages[name] = cvs;

                ctx = cvs.getContext('2d');

                backpath(ctx, 4, xrad, yrad);

                // Gives cards a white background
                if (j > 0) {
                    ctx.fillStyle = 'white';
                    ctx.fill();
                }

                ctx.save();
                ctx.clip();
                ctx.globalAlpha = 0.2;
                ctx.strokeStyle = 'black';
                // Draws the texture lines on cards
                if (j > 0) {
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
                }
                ctx.restore();

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
                if (j === 0) {
                    ctx.globalAlpha = 1.0;
                }
                ctx.stroke();
                ctx.restore();

                ctx.shadowBlur = 10;
                ctx.fillStyle = suit.style(ctx, CARD_AREA.NUMBER);

                const suitLetter = suit.abbreviation;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2;
                ctx.lineJoin = 'round';
                let textYPos = 110;
                ctx.font = 'bold 96pt Arial';
                let indexLabel = j.toString();
                if (j === 6) {
                    indexLabel = '';
                }

                if (lobby.showColorblindUI) {
                    ctx.font = 'bold 68pt Arial';
                    textYPos = 83;
                    indexLabel = suitLetter + indexLabel;
                }
                // Draws numbers on top left and bottom right of the cards
                if (j > 0) {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillText(indexLabel, 19, textYPos);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    ctx.strokeText(indexLabel, 19, textYPos);
                    ctx.save();

                    ctx.translate(CARDW, CARDH);
                    ctx.rotate(Math.PI);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillText(indexLabel, 19, textYPos);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    ctx.strokeText(indexLabel, 19, textYPos);
                    ctx.restore();
                }

                ctx.fillStyle = suit.style(ctx, CARD_AREA.SYMBOL);

                ctx.lineWidth = 5;
                if (suit !== SUIT.GRAY) {
                    const pathfunc = PATHFUNC.get(suit.shape);
                    // The middle for cards 2 or 4
                    if (j === 1 || j === 3) {
                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.scale(0.4, 0.4);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();
                    }

                    // Top and bottom for cards 2, 3, 4, 5
                    if (j > 1 && j !== 6) {
                        let symbolYPos = 120;
                        if (lobby.showColorblindUI) {
                            symbolYPos = 85;
                        }
                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.translate(0, -symbolYPos);
                        ctx.scale(0.4, 0.4);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();

                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.translate(0, symbolYPos);
                        ctx.scale(0.4, 0.4);
                        ctx.rotate(Math.PI);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();
                    }

                    // Left and right for cards 4 and 5
                    if (j > 3 && j !== 6) {
                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.translate(-90, 0);
                        ctx.scale(0.4, 0.4);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();

                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.translate(90, 0);
                        ctx.scale(0.4, 0.4);
                        ctx.rotate(Math.PI);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();
                    }

                    // Size, position, and alpha adjustment for the central icon on stack base and 5
                    if (j === 0 || j === 5) {
                        ctx.globalAlpha = 1.0;
                        ctx.save();
                        ctx.translate(CARDW / 2, CARDH / 2);
                        ctx.scale(0.6, 0.6);
                        ctx.translate(-75, -100);
                        pathfunc(ctx);
                        drawshape(ctx);
                        ctx.restore();
                    }
                }

                // Make the special corners on cards for the mixed variant
                const clueColors = suit.clueColors;
                if (clueColors.length === 2) {
                    const [clueColor1, clueColor2] = suit.clueColors;

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
                }
            }
        }

        cvs = document.createElement('canvas');
        cvs.width = CARDW;
        cvs.height = CARDH;

        ctx = cvs.getContext('2d');

        cardImages['card-Gray-6'] = cvs;

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

        cvs = document.createElement('canvas');
        cvs.width = CARDW;
        cvs.height = CARDH;

        // Deck back image
        ctx = cvs.getContext('2d');
        cardImages['deck-back'] = cvs;
        ctx = cvs.getContext('2d');
        const imageObj = new Image();

        imageObj.onload = function loadImg() {
            ctx.drawImage(imageObj, -30, -10);
        };
        imageObj.src = 'public/img/fireworks.jpg';
        ctx.save();
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
    const cursorLayer = new Kinetic.Layer({
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
    let timerRect1;
    let timerLabel1;
    let timerText1;
    let timerRect2;
    let timerLabel2;
    let timerText2;
    let noClueLabel;
    let noClueBox;
    let noDiscardLabel;
    let deckPlayAvailableLabel;
    let sharedReplayCursor;
    let replayArea;
    let replayBar;
    let replayShuttle;
    let replayButton;
    let goToSharedTurnButton; // Used in shared replays
    let lobbyButton;
    let helpButton;
    let helpGroup;
    let msgLogGroup;
    let overback;
    let notesWritten = {};

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
            Shared replay cursor
        */

        const cursor = new Image();
        cursor.src = 'public/img/cursor.png';
        cursor.onload = () => {
            sharedReplayCursor = new Kinetic.Image({
                x: -1000,
                y: -1000,
                image: cursor,
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 0,
                    y: 0,
                },
                shadowOpacity: 0.9,
            });
            cursorLayer.add(sharedReplayCursor);
        };

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
                    image: cardImages[`card-${suit.name}-0`],
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

        const namePos = {
            2: [
                { x: 0.18, y: 0.97, w: 0.44, h: 0.02 },
                { x: 0.18, y: 0.21, w: 0.44, h: 0.02 },
            ],
            3: [
                { x: 0.18, y: 0.97, w: 0.44, h: 0.02 },
                { x: 0.01, y: 0.765, w: 0.12, h: 0.02 },
                { x: 0.67, y: 0.765, w: 0.12, h: 0.02 },
            ],
            4: [
                { x: 0.22, y: 0.97, w: 0.36, h: 0.02 },
                { x: 0.01, y: 0.74, w: 0.13, h: 0.02 },
                { x: 0.22, y: 0.21, w: 0.36, h: 0.02 },
                { x: 0.66, y: 0.74, w: 0.13, h: 0.02 },
            ],
            5: [
                { x: 0.22, y: 0.97, w: 0.36, h: 0.02 },
                { x: 0.025, y: 0.775, w: 0.116, h: 0.02 },
                { x: 0.015, y: 0.199, w: 0.36, h: 0.02 },
                { x: 0.435, y: 0.199, w: 0.36, h: 0.02 },
                { x: 0.659, y: 0.775, w: 0.116, h: 0.02 },
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
            if (!this.replay) {
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

            button = new Button({
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
        const clueColors = this.variant.clueColors;
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

        // We don't want the timer to show in replays
        if (!this.replay) {
            const timerX = 0.155;
            const timerY = 0.592;
            const timerX2 = 0.565;

            timerRect1 = new Kinetic.Rect({
                x: timerX * winW,
                y: timerY * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fill: 'black',
                cornerRadius: 0.005 * winH,
                opacity: 0.2,
            });
            timerLayer.add(timerRect1);

            timerLabel1 = new Kinetic.Text({
                x: timerX * winW,
                y: (timerY + 0.06) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text: 'You',
                fill: '#d8d5ef',
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 0,
                    y: 0,
                },
                shadowOpacity: 0.9,
            });
            timerLayer.add(timerLabel1);

            timerText1 = new Kinetic.Text({
                x: timerX * winW,
                y: (timerY + 0.01) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
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
            });
            timerLayer.add(timerText1);

            timerRect2 = new Kinetic.Rect({
                x: timerX2 * winW,
                y: timerY * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fill: 'black',
                cornerRadius: 0.005 * winH,
                opacity: 0.2,
            });
            timerLayer.add(timerRect2);

            timerLabel2 = new Kinetic.Text({
                x: timerX2 * winW,
                y: (timerY + 0.06) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.02 * winH,
                fontFamily: 'Verdana',
                align: 'center',
                text: 'Current\nPlayer',
                fill: '#d8d5ef',
                shadowColor: 'black',
                shadowBlur: 10,
                shadowOffset: {
                    x: 0,
                    y: 0,
                },
                shadowOpacity: 0.9,
            });
            timerLayer.add(timerLabel2);

            timerText2 = new Kinetic.Text({
                x: timerX2 * winW,
                y: (timerY + 0.01) * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fontSize: 0.03 * winH,
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
            });
            timerLayer.add(timerText2);

            // Hide the first timer if spectating
            if (this.spectating) {
                timerRect1.hide();
                timerLabel1.hide();
                timerText1.hide();
            }

            // Hide the second timer by default
            if (!this.spectating) {
                timerRect2.hide();
                timerLabel2.hide();
                timerText2.hide();
            }
        }

        /*
            Draw the replay area
        */

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
                self.performReplay(newTurn, true);
            }
        });

        replayArea.add(rect);

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

        // Rewind to the beginning (the left-most button)
        button = new Button({
            x: 0.1 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewindfull',
        });

        const rewindFullFunction = () => {
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

                if (ui.timerID !== null) {
                    window.clearInterval(ui.timerID);
                    ui.timerID = null;
                }

                ui.lobby.gameEnded();
            } else {
                self.enterReplay(false);
            }
        });

        replayArea.add(button);

        // The "Go to Shared Turn" button
        goToSharedTurnButton = new Button({
            x: 0.15 * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Go to Shared Turn',
            visible: false,
        });

        goToSharedTurnButton.on('click tap', () => {
            console.log('Going to shared turn:', ui.sharedReplayTurn);
            ui.performReplay(ui.sharedReplayTurn);
        });

        replayArea.add(goToSharedTurnButton);

        replayArea.hide();
        UILayer.add(replayArea);

        /*
            Keyboard shortcuts
        */

        const backwardRound = () => {
            ui.performReplay(self.replayTurn - nump, true);
        };

        const forwardRound = () => {
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

            if (ui.timerID !== null) {
                window.clearInterval(ui.timerID);
                ui.timerID = null;
            }

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
        stage.add(cursorLayer);
    };

    this.reset = function reset() {
        messagePrompt.setMultiText('');
        msgLogGroup.reset();

        const suits = this.variant.suits;

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

    this.adjustReplayShuttle = () => {
        const w = replayShuttle.getParent().getWidth() - replayShuttle.getWidth();
        replayShuttle.setX(this.replayTurn * w / this.replayMax);
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

        if (this.sharedReplay && this.sharedReplayLeader === lobby.username) {
            this.sendMsg({
                type: 'replayAction',
                resp: {
                    type: 0, // Type 0 is a new replay turn
                    turn: target,
                },
            });
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

    this.getNote = cardOrder => notesWritten[cardOrder];

    this.setNote = function setNote(cardOrder, note) {
        if (note) {
            notesWritten[cardOrder] = note;
        } else {
            delete notesWritten[cardOrder];
        }
        this.saveNotes();
    };

    this.loadNotes = () => {
        const cookie = localStorage.getItem(gameID);
        if (cookie) {
            return JSON.parse(cookie);
        }

        return {};
    };

    this.saveNotes = () => {
        const cookie = JSON.stringify(notesWritten);
        localStorage.setItem(gameID, cookie);
    };

    this.handleNotify = function handleNotify(note) {
        const type = note.type;
        if (ui.activeHover) {
            ui.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            ui.activeHover = null;
        }

        if (type === 'draw') {
            const suit = msgSuitToSuit(note.suit, ui.variant);
            ui.deck[note.order] = new HanabiCard({
                suit,
                rank: note.rank,
                order: note.order,
                suits: this.variant.suits,
            });

            const child = new LayoutChild();
            child.add(ui.deck[note.order]);

            const pos = drawDeck.cardback.getAbsolutePosition();

            child.setAbsolutePosition(pos);
            child.setRotation(-playerHands[note.who].getRotation());

            const scale = drawDeck.cardback.getWidth() / CARDW;
            child.setScale({
                x: scale,
                y: scale,
            });

            playerHands[note.who].add(child);
            playerHands[note.who].moveToTop();
        } else if (type === 'drawSize') {
            drawDeck.setCount(note.size);
        } else if (type === 'played') {
            const suit = msgSuitToSuit(note.which.suit, ui.variant);
            showClueMatch(-1);

            const child = ui.deck[note.which.order].parent;

            ui.deck[note.which.order].trueSuit = suit;
            ui.deck[note.which.order].trueRank = note.which.rank;
            ui.learnedCards[note.which.order] = {
                suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

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
            const suit = msgSuitToSuit(note.which.suit, ui.variant);
            showClueMatch(-1);

            const child = ui.deck[note.which.order].parent;

            ui.deck[note.which.order].trueSuit = suit;
            ui.deck[note.which.order].trueRank = note.which.rank;
            ui.learnedCards[note.which.order] = {
                suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

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

                if (note.which.rank < child.parent.children[n - 1].children[0].trueRank) {
                    child.moveDown();
                } else {
                    finished = true;
                }
            } while (!finished);

            clueLog.checkExpiry();
        } else if (type === 'reveal') {
            const suit = msgSuitToSuit(note.which.suit, ui.variant);

            ui.deck[note.which.order].trueSuit = suit;
            ui.deck[note.which.order].trueRank = note.which.rank;
            ui.learnedCards[note.which.order] = {
                suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

            if (!this.animateFast) {
                cardLayer.draw();
            }
        } else if (type === 'clue') {
            const clue = msgClueToClue(note.clue, ui.variant);
            showClueMatch(-1);

            for (let i = 0; i < note.list.length; i++) {
                ui.deck[note.list[i]].setIndicator(true);
                ui.deck[note.list[i]].clueGiven.show();

                if (note.target === ui.playerUs && !ui.replayOnly && !ui.spectating) {
                    ui.deck[note.list[i]].addClue(clue);
                    ui.deck[note.list[i]].setBareImage();
                }
            }

            const neglist = [];

            for (let i = 0; i < playerHands[note.target].children.length; i++) {
                const child = playerHands[note.target].children[i];

                const card = child.children[0];
                const order = card.order;

                if (note.list.indexOf(order) < 0) {
                    neglist.push(order);
                    card.addNegativeClue(clue);
                    card.setBareImage();
                }
            }

            let clueName;
            if (note.clue.type === CLUE_TYPE.RANK) {
                clueName = clue.value.toString();
            } else {
                clueName = clue.value.name;
            }

            const entry = new HanabiClueEntry({
                width: clueLog.getWidth(),
                height: 0.017 * winH,
                giver: ui.playerNames[note.giver],
                target: ui.playerNames[note.target],
                clueName,
                list: note.list,
                neglist,
            });

            clueLog.add(entry);

            clueLog.checkExpiry();
        } else if (type === 'status') {
            clueLabel.setText(`Clues: ${note.clues}`);

            if (note.clues === 0 || note.clues === 8) {
                clueLabel.setFill('#df1c2d');
            } else if (note.clues === 1) {
                clueLabel.setFill('#ef8c1d');
            } else if (note.clues === 2) {
                clueLabel.setFill('#efef1d');
            } else {
                clueLabel.setFill('#d8d5ef');
            }

            scoreLabel.setText(`Score: ${note.score}`);
            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'strike') {
            const x = new Kinetic.Image({
                x: (0.675 + 0.04 * (note.num - 1)) * winW,
                y: 0.918 * winH,
                width: 0.02 * winW,
                height: 0.036 * winH,
                image: ImageLoader.get('redx'),
                opacity: 0,
            });

            strikes[note.num - 1] = x;

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
                nameFrames[i].setActive(note.who === i);
            }

            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'gameOver') {
            for (let i = 0; i < this.playerNames.length; i++) {
                nameFrames[i].off('mousemove');
            }

            if (timerRect1) {
                timerRect1.hide();
                timerLabel1.hide();
                timerText1.hide();
            }

            timerLayer.draw();

            this.replayOnly = true;
            replayButton.hide();
            if (!this.replay) {
                this.enterReplay(true);
            }
            if (!this.animateFast) {
                UILayer.draw();
            }
        } else if (type === 'reorder') {
            const hand = playerHands[note.target];
            // TODO: Throw an error if hand and note.hand dont have the same numbers in them

            // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
            const newChildOrder = [];
            const handSize = hand.children.length;
            for (let i = 0; i < handSize; ++i) {
                const order = note.handOrder[i];
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
            if (ui.timerID !== null) {
                window.clearInterval(ui.timerID);
                ui.timerID = null;
            }

            alert(`The game was ended by: ${note.who}`);
            ui.lobby.gameEnded();
        }
    };

    this.handleSpectators = (note) => {
        const shouldShowLabel = note.names.length > 0;
        spectatorsLabel.setVisible(shouldShowLabel);
        spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectatorsNumLabel.setText(note.names.length);

            // Build the string that shows all the names
            let tooltipString = 'Spectators:\n';
            for (let i = 0; i < note.names.length; i++) {
                tooltipString += `${i + 1}) ${note.names[i]}\n`;
            }
            tooltipString = tooltipString.slice(0, -1); // Chop off the trailing newline

            spectatorsLabelTooltip.getText().setText(tooltipString);
        }
        UILayer.draw();
    };

    this.handleClock = (note) => {
        if (ui.timerID !== null) {
            window.clearInterval(ui.timerID);
            ui.timerID = null;
        }

        ui.playerTimes = note.times;

        // Check to see if the second timer has been drawn
        if (typeof timerRect2 === 'undefined') {
            return;
        }

        const currentUserTurn = note.active === ui.playerUs && !ui.spectating;

        // Update onscreen time displays
        if (!ui.spectating) {
            // The visibilty of this timer does not change during a game
            let time = ui.playerTimes[ui.playerUs];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timerText1.setText(millisecondsToTimeDisplay(time));
        }

        if (!currentUserTurn) {
            // Update the ui with the value of the timer for the active player
            let time = ui.playerTimes[note.active];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timerText2.setText(millisecondsToTimeDisplay(time));
        }

        const shoudShowTimer2 = !currentUserTurn && note.active !== null;
        timerRect2.setVisible(shoudShowTimer2);
        timerLabel2.setVisible(shoudShowTimer2);
        timerText2.setVisible(shoudShowTimer2);

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
        if (note.active === null) {
            return;
        }

        // Start the local timer for the active player
        const activeTimerUIText = currentUserTurn ? timerText1 : timerText2;
        const textUpdateTargets = [activeTimerUIText, nameFrames[note.active].tooltip.getText()];
        ui.timerID = window.setInterval(() => {
            setTickingDownTime(textUpdateTargets, note.active);
        }, 1000);
    };

    // Recieves the following data:
    /*
        {
            order: 16,
            notes: [
                'm3,m2',
                'probably m3'
            ],
        }
    */
    this.handleNote = (note) => {
        // Build the note text from the "notes" array given by the server
        let newNote = '';
        for (let i = 0; i < note.notes.length; i++) {
            if (note.notes[i].length > 0) {
                newNote += `${ui.playerNames[i]}: ${note.notes[i]}\n`;
            }
        }
        if (newNote.length > 0) {
            newNote = newNote.slice(0, -1); // Chop off the trailing newline
        }

        // Set the note
        ui.setNote(note.order, newNote);

        // Draw (or hide) the note indicator
        const card = ui.deck[note.order];
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

    this.handleNotes = (note) => {
        // We recieved a new copy of all of our notes from the server
        notesWritten = note.notes;

        for (const order of Object.keys(notesWritten)) {
            // The following code is mosly copied from the "handleNote" function

            // Set the note
            const newNote = notesWritten[order];
            ui.setNote(order, newNote);

            // Draw (or hide) the note indicator
            const card = ui.deck[order];
            card.tooltip.getText().setText(newNote);
            if (newNote.length > 0) {
                card.noteGiven.show();
                if (ui.spectating) {
                    card.notePulse.play();
                }
            } else {
                card.noteGiven.hide();
                card.tooltip.hide();
            }
        }
        tipLayer.draw();
        UILayer.draw();
        cardLayer.draw();
    };

    this.handleReplayLeader = function handleReplayLeader(note) {
        this.sharedReplayLeader = note.name;

        sharedReplayLeaderLabel.show();
        const text = `Leader: ${this.sharedReplayLeader}`;
        sharedReplayLeaderLabelTooltip.getText().setText(text);

        if (this.sharedReplayLeader === lobby.username) {
            goToSharedTurnButton.hide();
            sharedReplayLeaderLabel.fill('yellow');
        } else {
            goToSharedTurnButton.show();
        }

        UILayer.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(note) {
        this.sharedReplayTurn = note.turn;
        if (this.sharedReplayLeader !== lobby.username) {
            this.performReplay(this.sharedReplayTurn);
        }
    };

    this.handleReplayMouse = (note) => {
        if (this.sharedReplayLeader === lobby.username) {
            // We only want to move the mouse if we are not the leader
            return;
        }

        // Draw the cursor so that we can see what the replay leader is clicking
        // on
        sharedReplayCursor.setX(note.x);
        sharedReplayCursor.setY(note.y);
        cursorLayer.draw();
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
        $(document).unbind('keydown', this.keyNavigation);
        if (ui.timerID !== null) {
            window.clearInterval(ui.timerID);
            ui.timerID = null;
        }
    };

    this.replayLog = [];
    this.replayPos = 0;
    this.replayTurn = 0;

    /*
        Shared replay cursor functionality
    */


    stage.on('click', (event) => {
        if (ui.sharedReplayLeader !== lobby.username) {
            // We only need to track mouse movement if we are the shared replay leader
            return;
        }

        if (event.evt.which !== 3) { // Right click
            // We only want to track right clicks, not left clicks
            return;
        }

        ui.sendMsg({
            type: 'replayAction',
            resp: {
                type: 1,
                cursor: {
                    x: event.evt.clientX,
                    y: event.evt.clientY,
                },
            },
        });
    });
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
        this.lastClock = msgData;
        // This is used for timed games
        this.handleClock.call(this, msgData);
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
    } else if (msgType === 'replayMouse') {
        // This is used in shared replays
        this.handleReplayMouse.call(this, msgData);
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
