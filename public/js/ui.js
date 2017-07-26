let showReplayPartialFaces = true;

function HanabiUI(lobby, gameID) {
    this.showDebugMessages = true;

    this.lobby = lobby;
    this.gameID = gameID;

    const ui = this;

    const ACT = constants.ACT;
    const CLUE_TYPE = constants.CLUE_TYPE;
    const VARIANT = constants.VARIANT;
    const SHAPE = constants.SHAPE;
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
    this.sharedReplay_leader = ''; // Equal to the username of the shared replay leader
    this.sharedreplayTurn = -1;
    this.replayOnly = false;
    this.spectating = false;
    this.replay_max = 0;
    this.animateFast = true;
    this.ready = false;
    // In replays, we can show a grayed-out version of a card face if it was not known at the time, but we know it now
    // These are cards we have "learned"
    this.learnedCards = [];

    this.activeHover = null;

    // A function called after an action from the server moves cards
    this.postAnimationLayout = null;

    this.timedGame = false;
    this.lastTimerUpdateTimeMS = new Date().getTime();

    this.playerTimes = [];
    this.timerID = null;

    const Clue = function Clue(type, value) {
        this.type = type;
        this.value = value;
    };
    // Convert a clue to the format used by the server, which is identical but for
    // the color value; for the client it is a rich object and for the server
    // a simple integer mapping
    const clueToMsgClue = (clue, variant) => {
        let {type: clueType, value: clueValue} = clue;
        if (clueType === CLUE_TYPE.COLOR) {
            let clueColor = clueValue;
            msgClueValue = variant.clueColors.findIndex(
                color => color === clueColor,
            );
        } else { // Rank clue
            msgClueValue = clueValue;
        }
        return {
            type: clueType,
            value: msgClueValue,
        };
    };

    const msgClueToClue = (msgClue, variant) => {
        let {type: clueType, value: msgClueValue} = msgClue;
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

    // textObjects are expected to be on the timerlayer or tiplayer
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
        timerlayer.draw();
        tiplayer.draw();

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
        if (!card.unknown) {
            let name = 'card-';
            name += ui.variant.suits.findIndex(
                suit => suit === card.suit,
            );
            name += `-${card.rank}`;
            return name;
        }

        // TODO: name
        const learned = ui.learnedCards[card.order];
        if (ui.replay && learned && (learned.revealed || showReplayPartialFaces)) {
            let name = 'card-';
            if (learned.suit === undefined) {
                // Gray suit
                // TODO: need to change this if we ever add a 7th suit
                name += 6;
            } else {
                name += ui.variant.suits.findIndex(
                    suit => suit === learned.suit,
                );
            }
            name += '-';
            if (learned.rank === undefined) {
                name += 6;
            } else {
                name += learned.rank;
            }
            return name;
        }

        return 'card-back';
    }

    const scaleCardImage = function scaleCardImage(context, name) {
        const width = this.getWidth();
        const height = this.getHeight();
        const am = this.getAbsoluteTransform();
        let src = card_images[name];

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
        this.needs_resize = true;

        this.setDrawFunc(function setDrawFunc(context) {
            if (this.needs_resize) {
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

        this.needs_resize = false;
    };

    FitText.prototype.setText = function setText(text) {
        Kinetic.Text.prototype.setText.call(this, text);

        this.needs_resize = true;
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


        this.player_logs = [];
        this.player_lognumbers = [];
        for (let i = 0; i < ui.playerNames.length; i++) {
            this.player_logs[i] = new MultiFitText(textoptions);
            this.player_logs[i].hide();
            Kinetic.Group.prototype.add.call(this, this.player_logs[i]);


            this.player_lognumbers[i] = new MultiFitText(numbersoptions);
            this.player_lognumbers[i].hide();
            Kinetic.Group.prototype.add.call(this, this.player_lognumbers[i]);
        }
    };

    Kinetic.Util.extend(HanabiMsgLog, Kinetic.Group);

    HanabiMsgLog.prototype.addMessage = function addMessage(msg) {
        const appendLine = (log, numbers, line) => {
            log.setMultiText(line);
            numbers.setMultiText(drawdeck.getCount());
        };

        appendLine(this.logtext, this.lognumbers, msg);
        for (let i = 0; i < ui.playerNames.length; i++) {
            if (msg.startsWith(ui.playerNames[i])) {
                appendLine(this.player_logs[i], this.player_lognumbers[i], msg);
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
        this.player_logs[playerIDX].show();
        this.player_lognumbers[playerIDX].show();

        this.show();

        overback.show();
        overlayer.draw();

        const thislog = this;
        overback.on('click tap', () => {
            overback.off('click tap');
            thislog.player_logs[playerIDX].hide();
            thislog.player_lognumbers[playerIDX].hide();

            thislog.logtext.show();
            thislog.lognumbers.show();
            thislog.hide();
            overback.hide();
            overlayer.draw();
        });
    };

    HanabiMsgLog.prototype.refreshText = function refreshText() {
        this.logtext.refreshText();
        this.lognumbers.refreshText();
        for (let i = 0; i < ui.playerNames.length; i++) {
            this.player_logs[i].refreshText();
            this.player_lognumbers[i].refreshText();
        }
    };

    HanabiMsgLog.prototype.reset = function reset() {
        this.logtext.reset();
        this.lognumbers.reset();
        for (let i = 0; i < ui.playerNames.length; i++) {
            this.player_logs[i].reset();
            this.player_lognumbers[i].reset();
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

        this.unknown = (config.suit === undefined);
        this.suit = config.suit || 0;
        this.rank = config.rank || 0;
        this.order = config.order;

        if (!this.unknown) {
            ui.learnedCards[this.order] = {
                suit: this.suit,
                rank: this.rank,
            };
        }

        this.barename = '';

        this.setBareImage();

        // unknownRect is a transparent white overlay box we can draw over the card.
        // The point is that when they're in a replay, and they know things in the PRESENT about the card they're viewing
        // in the PAST, we show them a card face. If that card face is just implied by clues, it gets a white box. If it's known
        // by seeing the true card face in the present, we show no white box. This way people won't be mislead as much
        // if the card is multi.
        const replayPartialPresentKnowledge = (
            showReplayPartialFaces &&
            ui.replay &&
            this.unknown &&
            ui.learnedCards[this.order] !== undefined &&
            !ui.learnedCards[this.order].revealed
        );
        this.unknownRect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: config.width,
            height: config.height,
            cornerRadius: 20,
            fill: '#cccccc',
            opacity: 0.4,
            visible: replayPartialPresentKnowledge,
        });
        this.add(this.unknownRect);

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

        this.colorClueGroup = new Kinetic.Group({
            x: 0.3 * config.width,
            y: 0.1 * config.height,
            width: 0.4 * config.width,
            height: 0.282 * config.height,
            visible: false,
        });

        this.add(this.colorClueGroup);

        this.colorClue = new Kinetic.Rect({
            width: 0.4 * config.width,
            height: 0.282 * config.height,
            stroke: 'black',
            strokeWidth: 12,
            cornerRadius: 12,
            fillLinearGradientStartPoint: {
                x: 0,
                y: 0,
            },
            fillLinearGradientEndPoint: {
                x: 0.4 * config.width,
                y: 0.282 * config.height,
            },
            fillLinearGradientColorStops: [
                0,
                'black',
            ],
        });

        this.colorClueGroup.add(this.colorClue);

        this.colorClue_question_mark = new Kinetic.Text({
            width: 0.4 * config.width,
            height: 0.282 * config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: 0.2 * config.height,
            fill: '#d8d5ef',
            stroke: 'black',
            strokeWidth: 4,
            shadowOpacity: 0.9,
            shadowColor: 'black',
            shadowOffset: {
                x: 0,
                y: 1,
            },
            shadowBlur: 2,
            text: '?',
            visible: (ui.variant === VARIANT.MIXED || ui.variant === VARIANT.MM),
            y: 12, // Move it downwards a bit from the default location
        });
        this.colorClueGroup.add(this.colorClue_question_mark);

        this.colorClueLetter = new Kinetic.Text({
            width: 0.4 * config.width,
            height: 0.282 * config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: 0.25 * config.height,
            fill: '#d8d5ef',
            stroke: 'black',
            strokeWidth: 4,
            shadowOpacity: 0.9,
            shadowColor: 'black',
            shadowOffset: {
                x: 0,
                y: 1,
            },
            shadowBlur: 2,
            text: '',
            visible: lobby.showColorblindUI,
        });
        this.colorClueGroup.add(this.colorClueLetter);

        this.number_clue = new Kinetic.Text({
            x: 0.3 * config.width,
            y: 0.5 * config.height,
            width: 0.4 * config.width,
            height: 0.282 * config.height,
            align: 'center',
            fontFamily: 'Verdana',
            fontSize: 0.282 * config.height,
            fill: '#d8d5ef',
            stroke: 'black',
            strokeWidth: 4,
            shadowOpacity: 0.9,
            shadowColor: 'black',
            shadowOffset: {
                x: 0,
                y: 1,
            },
            shadowBlur: 2,
            text: '?',
            visible: false,
        });

        this.add(this.number_clue);

        // Draw the circle that is the "clue indicator" on the card
        this.clue_given = new Kinetic.Circle({
            x: 0.9 * config.width,
            y: (ui.variant === VARIANT.MIXED || ui.variant === VARIANT.MM ? 0.2 : 0.1) * config.height,
            radius: 0.05 * config.width,
            fill: 'white',
            stroke: 'black',
            strokeWidth: 4,
            visible: false,
        });

        this.add(this.clue_given);

        // Define the "note indicator" square
        this.note_given = new Kinetic.Rect({
            x: 0.854 * config.width,
            y: (ui.variant === VARIANT.MIXED || ui.variant === VARIANT.MM ? 0.26 : 0.165) * config.height,
            width: 0.09 * config.width,
            height: 0.09 * config.width,
            fill: 'white',
            stroke: 'black',
            strokeWidth: 4,
            visible: false,
        });

        this.add(this.note_given);

        // Create the note tooltip
        this.tooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });
        // (there's a bug that Hyphen can't figure out where it permanently draws a
        // copy of the tag at this location, so we can work around it by setting the
        // starting location to be off screen)

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

        tiplayer.add(this.tooltip);

        this.on('mousemove', () => {
            if (self.note_given.visible()) {
                const mousePos = stage.getPointerPosition();
                self.tooltip.setX(mousePos.x + 15);
                self.tooltip.setY(mousePos.y + 5);

                self.tooltip.show();
                tiplayer.draw();
            }
            ui.activeHover = this;
        });

        this.on('mouseout', () => {
            self.tooltip.hide();
            tiplayer.draw();
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
            this.note_given.show();
        }
        this.addListeners();
    };

    HanabiCard.prototype.addListeners = function addListeners() {
        const self = this;

        this.on('mousemove tap', () => {
            clueLog.showMatches(self);
            uilayer.draw();
        });

        this.on('mouseout', () => {
            clueLog.showMatches(null);
            uilayer.draw();
        });

        this.on('click', (event) => {
            if (event.evt.which === 3) { // Right click
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
                    self.note_given.show();
                } else {
                    self.note_given.hide();
                    self.tooltip.hide();
                    tiplayer.draw();
                }
                uilayer.draw();
                cardlayer.draw();

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
            }
        });
    };

    HanabiCard.prototype.setBareImage = function setBareImage() {
        if (this.unknownRect !== undefined) {
            const learned = ui.learnedCards[this.order];
            // If we're in a replay, we have knowledge about the card, but we don't
            // know the ACTUAL card
            if (
                showReplayPartialFaces &&
                ui.replay &&
                this.unknown &&
                learned &&
                !learned.revealed
            ) {
                this.unknownRect.setVisible(true);
            } else {
                this.unknownRect.setVisible(false);
            }
        }

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

    HanabiCard.prototype.addClue = function addClue(clue) {
        if (!ui.learnedCards[this.order]) {
            ui.learnedCards[this.order] = {};
        }

        if (clue.type === CLUE_TYPE.COLOR) {
            // Draw the color squares
            const grad = this.colorClue.getFillLinearGradientColorStops();
            const clueColor = clue.value;
            const clueColorCode = clue.value.hex_code;
            if (grad.length === 2) {
                this.colorClue.setFillLinearGradientColorStops([
                    0,
                    clueColorCode,
                    1,
                    clueColorCode,
                ]);
                this.colorClueLetter.setText(clueColor.abbreviation);
            } else if (grad[1] === grad[3]) {
                if (ui.variant === VARIANT.MIXED) {
                    // Find out the array index of these clue colors
                    const clueColor1 = ui.variant.clueColors.find(
                        color => color.hex_code === grad[1],
                    );
                    const clueColor2 = ui.variant.clueColors.find(
                        color => color.hex_code === grad[3],
                    );

                    // The index will not be set above if we already changed it to the true mixed color
                    // So, do nothing if that is the case
                    if (clueColor1 && clueColor2 && (clueColor1 !== clueColor2)) {
                        // Find the index of the mixed suit that matches these two colors
                        for (const suit of ui.variant.suits) {
                            const clueColors = suit.clueColors;
                            if (clueColors.includes(clueColor1) || clueColors.includes(clueColor2)) {
                                grad[1] = suit.fill_color.hex_code;
                                grad[3] = suit.fill_color.hex_code;
                                this.colorClue.setFillLinearGradientColorStops(grad);
                                break;
                            }
                        }

                        // Get rid of the question mark
                        this.colorClue_question_mark.hide();
                    }
                } else {
                    // Change the solid color to a gradient mixing the two clues
                    grad[3] = clueColor.hex_code;
                    this.colorClue.setFillLinearGradientColorStops(grad);
                    this.colorClueLetter.setText('M');
                }
            } else if (ui.variant !== VARIANT.MIXED) {
                // We don't need to add a third (or 4th, 5th, etc.) color in the mixed variant
                if (grad[grad.length - 1] === clueColor) {
                    return;
                }

                for (let i = 0; i < grad.length; i += 2) {
                    grad[i] = 1.0 * (i / 2) / (grad.length / 2);
                }
                grad.push(1);
                grad.push(clueColor);
                this.colorClue.setFillLinearGradientColorStops(grad);
                this.colorClueLetter.setText('M');
            }

            this.colorClueGroup.show();

            const suitCorrespondingToColor = ui.variant.suits.find(
                suit => suit.clueColors.includes(clue.value),
            );
            if (ui.variant === VARIANT.MIXED || ui.variant === VARIANT.MM) {
                // TODO Distinguishing suits from colors is not supported yet.
                // ui.learnedCards[this.order].suit may be a correct suit index from a play or discard
            } else if (ui.learnedCards[this.order].suit === undefined) {
                ui.learnedCards[this.order].suit = suitCorrespondingToColor;
            } else if (ui.learnedCards[this.order].suit !== suitCorrespondingToColor) {
                // Card has multiple colors; set suit to Rainbow
                ui.learnedCards[this.order].suit = SUIT.MULTI;
            }
        } else {
            this.number_clue.setText(clue.value.toString());
            this.number_clue.show();
            ui.learnedCards[this.order].rank = clue.value;
        }
    };

    HanabiCard.prototype.hideClues = function hideClues() {
        this.colorClueGroup.hide();
        this.number_clue.hide();
        this.clue_given.hide();
        this.note_given.hide();
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

    CardLayout.prototype.doLayout = function() {
        let lw, lh;
        let i, n, node, scale;
        let uw = 0, dist = 0, x = 0;

        lw = this.getWidth();
        lh = this.getHeight();

        n = this.children.length;

        for (i = 0; i < n; i++) {
            node = this.children[i];

            if (!node.getHeight()) {
                continue;
            }

            scale = lh / node.getHeight();

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

        let storedPostAnimationLayout = ui.postAnimationLayout;

        for (i = 0; i < n; i++) {
            node = this.children[i];

            if (!node.getHeight()) {
                continue;
            }

            scale = lh / node.getHeight();

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
            image: card_images[config.cardback],
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
        let node;
        let lw, lh;
        let i, n;
        let scale;

        lw = this.getWidth();
        lh = this.getHeight();

        n = this.children.length;

        const hide_under = () => {
            let n = self.children.length;
            for (let i = 0; i < n; i++) {
                let node = self.children[i];

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

        for (i = 0; i < n; i++) {
            node = this.children[i];

            scale = lh / node.getHeight();

            if (node.tween) {
                node.tween.destroy();
            }

            if (ui.animateFast) {
                node.setX(0);
                node.setY(0);
                node.setScaleX(scale);
                node.setScaleY(scale);
                node.setRotation(0);
                hide_under();
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
                    onFinish: hide_under,
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

        this.target_index = config.target_index;

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

            cardlayer.batchDraw();
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

        return player_hands.indexOf(ui.deck[c].parent.parent) !== -1;
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

    const HanabiNameFrame = function(config) {
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
            msgloggroup.showPlayerActions(nameTextObject.getText());
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
        this.num_loaded = 0;

        for (const name of Object.keys(this.filemap)) {
            const img = new Image();

            this.map[name] = img;

            img.onload = () => {
                self.num_loaded += 1;

                self.progress(self.num_loaded, total);

                if (self.num_loaded === total) {
                    self.cb();
                }
            };

            img.src = self.filemap[name];
        }

        self.progress(0, total);
    };

    Loader.prototype.progress = function progress(done, total) {
        if (this.progress_callback) {
            this.progress_callback(done, total);
        }
    };

    Loader.prototype.get = function get(name) {
        return this.map[name];
    };

    const ImageLoader = new Loader(function() {
        notesWritten = ui.load_notes();

        ui.build_cards();
        ui.build_ui();
        ui.sendMsg({
            type: 'ready',
            resp: {},
        });
        ui.ready = true;
    });

    this.loadImages = function() {
        ImageLoader.start();
    };

    var showClueMatch = function(target, clue, showNeg) {
        var child;
        var card, match = false;

        for (let i = 0; i < ui.playerNames.length; i++) {
            if (i === target) {
                continue;
            }

            for (let j = 0; j < player_hands[i].children.length; j++) {
                child = player_hands[i].children[j];

                card = child.children[0];

                card.setIndicator(false);
            }
        }

        cardlayer.batchDraw();

        if (target < 0) {
            return;
        }

        for (let i = 0; i < player_hands[target].children.length; i++) {
            child = player_hands[target].children[i];
            card = child.children[0];

            let touched = false;
            if (clue.type === CLUE_TYPE.RANK) {
                if (clue.value === card.rank) {
                    touched = true;
                }

            } else { // color clue
                let clueColor = clue.value;
                if (card.suit === SUIT.MULTI || card.suit.clueColors.includes(clueColor)) {
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

        cardlayer.batchDraw();

        return match;
    };

    var card_images = {};
    var scaleCardImages = {};

    this.build_cards = function() {
        var cvs, ctx;
        var xrad = CARDW * 0.08, yrad = CARDH * 0.08;
        var rainbow = false;
        var mixed = false;
        var mm = false;

        if (this.variant === VARIANT.RAINBOW) {
            rainbow = true;
        } else if (this.variant === VARIANT.MIXED) {
            mixed = true;
            showReplayPartialFaces = false;
        } else if (this.variant === VARIANT.MM) {
            rainbow = true;
            mm = true;
        }

        // 0-5 are the real suits; 6 is a "white" suit for replays
        let suits = this.variant.suits.concat(SUIT.GRAY);
        {
            let i = 0;
            for (let suit of suits) {
                // 0 is the stack base. 1-5 are the cards 1-5. 6 is a numberless card for replays.
                for (let j = 0; j < 7; j++) {
                    cvs = document.createElement('canvas');
                    cvs.width = CARDW;
                    cvs.height = CARDH;

                    // will this be erroneous for novariant since it has only 5
                    // suits?
                    let name = 'card-' + i + '-' + j;
                    card_images[name] = cvs;

                    ctx = cvs.getContext('2d');

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

                    // Draw the background
                    ctx.fillStyle = suit.style(ctx, CARD_AREA.BACKGROUND);
                    ctx.strokeStyle = suit.style(ctx, CARD_AREA.BACKGROUND);

                    backpath(ctx, 4, xrad, yrad);
                    ctx.save();

                    // Draw the borders (on visible cards) and the color fill
                    ctx.globalAlpha = 0.3;
                    ctx.fill();
                    ctx.globalAlpha = 0.7;
                    ctx.lineWidth = 8;
                    ctx.stroke();
                    ctx.restore();

                    ctx.shadowBlur = 10;
                    ctx.fillStyle = suit.style(ctx, CARD_AREA.NUMBER);

                    var suit_letter = suit.abbreviation;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    ctx.lineJoin = 'round';
                    var text_y_pos = 110;
                    ctx.font = 'bold 96pt Arial';
                    var index_label = j.toString();
                    if (j === 6) {
                        index_label = '';
                    }

                    if (lobby.showColorblindUI) {
                        ctx.font = 'bold 68pt Arial';
                        text_y_pos = 83;
                        index_label = suit_letter + index_label;
                    }

                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillText(index_label, 19, text_y_pos);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    ctx.strokeText(index_label, 19, text_y_pos);
                    ctx.save();

                    ctx.translate(CARDW, CARDH);
                    ctx.rotate(Math.PI);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                    ctx.fillText(index_label, 19, text_y_pos);
                    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                    ctx.strokeText(index_label, 19, text_y_pos);
                    ctx.restore();

                    ctx.fillStyle = suit.style(ctx, CARD_AREA.SYMBOL);

                    ctx.lineWidth = 5;
                    if (suit !== SUIT.GRAY) {
                        let pathfunc = PATHFUNC.get(suit.shape);
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

                        // Top and bottom for cards 3, 4, 5
                        if (j > 1 && j !== 6) {
                            var symbol_y_pos = 120;
                            if (lobby.showColorblindUI) {
                                symbol_y_pos = 85;
                            }
                            ctx.save();
                            ctx.translate(CARDW / 2, CARDH / 2);
                            ctx.translate(0, -symbol_y_pos);
                            ctx.scale(0.4, 0.4);
                            ctx.translate(-75, -100);
                            pathfunc(ctx);
                            drawshape(ctx);
                            ctx.restore();

                            ctx.save();
                            ctx.translate(CARDW / 2, CARDH / 2);
                            ctx.translate(0, symbol_y_pos);
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

                        if (j === 0) {
                            ctx.clearRect(0, 0, CARDW, CARDH);
                            if (lobby.showColorblindUI) {
                                ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
                                ctx.fillText(suit_letter, 19, 83);
                                ctx.shadowColor = 'rgba(0, 0, 0, 0)';
                                ctx.strokeText(suit_letter, 19, 83);
                            }
                        }

                        // Colour adjustment for the central icon on cards 1 and 5
                        if (j === 0 || j === 5) {
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
                    let clueColors = suit.clueColors;
                    if (clueColors.length === 2) {
                        let [clueColor1, clueColor2] = suit.clueColors;

                        ctx.save();

                        ctx.lineWidth = 1;

                        let triangleSize = 50;
                        let borderSize = 8;

                        // Draw the first half of the top-right triangle
                        ctx.beginPath();
                        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top right-hand corner
                        ctx.lineTo(CARDW - borderSize - triangleSize, borderSize); // Move left
                        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move down and right diagonally
                        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
                        ctx.fillStyle = clueColor1.hex_code;
                        drawshape(ctx);

                        // Draw the second half of the top-right triangle
                        ctx.beginPath();
                        ctx.moveTo(CARDW - borderSize, borderSize); // Start at the top right-hand corner
                        ctx.lineTo(CARDW - borderSize, borderSize + triangleSize); // Move down
                        ctx.lineTo(CARDW - borderSize - (triangleSize / 2), borderSize + (triangleSize / 2)); // Move up and left diagonally
                        ctx.moveTo(CARDW - borderSize, borderSize); // Move back to the beginning
                        ctx.fillStyle = clueColor2.hex_code;
                        drawshape(ctx);

                        // Draw the first half of the bottom-left triangle
                        ctx.beginPath();
                        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
                        ctx.lineTo(borderSize, CARDH - borderSize - triangleSize); // Move up
                        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2)); // Move right and down diagonally
                        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
                        ctx.fillStyle = clueColor1.hex_code;
                        drawshape(ctx);

                        // Draw the second half of the bottom-left triangle
                        ctx.beginPath();
                        ctx.moveTo(borderSize, CARDH - borderSize); // Start at the bottom right-hand corner
                        ctx.lineTo(borderSize + triangleSize, CARDH - borderSize); // Move right
                        ctx.lineTo(borderSize + (triangleSize / 2), CARDH - borderSize - (triangleSize / 2)); // Move left and up diagonally
                        ctx.moveTo(borderSize, CARDH - borderSize); // Move back to the beginning
                        ctx.fillStyle = clueColor2.hex_code;
                        drawshape(ctx);

                        ctx.restore();
                    }
                }
                ++i;
            }
        }

        cvs = document.createElement('canvas');
        cvs.width = CARDW;
        cvs.height = CARDH;

        ctx = cvs.getContext('2d');

        card_images['card-back'] = cvs;

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

        // Draw the shapes on the gray cardback
        {
            let i = 0;
            for (let shape of [SHAPE.DIAMOND, SHAPE.CLUB, SHAPE.STAR, SHAPE.HEART, SHAPE.CRESCENT]) {
                ctx.save();
                ctx.translate(0, -90);
                ctx.scale(0.4, 0.4);
                ctx.rotate(-i * Math.PI * 2 / 5);
                ctx.translate(-75, -100);
                PATHFUNC.get(shape)(ctx);
                drawshape(ctx);
                ctx.restore();

                ctx.rotate(Math.PI * 2 / 5);
                ++i;
            }
        }
    };

    var size_stage = function(stage) {
        var ww = window.innerWidth;
        var wh = window.innerHeight;
        var cw, ch;

        if (ww < 640) {
            ww = 640;
        }
        if (wh < 360) {
            wh = 360;
        }

        var ratio = 1.777;

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

    var stage = new Kinetic.Stage({
        container: 'game',
    });

    size_stage(stage);

    var winW = stage.getWidth();
    var winH = stage.getHeight();

    var bglayer     = new Kinetic.Layer();
    var cardlayer   = new Kinetic.Layer();
    var uilayer     = new Kinetic.Layer();
    var overlayer   = new Kinetic.Layer();
    var tiplayer    = new Kinetic.Layer();
    var timerlayer  = new Kinetic.Layer();

    var player_hands = [];
    var drawdeck;
    var message_prompt, clue_label, score_label;
    var spectators_label, spectators_num_label, spectators_label_tooltip;
    var sharedReplay_leader_label, sharedReplay_leader_label_tooltip;
    var strikes = [];
    var name_frames = [];
    var play_stacks = new Map(), discard_stacks = new Map();
    var play_area, discard_area, clueLog;
    var clue_area, clue_target_button_group, clueButton_group, submitClue;
    var timerRect1, timerLabel1, timerText1;
    var timerRect2, timerLabel2, timerText2;
    var noClueLabel, no_clue_box, no_discard_label, deck_play_available_label;
    var replay_area, replay_bar, replay_shuttle, replay_button;
    var go_to_shared_turn_button; // Used in shared replays
    var lobby_button, help_button;
    var helpgroup;
    var msgloggroup, overback;
    var notesWritten = {};

    var overPlayArea = function(pos) {
        return pos.x >= play_area.getX() &&
               pos.y >= play_area.getY() &&
               pos.x <= play_area.getX() + play_area.getWidth() &&
               pos.y <= play_area.getY() + play_area.getHeight();
    };

    this.build_ui = function() {
        const self = this;
        var x, y, width, height, offset, radius;
        var rect, img, text, button;
        var suits = 5;

        if (this.variant !== VARIANT.NONE) {
            suits = 6;
        }

        var layers = stage.getLayers();

        for (let i = 0; i < layers.length; i++) {
            layers[i].remove();
        }

        var background = new Kinetic.Image({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            image: ImageLoader.get('background'),
        });

        bglayer.add(background);

        play_area = new Kinetic.Rect({
            x: 0.183 * winW,
            y: 0.3 * winH,
            width: 0.435 * winW,
            height: 0.189 * winH,
        });

        discard_area = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.2 * winW,
            height: 0.4 * winH,
        });

        no_discard_label = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            stroke: '#df1c2d',
            strokeWidth: 0.007 * winW,
            cornerRadius: 0.01 * winW,
            visible: false,
        });

        uilayer.add(no_discard_label);

        rect = new Kinetic.Rect({
            x: 0.8 * winW,
            y: 0.6 * winH,
            width: 0.19 * winW,
            height: 0.39 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });

        bglayer.add(rect);

        img = new Kinetic.Image({
            x: 0.82 * winW,
            y: 0.62 * winH,
            width: 0.15 * winW,
            height: 0.35 * winH,
            opacity: 0.2,
            image: ImageLoader.get('trashcan'),
        });

        bglayer.add(img);

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

        bglayer.add(rect);

        rect.on('click tap', function() {
            msgloggroup.show();
            overback.show();

            overlayer.draw();

            overback.on('click tap', function() {
                overback.off('click tap');

                msgloggroup.hide();
                overback.hide();

                overlayer.draw();
            });
        });

        message_prompt = new MultiFitText({
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

        uilayer.add(message_prompt);

        overback = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: winW,
            height: winH,
            opacity: 0.3,
            fill: 'black',
            visible: false,
        });

        overlayer.add(overback);

        msgloggroup = new HanabiMsgLog();

        overlayer.add(msgloggroup);

        rect = new Kinetic.Rect({
            x: 0.66 * winW,
            y: 0.81 * winH,
            width: 0.13 * winW,
            height: 0.18 * winH,
            fill: 'black',
            opacity: 0.2,
            cornerRadius: 0.01 * winW,
        });

        bglayer.add(rect);

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

            bglayer.add(rect);
        }

        clue_label = new Kinetic.Text({
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

        uilayer.add(clue_label);

        score_label = new Kinetic.Text({
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

        uilayer.add(score_label);

        /*
            The 'eyes' symbol to show that one or more people are spectating the game
        */

        spectators_label = new Kinetic.Text({
            x: 0.583 * winW,
            y: 0.9 * winH,
            width: 0.11 * winW,
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
        uilayer.add(spectators_label);

        /*
            Tooltip for the eyes
        */

        spectators_label_tooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });

        spectators_label_tooltip.add(new Kinetic.Tag({
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

        spectators_label_tooltip.add(new Kinetic.Text({
            fill: 'white',
            align: 'left',
            padding: 0.01 * winH,
            fontSize: 0.04 * winH,
            minFontSize: 0.02 * winH,
            width: 0.225 * winW,
            fontFamily: 'Verdana',
            text: '',
        }));

        tiplayer.add(spectators_label_tooltip);
        spectators_label.tooltip = spectators_label_tooltip;

        spectators_label.on('mousemove', function() {
            var mousePos = stage.getPointerPosition();
            this.tooltip.setX(mousePos.x + 15);
            this.tooltip.setY(mousePos.y + 5);

            this.tooltip.show();
            tiplayer.draw();

            ui.activeHover = this;
        });

        spectators_label.on('mouseout', function() {
            this.tooltip.hide();
            tiplayer.draw();
        });

        /*
            End tooltip
        */

        spectators_num_label = new Kinetic.Text({
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
        uilayer.add(spectators_num_label);

        /*
            Shared replay leader indicator
        */

        sharedReplay_leader_label = new Kinetic.Text({
            x: 0.583 * winW,
            y: 0.85 * winH,
            width: 0.11 * winW,
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
        uilayer.add(sharedReplay_leader_label);

        /*
            Tooltip for the crown
        */

        sharedReplay_leader_label_tooltip = new Kinetic.Label({
            x: -1000,
            y: -1000,
        });

        sharedReplay_leader_label_tooltip.add(new Kinetic.Tag({
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

        sharedReplay_leader_label_tooltip.add(new Kinetic.Text({
            fill: 'white',
            align: 'left',
            padding: 0.01 * winH,
            fontSize: 0.04 * winH,
            minFontSize: 0.02 * winH,
            width: 0.2 * winW,
            fontFamily: 'Verdana',
            text: '',
        }));

        tiplayer.add(sharedReplay_leader_label_tooltip);
        sharedReplay_leader_label.tooltip = sharedReplay_leader_label_tooltip;

        sharedReplay_leader_label.on('mousemove', function() {
            var mousePos = stage.getPointerPosition();
            this.tooltip.setX(mousePos.x + 15);
            this.tooltip.setY(mousePos.y + 5);

            this.tooltip.show();
            tiplayer.draw();

            ui.activeHover = this;
        });

        sharedReplay_leader_label.on('mouseout', function() {
            this.tooltip.hide();
            tiplayer.draw();
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

        bglayer.add(rect);

        clueLog = new HanabiClueLog({
            x: 0.81 * winW,
            y: 0.02 * winH,
            width: 0.17 * winW,
            height: 0.56 * winH,
        });

        uilayer.add(clueLog);

        var pileback;

        if (this.variant.suits.length === 6) {
            y = 0.04;
            width = 0.06;
            height = 0.151;
            offset = 0.019;
            radius = 0.004;
        } else { // 5 stacks
            y = 0.05;
            width = 0.075;
            height = 0.189;
            offset = 0;
            radius = 0.006;
        }

        // TODO: move blocks like this into their own functions
        {
            let i = 0;
            for (let suit of this.variant.suits) {
                // In the play area, fill in the rectangles with the fill colors for that suit

                // I guess we can't use a gradient here? So much for my design
                let ctx = null;
                let fillColor = (suit === SUIT.MULTI) ? '#111111' : suit.style(ctx, CARD_AREA.BACKGROUND);
                pileback = new Kinetic.Rect({
                    fill: fillColor,
                    opacity: 0.4,
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (0.345 + offset) * winH,
                    width: width * winW,
                    height: height * winH,
                    cornerRadius: radius * winW,
                });

                bglayer.add(pileback);

                // In the play area, draw the symbol corresponding to each suit inside the rectangle
                pileback = new Kinetic.Image({
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (0.345 + offset) * winH,
                    width: width * winW,
                    height: height * winH,
                    image: card_images['card-' + i + '-0'],
                });

                bglayer.add(pileback);

                // In the play area, draw borders around each stack rectangle
                let strokeColor = fillColor;

                pileback = new Kinetic.Rect({
                    stroke: strokeColor,
                    strokeWidth: 5,
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (0.345 + offset) * winH,
                    width: width * winW,
                    height: height * winH,
                    cornerRadius: radius * winW,
                });
                bglayer.add(pileback);

                let this_suit_play_stack = new CardStack({
                    x: (0.183 + (width + 0.015) * i) * winW,
                    y: (0.345 + offset) * winH,
                    width: width * winW,
                    height: height * winH,
                });
                play_stacks.set(suit, this_suit_play_stack);
                cardlayer.add(this_suit_play_stack);

                let this_suit_discard_stack = new CardLayout({
                    x: 0.81 * winW,
                    y: (0.61 + y * i) * winH,
                    width: 0.17 * winW,
                    height: 0.17 * winH,
                });
                discard_stacks.set(suit, this_suit_discard_stack);
                cardlayer.add(this_suit_discard_stack);

                ++i;
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

        bglayer.add(rect);

        drawdeck = new CardDeck({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            cardback: 'card-back',
        });

        drawdeck.cardback.on('dragend.play', function() {
            var pos = this.getAbsolutePosition();

            pos.x += this.getWidth() * this.getScaleX() / 2;
            pos.y += this.getHeight() * this.getScaleY() / 2;

            if (overPlayArea(pos)) {
                ui.postAnimationLayout = function () {
                    drawdeck.doLayout();
                    ui.postAnimationLayout = null;
                };

                this.setDraggable(false);
                deck_play_available_label.setVisible(false);

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
                    onFinish: function() {
                        uilayer.draw();
                    },
                }).play();
            }
        });

        cardlayer.add(drawdeck);

        var hand_pos = {
            2: [
                { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0, },
                { x: 0.19, y: 0.01, w: 0.42, h: 0.189, rot: 0, },
            ],
            3: [
                { x: 0.19, y: 0.77, w: 0.42, h: 0.189, rot: 0, },
                { x: 0.01, y: 0.71, w: 0.41, h: 0.189, rot: -78, },
                { x: 0.705, y: 0, w: 0.41, h: 0.189, rot: 78, },
            ],
            4: [
                { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0, },
                { x: 0.015, y: 0.7, w: 0.34, h: 0.189, rot: -78, },
                { x: 0.23, y: 0.01, w: 0.34, h: 0.189, rot: 0, },
                { x: 0.715, y: 0.095, w: 0.34, h: 0.189, rot: 78, },
            ],
            5: [
                { x: 0.23, y: 0.77, w: 0.34, h: 0.189, rot: 0, },
                { x: 0.03, y: 0.77, w: 0.301, h: 0.18, rot: -90, },
                { x: 0.025, y: 0.009, w: 0.34, h: 0.189, rot: 0, },
                { x: 0.445, y: 0.009, w: 0.34, h: 0.189, rot: 0, },
                { x: 0.77, y: 0.22, w: 0.301, h: 0.18, rot: 90, },
            ],
        };

        var shade_pos = {
            2: [
                { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0, },
                { x: 0.185, y: 0.002, w: 0.43, h: 0.205, rot: 0, },
            ],
            3: [
                { x: 0.185, y: 0.762, w: 0.43, h: 0.205, rot: 0, },
                { x: 0.005, y: 0.718, w: 0.42, h: 0.205, rot: -78, },
                { x: 0.708, y: -0.008, w: 0.42, h: 0.205, rot: 78, },
            ],
            4: [
                { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0, },
                { x: 0.01, y: 0.708, w: 0.35, h: 0.205, rot: -78, },
                { x: 0.225, y: 0.002, w: 0.35, h: 0.205, rot: 0, },
                { x: 0.718, y: 0.087, w: 0.35, h: 0.205, rot: 78, },
            ],
            5: [
                { x: 0.225, y: 0.762, w: 0.35, h: 0.205, rot: 0, },
                { x: 0.026, y: 0.775, w: 0.311, h: 0.196, rot: -90, },
                { x: 0.02, y: 0.001, w: 0.35, h: 0.205, rot: 0, },
                { x: 0.44, y: 0.001, w: 0.35, h: 0.205, rot: 0, },
                { x: 0.774, y: 0.215, w: 0.311, h: 0.196, rot: 90, },
            ],
        };

        var name_pos = {
            2: [
                { x: 0.18, y: 0.97, w: 0.44, h: 0.02, },
                { x: 0.18, y: 0.21, w: 0.44, h: 0.02, },
            ],
            3: [
                { x: 0.18, y: 0.97, w: 0.44, h: 0.02, },
                { x: 0.01, y: 0.765, w: 0.12, h: 0.02, },
                { x: 0.67, y: 0.765, w: 0.12, h: 0.02, },
            ],
            4: [
                { x: 0.22, y: 0.97, w: 0.36, h: 0.02, },
                { x: 0.01, y: 0.74, w: 0.13, h: 0.02, },
                { x: 0.22, y: 0.21, w: 0.36, h: 0.02, },
                { x: 0.66, y: 0.74, w: 0.13, h: 0.02, },
            ],
            5: [
                { x: 0.22, y: 0.97, w: 0.36, h: 0.02, },
                { x: 0.025, y: 0.775, w: 0.116, h: 0.02, },
                { x: 0.015, y: 0.199, w: 0.36, h: 0.02, },
                { x: 0.435, y: 0.199, w: 0.36, h: 0.02, },
                { x: 0.659, y: 0.775, w: 0.116, h: 0.02, },
            ],
        };

        var nump = this.playerNames.length;

        for (let i = 0; i < nump; i++) {
            let j = i - this.playerUs;

            if (j < 0) {
                j += nump;
            }

            player_hands[i] = new CardLayout({
                x: hand_pos[nump][j].x * winW,
                y: hand_pos[nump][j].y * winH,
                width: hand_pos[nump][j].w * winW,
                height: hand_pos[nump][j].h * winH,
                rotationDeg: hand_pos[nump][j].rot,
                align: 'center',
                reverse: j === 0,
            });

            cardlayer.add(player_hands[i]);

            rect = new Kinetic.Rect({
                x: shade_pos[nump][j].x * winW,
                y: shade_pos[nump][j].y * winH,
                width: shade_pos[nump][j].w * winW,
                height: shade_pos[nump][j].h * winH,
                rotationDeg: shade_pos[nump][j].rot,
                cornerRadius: 0.01 * shade_pos[nump][j].w * winW,
                opacity: 0.4,
                fillLinearGradientStartPoint: {
                    x: 0,
                    y: 0,
                },
                fillLinearGradientEndPoint: {
                    x: shade_pos[nump][j].w * winW,
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

            bglayer.add(rect);

            name_frames[i] = new HanabiNameFrame({
                x: name_pos[nump][j].x * winW,
                y: name_pos[nump][j].y * winH,
                width: name_pos[nump][j].w * winW,
                height: name_pos[nump][j].h * winH,
                name: this.playerNames[i],
            });

            uilayer.add(name_frames[i]);

            // Draw the tooltips on the player names that show the time
            // (the code is copied from HanabiCard)
            if (!this.replay) {
                let frame_hover_tooltip = new Kinetic.Label({
                    x: -1000,
                    y: -1000,
                });

                frame_hover_tooltip.add(new Kinetic.Tag({
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

                frame_hover_tooltip.add(new FitText({
                    fill: 'white',
                    align: 'left',
                    padding: 0.01 * winH,
                    fontSize: 0.04 * winH,
                    minFontSize: 0.02 * winH,
                    width: 0.08 * winW,
                    fontFamily: 'Verdana',
                    text: '??:??',
                }));

                tiplayer.add(frame_hover_tooltip);
                name_frames[i].tooltip = frame_hover_tooltip;

                name_frames[i].on('mousemove', function() {
                    var mousePos = stage.getPointerPosition();
                    this.tooltip.setX(mousePos.x + 15);
                    this.tooltip.setY(mousePos.y + 5);

                    this.tooltip.show();
                    tiplayer.draw();

                    ui.activeHover = this;
                });

                name_frames[i].on('mouseout', function() {
                    this.tooltip.hide();
                    tiplayer.draw();
                });
            }
        }

        no_clue_box = new Kinetic.Rect({
            x: 0.275 * winW,
            y: 0.56 * winH,
            width: 0.25 * winW,
            height: 0.15 * winH,
            cornerRadius: 0.01 * winW,
            fill: 'black',
            opacity: 0.5,
            visible: false,
        });

        uilayer.add(no_clue_box);

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

        uilayer.add(noClueLabel);

        clue_area = new Kinetic.Group({
            x: 0.10 * winW,
            y: 0.54 * winH,
            width: 0.55 * winW,
            height: 0.27 * winH,
        });

        clue_target_button_group = new ButtonGroup();

        clue_target_button_group.selectNextTarget = function () {
            let newSelectionIndex = 0;
            for (let i = 0; i < this.list.length; i++) {
                if (this.list[i].pressed) {
                    newSelectionIndex = (i + 1) % this.list.length;
                    break;
                }
            }

            this.list[newSelectionIndex].dispatchEvent(new MouseEvent('click'));
        };

        clueButton_group = new ButtonGroup();

        // Store each button inside an array for later
        // (so that we can press them with keyboard hotkeys)
        let rankClueButtons = [];
        let suitClueButtons = [];

        x = 0.26 * winW - (nump - 2) * 0.044 * winW;

        for (let i = 0; i < nump - 1; i++) {
            let j = (this.playerUs + i + 1) % nump;

            button = new Button({
                x: x,
                y: 0,
                width: 0.08 * winW,
                height: 0.025 * winH,
                text: this.playerNames[j],
                target_index: j,
            });

            clue_area.add(button);

            x += 0.0875 * winW;

            clue_target_button_group.add(button);
        }

        for (let i = 1; i <= 5; i++) {
            button = new NumberButton({
                x: (0.183 + (i - 1) * 0.049) * winW,
                y: 0.027 * winH,
                width: 0.04 * winW,
                height: 0.071 * winH,
                number: i,
                clue: new Clue(CLUE_TYPE.RANK, i)
            });

            // Add it to the tracking array (for keyboard hotkeys)
            rankClueButtons.push(button);

            clue_area.add(button);

            clueButton_group.add(button);
        }

        x = 0.183;

        if (this.variant === VARIANT.BLACKSUIT || this.variant === VARIANT.BLACKONE) {
            x = 0.158;
        } else if (this.variant === VARIANT.MIXED) {
            x = 0.208;
        }

        {
            let i = 0;
            for (let color of this.variant.clueColors) {
                button = new ColorButton({
                    x: (x + i * 0.049) * winW,
                    y: 0.1 * winH,
                    width: 0.04 * winW,
                    height: 0.071 * winH,
                    color: color.hex_code,
                    text: color.abbreviation,
                    clue: new Clue(CLUE_TYPE.COLOR, color)
                });

                clue_area.add(button);

            // Add it to the tracking array (for keyboard hotkeys)
            suitClueButtons.push(button);

                clueButton_group.add(button);
                ++i;
            }
        }

        submitClue = new Button({
            x: 0.183 * winW,
            y: 0.172 * winH,
            width: 0.236 * winW,
            height: 0.051 * winH,
            text: 'Give Clue',
        });

        clue_area.add(submitClue);

        clue_area.hide();

        uilayer.add(clue_area);

        /*
            Draw the timer
        */

        // We don't want the timer to show in replays
        if (!this.replay) {
            let timerX = 0.155;
            let timerY = 0.592;
            let timerX2 = 0.565;

            timerRect1 = new Kinetic.Rect({
                x: timerX * winW,
                y: timerY * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fill: 'black',
                cornerRadius: 0.005 * winH,
                opacity: 0.2,
            });
            timerlayer.add(timerRect1);

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
            timerlayer.add(timerLabel1);

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
            timerlayer.add(timerText1);

            timerRect2 = new Kinetic.Rect({
                x: timerX2 * winW,
                y: timerY * winH,
                width: 0.08 * winW,
                height: 0.051 * winH,
                fill: 'black',
                cornerRadius: 0.005 * winH,
                opacity: 0.2,
            });
            timerlayer.add(timerRect2);

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
            timerlayer.add(timerLabel2);

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
            timerlayer.add(timerText2);

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

        replay_area = new Kinetic.Group({
            x: 0.15 * winW,
            y: 0.51 * winH,
            width: 0.5 * winW,
            height: 0.27 * winH,
        });

        replay_bar = new Kinetic.Rect({
            x: 0,
            y: 0.0425 * winH,
            width: 0.5 * winW,
            height: 0.01 * winH,
            fill: 'black',
            cornerRadius: 0.005 * winH,
            listening: false,
        });

        replay_area.add(replay_bar);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.5 * winW,
            height: 0.05 * winH,
            opacity: 0,
        });

        rect.on('click', function(event) {
            var x = event.evt.x - this.getAbsolutePosition().x;
            var w = this.getWidth();
            var step = w / self.replay_max;
            var newturn = Math.floor((x + step / 2) / step);
            if (newturn !== self.replayTurn) {
                self.perform_replay(newturn, true);
            }
        });

        replay_area.add(rect);

        replay_shuttle = new Kinetic.Rect({
            x: 0,
            y: 0.0325 * winH,
            width: 0.03 * winW,
            height: 0.03 * winH,
            fill: '#0000cc',
            cornerRadius: 0.01 * winW,
            draggable: true,
            dragBoundFunc: function(pos) {
                var min = this.getParent().getAbsolutePosition().x;
                var w = this.getParent().getWidth() - this.getWidth();
                var y = this.getAbsolutePosition().y;
                var x = pos.x - min;
                if (x < 0) {
                    x = 0;
                }
                if (x > w) {
                    x = w;
                }
                var step = w / self.replay_max;
                var newturn = Math.floor((x + step / 2) / step);
                if (newturn !== self.replayTurn) {
                    self.perform_replay(newturn, true);
                }
                x = newturn * step;
                return {
                    x: min + x,
                    y: y,
                };
            },
        });

        replay_shuttle.on('dragend', function() {
            cardlayer.draw();
            uilayer.draw();
        });

        replay_area.add(replay_shuttle);

        // Rewind to the beginning (the left-most button)
        button = new Button({
            x: 0.1 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewindfull',
        });

        var rewindfull_function = function() {
            ui.perform_replay(0);
        };

        button.on('click tap', rewindfull_function);

        replay_area.add(button);

        // Rewind one turn (the second left-most button)
        button = new Button({
            x: 0.18 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'rewind',
        });

        var backward_function = function() {
            ui.perform_replay(self.replayTurn - 1, true);
        };

        button.on('click tap', backward_function);

        replay_area.add(button);

        // Go forward one turn (the second right-most button)
        button = new Button({
            x: 0.26 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forward',
        });

        var forward_function = function() {
            ui.perform_replay(self.replayTurn + 1);
        };

        button.on('click tap', forward_function);

        replay_area.add(button);

        // Go forward to the end (the right-most button)
        button = new Button({
            x: 0.34 * winW,
            y: 0.07 * winH,
            width: 0.06 * winW,
            height: 0.08 * winH,
            image: 'forwardfull',
        });

        var forwardfull_function = function() {
            ui.perform_replay(self.replay_max, true);
        };

        button.on('click tap', forwardfull_function);

        replay_area.add(button);

        // The "Exit Replay" button
        button = new Button({
            x: 0.15 * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Exit Replay',
            visible: !this.replayOnly,
        });

        button.on('click tap', function() {
            if (self.replayOnly) {
                ui.sendMsg({
                    type: 'unattend_table',
                    resp: {},
                });

                if (ui.timerID !== null) {
                    window.clearInterval(ui.timerID);
                    ui.timerID = null;
                }

                ui.lobby.gameEnded();
            } else {
                self.enter_replay(false);
            }
        });

        replay_area.add(button);

        // The "Go to Shared Turn" button
        go_to_shared_turn_button = new Button({
            x: 0.15 * winW,
            y: 0.17 * winH,
            width: 0.2 * winW,
            height: 0.06 * winH,
            text: 'Go to Shared Turn',
            visible: false,
        });

        go_to_shared_turn_button.on('click tap', function() {
            ui.perform_replay(ui.sharedreplayTurn);
        });

        replay_area.add(go_to_shared_turn_button);

        replay_area.hide();
        uilayer.add(replay_area);

        /*
            Keyboard shortcuts
        */

        var backward_round = function () {
            ui.perform_replay(self.replayTurn - nump, true);
        };

        var forward_round = function () {
            ui.perform_replay(self.replayTurn + nump);
        };

        let mouseClickHelper = function(elem) {
            return function () {
                elem.dispatchEvent(new MouseEvent('click'));
            };
        };

        // Navigation during replays
        let replayNavigationKeyMap = {
            'End' : forwardfull_function,
            'Home' : rewindfull_function,

            'ArrowLeft' : backward_function,
            'ArrowRight' : forward_function,

            '[' :  backward_round,
            ']' : forward_round,
        };

        // Build an object that contains all of the keyboard hotkeys along with
        // how they should interact with clue UI
        let clueKeyMap = {};

        // Add "Tab" for player selection
        clueKeyMap.Tab = function() {
            clue_target_button_group.selectNextTarget();
        };

        // Add "12345" to the map (for number clues)
        for (let i = 0; i < rankClueButtons.length; i++) {
            // The button for "1" is at array index 0, etc.
            clueKeyMap[i + 1] = mouseClickHelper(rankClueButtons[i]);
        }

        // Add "qwert" (for color clues)
        // (we want to use qwert since they are conviently next to 12345, and also
        // because the clue colors can change between different variants)
        clueKeyMap.q = mouseClickHelper(suitClueButtons[0]);
        clueKeyMap.w = mouseClickHelper(suitClueButtons[1]);
        clueKeyMap.e = mouseClickHelper(suitClueButtons[2]);
        clueKeyMap.r = mouseClickHelper(suitClueButtons[3]);
        if (suitClueButtons.length > 4) {
            // There may not be a 5th clue type, depending on the variant
            clueKeyMap.t = mouseClickHelper(suitClueButtons[4]);
        }

        // Add "Enter" for pressing the 'Give Clue' button
        clueKeyMap.Enter = mouseClickHelper(submitClue);

        // Keyboard actions for playing and discarding cards
        let promptOwnHandOrder = function(actionString) {
            let playerCards = player_hands[ui.playerUs].children;
            let maxSlotIndex = playerCards.length;
            let msg = 'Enter the slot number (1 to ' + maxSlotIndex + ') of the card to ' + actionString + '.';
            let response = window.prompt(msg);

            if (/^deck$/i.test(response)) {
                return 'deck';
            }

            if (!/^\d+$/.test(response)) {
                return null;
            }

            let num_response = parseInt(response);
            if (num_response < 1 || num_response > maxSlotIndex) {
                return null;
            }

            return playerCards[maxSlotIndex - num_response].children[0].order;
        };

        let doKeyboardCardAction = function(tryPlay) {
            let intendedPlay = tryPlay === true;
            let cardOrder = promptOwnHandOrder(intendedPlay ? 'play' : 'discard');

            if (cardOrder === null) {
                return;
            }
            if (cardOrder === 'deck' && !(intendedPlay && savedAction.can_blind_play_deck)) {
                return;
            }

            let resp = {};
            if (cardOrder === 'deck') {
                resp.type = ACT.DECKPLAY;
            } else {
                resp.type = intendedPlay ? ACT.PLAY : ACT.DISCARD;
                resp.target = cardOrder;
            }

            ui.sendMsg({
                type: 'action',
                resp: resp,
            });
            ui.stopAction();
            savedAction = null;
        };

        let doKeyboardCardPlay = function () {
            doKeyboardCardAction(true);
        };

        let doKeyboardCardDiscard = function () {
            doKeyboardCardAction(false);
        };

        let playKeyMap = {
            'a': doKeyboardCardPlay, // The main play hotkey
            '+': doKeyboardCardPlay, // For numpad users
        };

        let discardKeyMap = {
            'd': doKeyboardCardDiscard, // The main discard hotkey
            '-': doKeyboardCardDiscard, // For numpad users
        };

        this.keyNavigation = (event) => {
            if (event.ctrlKey || event.altKey) {
                return;
            }
            let currentNavigation;
            if (replay_area.visible()) {
                currentNavigation = replayNavigationKeyMap[event.key];
            } else if (savedAction !== null) { // current user can take an action
                if (savedAction.can_clue) {
                    currentNavigation = clueKeyMap[event.key];
                }
                if (savedAction.can_discard) {
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

        helpgroup = new Kinetic.Group({
            x: 0.1 * winW,
            y: 0.1 * winH,
            width: 0.8 * winW,
            height: 0.8 * winH,
            visible: false,
            listening: false,
        });

        overlayer.add(helpgroup);

        rect = new Kinetic.Rect({
            x: 0,
            y: 0,
            width: 0.8 * winW,
            height: 0.8 * winH,
            opacity: 0.9,
            fill: 'black',
            cornerRadius: 0.01 * winW,
        });

        helpgroup.add(rect);

        let helpText = `Welcome to Hanabi!

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

        text = new Kinetic.Text({
            x: 0.03 * winW,
            y: 0.03 * winH,
            width: 0.74 * winW,
            height: 0.74 * winH,
            fontSize: 0.019 * winW,
            fontFamily: 'Verdana',
            fill: 'white',
            text: helpText,
        });

        helpgroup.add(text);

        deck_play_available_label = new Kinetic.Rect({
            x: 0.08 * winW,
            y: 0.8 * winH,
            width: 0.075 * winW,
            height: 0.189 * winH,
            stroke: 'yellow',
            cornerRadius: 6,
            strokeWidth: 10,
            visible: false,
        });

        uilayer.add(deck_play_available_label);

        replay_button = new Button({
            x: 0.01 * winW,
            y: 0.8 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            image: 'replay',
            visible: false,
        });

        replay_button.on('click tap', function() {
            self.enter_replay(!self.replay);
        });

        uilayer.add(replay_button);

        help_button = new Button({
            x: 0.01 * winW,
            y: 0.87 * winH,
            width: 0.06 * winW,
            height: 0.06 * winH,
            text: 'Help',
        });

        uilayer.add(help_button);

        help_button.on('click tap', function() {
            helpgroup.show();
            overback.show();

            overlayer.draw();

            overback.on('click tap', function() {
                overback.off('click tap');

                helpgroup.hide();
                overback.hide();

                overlayer.draw();
            });
        });

        lobby_button = new Button({
            x: 0.01 * winW,
            y: 0.94 * winH,
            width: 0.06 * winW,
            height: 0.05 * winH,
            text: 'Lobby',
        });

        uilayer.add(lobby_button);

        lobby_button.on('click tap', function() {
            lobby_button.off('click tap');
            ui.sendMsg({
                type: 'unattend_table',
                resp: {},
            });

            if (ui.timerID !== null) {
                window.clearInterval(ui.timerID);
                ui.timerID = null;
            }

            ui.lobby.gameEnded();
        });

        if (ui.replay) {
            replay_area.show();
        }

        stage.add(bglayer);
        stage.add(uilayer);
        stage.add(timerlayer);
        stage.add(cardlayer);
        stage.add(tiplayer);
        stage.add(overlayer);
    };

    this.reset = function() {
        var i, suits;

        message_prompt.setMultiText('');
        msgloggroup.reset();

        suits = this.variant.suits;

        for (let suit of suits) {
            play_stacks.get(suit).removeChildren();
            discard_stacks.get(suit).removeChildren();
        }

        for (i = 0; i < this.playerNames.length; i++) {
            player_hands[i].removeChildren();
        }

        ui.deck = [];
        ui.postAnimationLayout = null;

        clueLog.clear();
        message_prompt.reset();

        // This should always be overridden before it gets displayed
        drawdeck.setCount(99);

        for (i = 0; i < strikes.length; i++) {
            strikes[i].remove();
        }

        strikes = [];

        this.animateFast = true;
    };

    this.save_replay = function(msg) {
        var msgData = msg.resp;

        this.replayLog.push(msg);

        if (msgData.type === 'turn') {
            this.replay_max = msgData.num;
        }
        if (msgData.type === 'game_over') {
            this.replay_max++;
        }

        if (!this.replayOnly && this.replay_max > 0) {
            replay_button.show();
        }

        if (this.replay) {
            this.adjust_replay_shuttle();
            uilayer.draw();
        }
    };

    this.adjust_replay_shuttle = function() {
        var w = replay_shuttle.getParent().getWidth() - replay_shuttle.getWidth();
        replay_shuttle.setX(this.replayTurn * w / this.replay_max);
    };

    this.enter_replay = function(enter) {
        if (!this.replay && enter) {
            this.replay = true;
            this.replayPos = this.replayLog.length;
            this.replayTurn = this.replay_max;
            this.adjust_replay_shuttle();
            this.stopAction(true);
            replay_area.show();
            for (var i = 0; i < this.deck.length; ++i) {
                this.deck[i].setBareImage();
            }
            uilayer.draw();
            cardlayer.draw();
        } else if (this.replay && !enter) {
            this.perform_replay(this.replay_max, true);
            this.replay = false;
            replay_area.hide();

            if (savedAction) {
                this.handleAction(savedAction);
            }
            for (let i = 0; i < this.deck.length; ++i) {
                this.deck[i].setBareImage();
            }
            uilayer.draw();
            cardlayer.draw();
        }
    };

    this.handleMessage_in_replay = function(ui, msg) {
        ui.setMessage(msg.resp);
    };

    this.perform_replay = function(target, fast) {
        var msg;
        var rewind = false;

        if (target < 0) {
            target = 0;
        }
        if (target > this.replay_max) {
            target = this.replay_max;
        }

        if (target < this.replayTurn) {
            rewind = true;
        }

        if (this.replayTurn === target) {
            return; // We're already there, nothing to do!
        }

        if (this.sharedReplay && this.sharedReplay_leader === lobby.username) {
            this.sendMsg({
                type: 'replay_action',
                resp: {
                    type: 0, // Type 0 is a new replay turn
                    turn: target,
                },
            });
        }

        this.replayTurn = target;

        this.adjust_replay_shuttle();
        if (fast) {
            this.animateFast = true;
        }

        if (rewind) {
            this.reset();
            this.replayPos = 0;
        }

        while (true) {
            msg = this.replayLog[this.replayPos++];

            if (!msg) {
                break;
            }

            if (msg.type === 'message') {
                this.setMessage(msg.resp);

            } else if (msg.type === 'notify') {
                var performing_replay = true;
                this.handle_notify(msg.resp, performing_replay);
            }

            if (msg.type === 'notify' && msg.resp.type === 'turn') {
                if (msg.resp.num === this.replayTurn) {
                    break;
                }
            }
        }

        this.animateFast = false;
        msgloggroup.refreshText();
        message_prompt.refreshText();
        cardlayer.draw();
        uilayer.draw();

    };

    this.replay_advanced = function() {
        this.animateFast = false;

        if (this.replay) {
            this.perform_replay(0);
        }

        cardlayer.draw();

        // There's a bug on the emulator where the text doesn't show upon first
        // loading a game; doing this seems to fix it
        uilayer.draw();
    };

    this.show_connected = function(list) {
        var i;

        if (!this.ready) {
            return;
        }

        for (i = 0; i < list.length; i++) {
            name_frames[i].setConnected(list[i]);
        }

        uilayer.draw();
    };

    function show_loading() {
        var loadinglayer = new Kinetic.Layer();

        var loadinglabel = new Kinetic.Text({
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

        var progresslabel = new Kinetic.Text({
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

        ImageLoader.progress_callback = function(done, total) {
            progresslabel.setText(done.toString() + ' / ' + total.toString());
            loadinglayer.draw();
        };

        stage.add(loadinglayer);
    }

    show_loading();

    this.getNote = function(card_order) {
        return notesWritten[card_order];
    };

    this.setNote = function(card_order, note) {
        if (note) {
            notesWritten[card_order] = note;
        } else {
            delete notesWritten[card_order];
        }
        this.save_notes();
    };

    this.load_notes = function() {
        var cookie = localStorage.getItem(gameID);
        if (cookie) {
            return JSON.parse(cookie);
        } else {
            return {};
        }
    };

    this.save_notes = function() {
        var cookie = JSON.stringify(notesWritten);
        localStorage.setItem(gameID, cookie);
    };

    this.handle_notify = function(note, performing_replay) {
        var type = note.type;
        var child, order;
        var pos, scale, n;
        var i;
        if (ui.activeHover) {
            ui.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            ui.activeHover = null;
        }

        if (type === 'draw') {
            let suit = msgSuitToSuit(note.suit, ui.variant);
            ui.deck[note.order] = new HanabiCard({
                suit: suit,
                rank: note.rank,
                order: note.order,
            });

            child = new LayoutChild();
            child.add(ui.deck[note.order]);

            pos = drawdeck.cardback.getAbsolutePosition();

            child.setAbsolutePosition(pos);
            child.setRotation(-player_hands[note.who].getRotation());

            scale = drawdeck.cardback.getWidth() / CARDW;
            child.setScale({
                x: scale,
                y: scale,
            });

            player_hands[note.who].add(child);
            player_hands[note.who].moveToTop();

        } else if (type === 'draw_size') {
            drawdeck.setCount(note.size);

        } else if (type === 'played') {
            let suit = msgSuitToSuit(note.which.suit, ui.variant);
            showClueMatch(-1);

            child = ui.deck[note.which.order].parent;

            ui.deck[note.which.order].suit = suit;
            ui.deck[note.which.order].rank = note.which.rank;
            ui.deck[note.which.order].unknown = false;
            ui.learnedCards[note.which.order] = {
                suit: suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

            pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            child.remove();
            child.setAbsolutePosition(pos);

            play_stacks.get(suit).add(child);
            play_stacks.get(suit).moveToTop();

            clueLog.checkExpiry();

        } else if (type === 'discard') {
            let suit = msgSuitToSuit(note.which.suit, ui.variant);
            showClueMatch(-1);

            child = ui.deck[note.which.order].parent;

            ui.deck[note.which.order].suit = suit;
            ui.deck[note.which.order].rank = note.which.rank;
            ui.deck[note.which.order].unknown = false;
            ui.learnedCards[note.which.order] = {
                suit: suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

            pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            child.remove();
            child.setAbsolutePosition(pos);

            discard_stacks.get(suit).add(child);

            for (let [_, discard_stack] of discard_stacks) {
                if (discard_stack) {
                    discard_stack.moveToTop();
                }
            }

            while (1) {
                n = child.getZIndex();

                if (!n) {
                    break;
                }

                if (note.which.rank < child.parent.children[n - 1].children[0].rank) {
                    child.moveDown();
                } else {
                    break;
                }
            }

            clueLog.checkExpiry();

        } else if (type === 'reveal') {
            let suit = msgSuitToSuit(note.which.suit, ui.variant);
            child = ui.deck[note.which.order].parent;

            ui.deck[note.which.order].suit = suit;
            ui.deck[note.which.order].rank = note.which.rank;
            ui.deck[note.which.order].unknown = false;
            ui.learnedCards[note.which.order] = {
                suit: suit,
                rank: note.which.rank,
                revealed: true,
            };
            ui.deck[note.which.order].setBareImage();
            ui.deck[note.which.order].hideClues();

            if (!this.animateFast) {
                cardlayer.draw();
            }

        } else if (type === 'clue') {
            let clue = msgClueToClue(note.clue, ui.variant);
            showClueMatch(-1);

            for (i = 0; i < note.list.length; i++) {
                ui.deck[note.list[i]].setIndicator(true);
                ui.deck[note.list[i]].clue_given.show();

                if (note.target === ui.playerUs && !ui.replayOnly && !ui.spectating) {
                    ui.deck[note.list[i]].addClue(clue);
                    ui.deck[note.list[i]].setBareImage();
                }
            }

            var neglist = [];

            for (i = 0; i < player_hands[note.target].children.length; i++) {
                child = player_hands[note.target].children[i];

                order = child.children[0].order;

                if (note.list.indexOf(order) < 0) {
                    neglist.push(order);
                }
            }

            let clueName;
            if (note.clue.type === CLUE_TYPE.RANK) {
                clueName = clue.value.toString();
            } else {
                clueName = clue.value.name;
            }

            var entry = new HanabiClueEntry({
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
            clue_label.setText(`Clues: ${note.clues}`);

            if (note.clues === 0) {
                clue_label.setFill('#df1c2d');
            } else if (note.clues === 1) {
                clue_label.setFill('#ef8c1d');
            } else if (note.clues === 2) {
                clue_label.setFill('#efef1d');
            } else {
                clue_label.setFill('#d8d5ef');
            }

            score_label.setText(`Score: ${note.score}`);
            if (!this.animateFast) {
                uilayer.draw();
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

            uilayer.add(x);

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
            for (i = 0; i < ui.playerNames.length; i++) {
                name_frames[i].setActive(note.who === i);
            }

            if (!this.animateFast) {
                uilayer.draw();
            }
        } else if (type === 'game_over') {
            for (let i = 0; i < this.playerNames.length; i++) {
                name_frames[i].off('mousemove');
            }

            if (timerRect1) {
                timerRect1.hide();
                timerLabel1.hide();
                timerText1.hide();
            }

            timerlayer.draw();

            this.replayOnly = true;
            replay_button.hide();
            if (!this.replay) {
                this.enter_replay(true);
            }
            if (!this.animateFast) {
                uilayer.draw();
            }
        } else if (type === 'reorder') {
            const hand = player_hands[note.target];
            // TODO: Throw an error if hand and note.hand dont have the same numbers in them

            // Get the LayoutChild objects in the hand and put them in the right order in a temporary array
            const newChildOrder = [];
            var handSize = hand.children.length;
            for (i = 0; i < handSize; ++i) {
                var order = note.hand_order[i];
                var child = ui.deck[order].parent;
                newChildOrder.push(child);

                // Take them out of the hand itself
                child.remove()
            }

            // Put them back into the hand in the new order
            for (i = 0; i < handSize; ++i) {
                var child = newChildOrder[i];
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

    this.handle_spectators = (note) => {
        let shouldShowLabel = note.names.length > 0;
        spectators_label.setVisible(shouldShowLabel);
        spectators_num_label.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            spectators_num_label.setText(note.names.length);

            // Build the string that shows all the names
            let tooltipString = 'Spectators:\n';
            for (let i = 0; i < note.names.length; i++) {
                tooltipString += `${i + 1}) ${note.names[i]}\n`;
            }
            tooltipString = tooltipString.slice(0, -1); // Chop off the trailing newline

            spectators_label_tooltip.getText().setText(tooltipString);
        }
        uilayer.draw();
    };

    this.handle_clock = (note) => {
        if (ui.timerID !== null) {
            window.clearInterval(ui.timerID);
            ui.timerID = null;
        }

        ui.playerTimes = note.times;

        // Check to see if the second timer has been drawn
        if (typeof(timerRect2) === 'undefined') {
            return;
        }

        let current_user_turn = note.active === ui.playerUs && !ui.spectating;

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

        if (!current_user_turn) {
            // Update the ui with the value of the timer for the active player
            let time = ui.playerTimes[note.active];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            timerText2.setText(millisecondsToTimeDisplay(time));
        }

        let shoudShowTimer2 = !current_user_turn && note.active !== null;
        timerRect2.setVisible(shoudShowTimer2);
        timerLabel2.setVisible(shoudShowTimer2);
        timerText2.setVisible(shoudShowTimer2);

        timerlayer.draw();

        // Update the timer tooltips for each player
        for (let i = 0; i < ui.playerTimes.length; i++) {
            let time = ui.playerTimes[i];
            if (!ui.timedGame) {
                // Invert it to show how much time each player is taking
                time *= -1;
            }
            name_frames[i].tooltip.getText().setText(millisecondsToTimeDisplay(time));
        }

        tiplayer.draw();

        // If no timer is running on the server, do not configure local approximation
        if (note.active === null) {
            return;
        }

        // Start the local timer for the active player
        let active_timer_ui_text = current_user_turn ? timerText1 : timerText2;
        let textUpdateTargets = [active_timer_ui_text, name_frames[note.active].tooltip.getText()];
        ui.timerID = window.setInterval(function() {
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
    this.handle_note = function(note) {
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
        let card = ui.deck[note.order];
        card.tooltip.getText().setText(newNote);
        if (newNote.length > 0) {
            card.note_given.show();
        } else {
            card.note_given.hide();
            card.tooltip.hide();
            tiplayer.draw();
        }
        uilayer.draw();
        cardlayer.draw();
    };

    this.handle_notes = function(note) {
        // We recieved a new copy of all of our notes from the server
        notesWritten = note.notes;

        for (const order of Object.keys(notesWritten)) {
            // The following code is mosly copied from the "handle_note" function

            // Set the note
            const newNote = notesWritten[order];
            ui.setNote(order, newNote);

            // Draw (or hide) the note indicator
            let card = ui.deck[order];
            card.tooltip.getText().setText(newNote);
            if (newNote.length > 0) {
                card.note_given.show();
            } else {
                card.note_given.hide();
                card.tooltip.hide();
            }
        }
        tiplayer.draw();
        uilayer.draw();
        cardlayer.draw();
    };

    this.handle_replay_leader = function(note) {
        this.sharedReplay_leader = note.name;

        sharedReplay_leader_label.show();
        let text = `Leader: ${this.sharedReplay_leader}`;
        sharedReplay_leader_label_tooltip.getText().setText(text);

        if (this.sharedReplay_leader === lobby.username) {
            go_to_shared_turn_button.hide();
            sharedReplay_leader_label.fill('yellow');
        } else {
            go_to_shared_turn_button.show();
        }

        uilayer.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(note) {
        this.sharedreplayTurn = note.turn;
        if (this.sharedReplay_leader !== lobby.username) {
            this.perform_replay(this.sharedreplayTurn);
        }
    };

    this.stopAction = (fast) => {
        if (fast) {
            clue_area.hide();
        } else {
            new Kinetic.Tween({
                node: clue_area,
                opacity: 0.0,
                duration: 0.5,
                runonce: true,
                onFinish: () => {
                    clue_area.hide();
                },
            }).play();
        }

        noClueLabel.hide();
        no_clue_box.hide();
        no_discard_label.hide();

        showClueMatch(-1);
        clue_target_button_group.off('change');
        clueButton_group.off('change');

        for (let i = 0; i < player_hands[ui.playerUs].children.length; i++) {
            const child = player_hands[ui.playerUs].children[i];

            child.off('dragend.play');
            child.setDraggable(false);
        }

        drawdeck.cardback.setDraggable(false);
        deck_play_available_label.setVisible(false);

        submitClue.off('click tap');
    };

    var savedAction = null;

    this.handleAction = function handleAction(data) {
        const self = this;

        savedAction = data;

        if (this.replay) {
            return;
        }

        if (data.can_clue) {
            clue_area.show();

            new Kinetic.Tween({
                node: clue_area,
                opacity: 1.0,
                duration: 0.5,
                runonce: true,
            }).play();
        } else {
            noClueLabel.show();
            no_clue_box.show();
            if (!this.animateFast) {
                uilayer.draw();
            }
        }

        if (!data.can_discard) {
            no_discard_label.show();
            if (!this.animateFast) {
                uilayer.draw();
            }
        }

        submitClue.setEnabled(false);

        clue_target_button_group.clearPressed();
        clueButton_group.clearPressed();

        if (this.playerNames.length === 2) {
            clue_target_button_group.list[0].setPressed(true);
        }

        player_hands[ui.playerUs].moveToTop();

        for (let i = 0; i < player_hands[ui.playerUs].children.length; i++) {
            const child = player_hands[ui.playerUs].children[i];

            child.setDraggable(true);

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
                    pos.x >= discard_area.getX() &&
                    pos.y >= discard_area.getY() &&
                    pos.x <= discard_area.getX() + discard_area.getWidth() &&
                    pos.y <= discard_area.getY() + discard_area.getHeight() &&
                    data.can_discard
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
                    player_hands[ui.playerUs].doLayout();
                }
            });
        }

        drawdeck.cardback.setDraggable(data.can_blind_play_deck);

        deck_play_available_label.setVisible(data.can_blind_play_deck);

        // Ensure deck blindplay is above other cards, ui elements
        if (data.can_blind_play_deck) {
            drawdeck.moveToTop();
        }

        const checkClueLegal = function() {
            var target = clue_target_button_group.getPressed();
            var clueButton = clueButton_group.getPressed();

            if (!target || !clueButton) {
                submitClue.setEnabled(false);
                return;
            }

            var who = target.target_index;
            var match = showClueMatch(who, clueButton.clue);

            if (!match) {
                submitClue.setEnabled(false);
                return;
            }

            submitClue.setEnabled(true);
        };

        clue_target_button_group.on('change', checkClueLegal);
        clueButton_group.on('change', checkClueLegal);

        submitClue.on('click tap', function submitClueClick() {
            if (!data.can_clue) {
                return;
            }

            if (!this.getEnabled()) {
                return;
            }

            const target = clue_target_button_group.getPressed();
            const clueButton = clueButton_group.getPressed();

            showClueMatch(target.target_index, {});

            ui.sendMsg({
                type: 'action',
                resp: {
                    type: ACT.CLUE,
                    target: target.target_index,
                    clue: clueToMsgClue(clueButton.clue, ui.variant),
                },
            });

            self.stopAction();

            savedAction = null;
        });
    };

    this.setMessage = (msg) => {
        msgloggroup.addMessage(msg.text);

        message_prompt.setMultiText(msg.text);
        if (!this.animateFast) {
            uilayer.draw();
            overlayer.draw();
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
        this.reorder_cards = msgData.reorder_cards;

        if (this.replayOnly) {
            this.replayTurn = -1;
        }

        this.loadImages();
    } else if (msgType === 'advanced') {
        this.replay_advanced();
    } else if (msgType === 'connected') {
        this.show_connected(msgData.list);
    } else if (msgType === 'notify') {
        this.save_replay(msg);

        if (!this.replay || msgData.type === 'reveal') {
            this.handle_notify.call(this, msgData);
        }
    } else if (msgType === 'action') {
        this.handleAction.call(this, msgData);

        if (this.animateFast) {
            return;
        }

        if (this.lobby.sendTurnNotify) {
            this.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        // This is used to update the names of the people currently spectating the game
        this.handle_spectators.call(this, msgData);
    } else if (msgType === 'clock') {
        // This is used for timed games
        this.handle_clock.call(this, msgData);
    } else if (msgType === 'note') {
        // This is used for spectators
        this.handle_note.call(this, msgData);
    } else if (msgType === 'notes') {
        // This is a list of all of your notes, sent upon reconnecting to a game
        this.handle_notes.call(this, msgData);
    } else if (msgType === 'replay_leader') {
        // This is used in shared replays
        this.handle_replay_leader.call(this, msgData);
    } else if (msgType === 'replayTurn') {
        // This is used in shared replays
        this.handleReplayTurn.call(this, msgData);
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
