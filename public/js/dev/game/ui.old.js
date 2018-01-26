function HanabiUI(lobby, gameID) {
    this.deck = [];

    this.playerNames = [];
    this.variant = 0;
    this.replay = false;
    this.sharedReplay = false;
    this.replayOnly = false;
    this.spectating = false;
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
    this.activeClockIndex = null;
    this.lastSpectators = null;

    // Initialize tooltips
    const tooltipThemes = [
        'tooltipster-shadow',
        'tooltipster-shadow-big',
    ];
    const tooltipOptions = {
        theme: tooltipThemes,
        delay: 0,
        trigger: 'custom',
        contentAsHTML: true,
        animation: 'grow',
        updateAnimation: null,
        interactive: true, /* So that users can update their notes */
    };
    for (let i = 0; i < 5; i++) {
        $('#game-tooltips').append(`<div id="tooltip-player-${i}"></div>`);
        $(`#tooltip-player-${i}`).tooltipster(tooltipOptions);
        const newThemes = tooltipThemes.slice();
        newThemes.push('align-center');
        $(`#tooltip-player-${i}`).tooltipster('instance').option('theme', newThemes);
    }
    $('#tooltip-spectators').tooltipster(tooltipOptions);
    $('#tooltip-leader').tooltipster(tooltipOptions);
    for (let i = 0; i < 60; i++) { // Matches card.order
        $('#game-tooltips').append(`<div id="tooltip-card-${i}"></div>`);
        $(`#tooltip-card-${i}`).tooltipster(tooltipOptions);
    }

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

        // This resets all the msgs so that everything shows up again,
        // since the server doesn't replay them and the client only draws streamed
        // information and doesn't maintain a full game state.
        if (self.replayOnly) {
            // Rebuilds for a replay.
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
        } else {
            // Rebuilds for a game
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

        // Update display
        text.setText(displayString);
        text.getLayer().batchDraw();

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

    function setTickingDownTimeTooltip(i) {
        let time = ui.playerTimes[i];
        if (!ui.timedGame) {
            // Invert it to show how much time each player is taking
            time *= -1;
        }

        let content = 'Time ';
        if (ui.timedGame) {
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
        const showLearnedCards = true;

        const rank =
            (showLearnedCards && learnedCard.rank) ||
            (!card.showOnlyLearned && card.rankKnown() && card.trueRank);

        const suit =
            (showLearnedCards && learnedCard.suit) ||
            (!card.showOnlyLearned && card.suitKnown() && card.trueSuit);

        // Do not select an image with pips while the dynamic suit pips are shown
        if (
            // the !suit condition is necessary for unclued cards with certain rank or suit in
            // other players' hands to display properly with empathy
            (
                !suit ||
                !card.suitKnown() ||
                (card.showOnlyLearned && card.possibleSuits.length > 1)
            ) && (
                // Cards are always known in a shared replay,
                // but we want to preserve the Empathy feature
                !ui.replayOnly || card.showOnlyLearned
            )
        ) {
            if (!card.rankKnown() && rank) {
                prefix = 'Index';
            } else {
                prefix = 'NoPip';
            }
        }

        // The previous huge 'if' expression isn't quite right, so sometimes it tries to call
        // for Card-Gray-6, when it should always ask for NoPip-Gray-6. This is a lazy fix.
        if ((!suit || suit === SUIT.GRAY) && (!rank || rank === 6)) {
            prefix = 'NoPip';
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
        if (ui.replayOnly) {
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
            let i = 0;
            for (const suit of suits) {
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
                    listening: false,
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
            if (posY < 20) { // 20 is just an arbitrary threshold that seems to be big enough for 1080p at least
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
            self.noteGiven.setFill('white');

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

        // Show teammate view of their hand
        const toggleHolderViewOnCard = (c, enabled) => {
            c.rankPips.setVisible(enabled);
            c.suitPips.setVisible(enabled);
            c.showOnlyLearned = enabled;
            c.setBareImage();
        };
        const endHolderViewOnCard = function endHolderViewOnCard() {
            const cardsToReset = toggledHolderViewCards.splice(0, toggledHolderViewCards.length);
            cardsToReset.forEach(c => toggleHolderViewOnCard(c, false));
            cardLayer.batchDraw();
        };
        const beginHolderViewOnCard = function beginHolderViewOnCard(cards) {
            if (toggledHolderViewCards.length > 0) {
                return; // data race with stop
            }

            toggledHolderViewCards.splice(0, 0, ...cards);
            cards.forEach(c => toggleHolderViewOnCard(c, true));
            cardLayer.batchDraw();
        };
        if (config.holder !== ui.playerUs || ui.replayOnly || ui.spectating) {
            const mouseButton = 1;
            this.on('mousedown', (event) => {
                if (event.evt.which !== mouseButton || !this.isInPlayerHand()) {
                    return;
                }

                ui.activeHover = this;
                const cards = this.parent.parent.children.map(c => c.children[0]);
                beginHolderViewOnCard(cards);
            });
            this.on('mouseup mouseout', (event) => {
                if (event.type === 'mouseup' && event.evt.which !== mouseButton) {
                    return;
                }
                endHolderViewOnCard();
            });
        }

        // Hide clue arrows ahead of user dragging their card
        if (config.holder === ui.playerUs && !ui.replayOnly && !ui.spectating) {
            this.on('mousedown', (event) => {
                if (
                    event.evt.which !== 1 || // dragging uses left click
                    ui.replay ||
                    !this.indicatorArrow.isVisible()
                ) {
                    return;
                }

                showClueMatch(-1);
                // Do not prevent default since the other event is starting
            });
        }

        this.on('click', (event) => {
            if (ui.sharedReplay && event.evt.which === 3 && ui.sharedReplayLeader === lobby.username) {
                // In a shared replay, the leader right-clicks a card to draw attention to it
                if (ui.useSharedTurns) {
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

            if (event.evt.which !== 3) { // Right-click
                // We only care about right clicks
                return;
            }

            // Don't edit any notes in shared replays
            if (ui.sharedReplay) {
                return;
            }

            // Don't open the edit tooltip if there is already some other edit tooltip open
            if (ui.editingNote !== null) {
                return;
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
                if (keyEvent.key !== 'Enter' && keyEvent.key !== 'Escape') {
                    return;
                }

                ui.editingNote = null;

                if (keyEvent.key === 'Escape') {
                    note = ui.getNote(self.order);
                    if (note === null) {
                        note = '';
                    }
                } else {
                    note = $(`#tooltip-card-${self.order}-input`).val();
                    ui.setNote(self.order, note);

                    // Also send the note to the server
                    if (!ui.replayOnly && !ui.spectating) {
                        ui.sendMsg({
                            type: 'note',
                            resp: {
                                order: self.order,
                                note,
                            },
                        });
                    }
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
        if (clue.type === CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            const findPipElement = suit => this.suitPips.find(`.${suit.name}`);
            const removed = filterInPlace(this.possibleSuits, suit => suit.clueColors.includes(clueColor) === positive);
            removed.forEach(suit => findPipElement(suit).hide());
            // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
            // display a non-grey card face
            if (this.possibleSuits.length === 1 && (!this.isInPlayerHand() || this.cluedBorder.visible())) {
                [this.trueSuit] = this.possibleSuits;
                findPipElement(this.trueSuit).hide();
                this.suitPips.hide();
                ui.learnedCards[this.order].suit = this.trueSuit;
            }
            // Ensure that the learned card data is not overwritten with less recent information
            filterInPlace(ui.learnedCards[this.order].possibleSuits, s => this.possibleSuits.includes(s));
        } else {
            const clueRank = clue.value;
            const findPipElement = rank => this.rankPips.find(`.${rank}`);
            const removed = filterInPlace(this.possibleRanks, rank => (rank === clueRank) === positive);
            removed.forEach(rank => findPipElement(rank).hide());
            // Don't mark unclued cards in your own hand with true suit or rank, so that they don't
            // display a non-grey card face
            if (this.possibleRanks.length === 1 && (!this.isInPlayerHand() || this.cluedBorder.visible())) {
                [this.trueRank] = this.possibleRanks;
                findPipElement(this.trueRank).hide();
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

        this.on('mousemove tap', () => {
            ui.activeHover = this;

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
        });

        this.on('mouseout', () => {
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
        if (!ui.sharedReplay) {
            return;
        }

        // Only proceed if we are the replay leader
        if (ui.sharedReplayLeader !== lobby.username) {
            return;
        }

        // Only proceed if we didn't right-click on ourselves
        if (username === lobby.username) {
            return;
        }

        ui.sendMsg({
            type: 'replayAction',
            resp: {
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
    let drawDeck;
    let messagePrompt;
    let clueLabel;
    let scoreLabel;
    let spectatorsLabel;
    let spectatorsNumLabel;
    let sharedReplayLeaderLabel;
    let sharedReplayLeaderLabelPulse;
    let strikes = [];
    const nameFrames = [];
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
    let replayExitButton;
    let lobbyButton;
    let helpButton;
    let helpGroup;
    let msgLogGroup;
    let overback;
    const notesWritten = []; // An array containing all of the player's notes, indexed by card order

    const overPlayArea = pos => (
        pos.x >= playArea.getX() &&
        pos.y >= playArea.getY() &&
        pos.x <= playArea.getX() + playArea.getWidth() &&
        pos.y <= playArea.getY() + playArea.getHeight()
    );

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
            this.positionReplayShuttles();
            UILayer.draw();
        }
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
        if (note === '') {
            note = undefined;
        }
        notesWritten[order] = note;
    };

    this.handleSpectators = (data) => {
        const shouldShowLabel = data.names.length > 0;
        spectatorsLabel.setVisible(shouldShowLabel);
        spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectatorsNumLabel.setText(data.names.length);

            // Build the string that shows all the names
            const nameEntries = data.names.map((name, i) => `<li>${name}</li>`).join('');
            const content = `<strong>Spectators:</strong><ol class="game-tooltips-ol">${nameEntries}</ol>`;
            $('#tooltip-spectators').tooltipster('instance').content(content);
        } else {
            $('#tooltip-spectators').tooltipster('close');
        }
        UILayer.batchDraw();
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
            const note = data.notes[i];
            if (note !== null && note !== '') {
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
        if (!card) {
            return;
        }

        // Show or hide the white square
        if (newNote.length > 0 && card.isInPlayerHand()) {
            card.noteGiven.show();
            card.noteGiven.setFill('yellow');
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
            const card = ui.deck[order];
            if (!card) {
                continue;
            }
            if (note !== null && note !== '') {
                card.note = note;
            }
            if (note !== null && note !== '' && card.isInPlayerHand()) {
                card.noteGiven.show();
                if (ui.spectating) {
                    card.noteGiven.setFill('yellow');
                }
            }
        }

        cardLayer.batchDraw();
    };

    this.handleReplayLeader = function handleReplayLeader(data) {
        // We might be entering this function after a game just ended
        this.sharedReplay = true;
        replayExitButton.hide();

        // Update the stored replay leader
        this.sharedReplayLeader = data.name;

        // Update the UI
        sharedReplayLeaderLabel.show();
        const content = `<strong>Leader:</strong> ${this.sharedReplayLeader}`;
        $('#tooltip-leader').tooltipster('instance').content(content);

        if (this.sharedReplayLeader === lobby.username) {
            sharedReplayLeaderLabel.fill('yellow');
        } else {
            sharedReplayLeaderLabel.fill('white');
        }
        sharedReplayLeaderLabelPulse.play();

        toggleSharedTurnButton.show();
        UILayer.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(data) {
        this.sharedReplayTurn = data.turn;
        this.positionReplayShuttles();
        if (ui.useSharedTurns) {
            this.performReplay(this.sharedReplayTurn);
        } else {
            replayShuttleShared.getLayer().batchDraw();
        }
    };

    this.handleReplayIndicator = (data) => {
        const indicated = ui.deck[data.order];
        if (indicated && indicated.isInPlayerHand() && ui.useSharedTurns) {
            showClueMatch(-1);
            indicated.setIndicator(true, INDICATOR.REPLAY_LEADER);
        }
    };

    let lastAction = null;

    this.handleAction = function handleAction(data) {
        const self = this;

        lastAction = data;

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
                    lastAction = null;
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
                    lastAction = null;
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

            lastAction = null;
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
