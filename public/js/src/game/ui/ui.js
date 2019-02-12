// Imports
const buildUI = require('./buildUI');
const cardDraw = require('./cardDraw');
const Clue = require('./clue');
const constants = require('../../constants');
const globals = require('./globals');
const globalsInit = require('./globalsInit');
const HanabiCard = require('./card');
const HanabiClueEntry = require('./clueEntry');
const LayoutChild = require('./layoutChild');
const Loader = require('./loader');
const keyboard = require('./keyboard');
const notes = require('./notes');
const replay = require('./replay');
const stats = require('./stats');
const timer = require('./timer');

function HanabiUI(lobby, game) {
    // Since the "HanabiUI" object is being reinstantiated,
    // we need to explicitly reinitialize all varaibles (or else they will retain their old values)
    globalsInit();
    cardDraw.init();
    // (the keyboard functions can only be initialized once the clue buttons are drawn)
    notes.init();
    timer.init();

    globals.lobby = lobby;
    globals.game = game;

    // Eventually, we should refactor everything out of "ui.js" and remove all "ui" references
    // (this is how the code worked pre-Browserify)
    const ui = this;

    const {
        ACT,
        CARDW,
        CLUE_TYPE,
        INDICATOR,
        SUIT,
    } = constants;

    /*
        Misc. UI objects
    */

    // Convert a clue to the format used by the server, which is identical but for the color value;
    // on the client it is a rich object and on the server it is a simple integer mapping
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
        } else if (clueType === CLUE_TYPE.RANK) {
            clueValue = msgClueValue;
        }
        return new Clue(clueType, clueValue);
    };
    const msgSuitToSuit = (msgSuit, variant) => variant.suits[msgSuit];

    globals.ImageLoader = new Loader(() => {
        cardDraw.buildCards();
        buildUI();
        keyboard.init(); // Keyboard hotkeys can only be initialized once the clue buttons are drawn
        globals.lobby.conn.send('ready');
        globals.ready = true;
    });

    this.showClueMatch = (target, clue) => {
        // Hide all of the existing arrows on the cards
        for (let i = 0; i < globals.deck.length; i++) {
            if (i === target) {
                continue;
            }

            globals.deck[i].setIndicator(false);
        }
        globals.layers.card.batchDraw();

        // We supply this function with an argument of "-1" if we just want to
        // clear the existing arrows and nothing else
        if (target < 0) {
            return false;
        }

        let match = false;
        for (let i = 0; i < globals.elements.playerHands[target].children.length; i++) {
            const child = globals.elements.playerHands[target].children[i];
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

        globals.layers.card.batchDraw();

        return match;
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

    globals.stage = new Kinetic.Stage({
        container: 'game',
    });

    sizeStage(globals.stage);

    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    this.overPlayArea = pos => (
        pos.x >= globals.elements.playArea.getX()
        && pos.y >= globals.elements.playArea.getY()
        && pos.x <= globals.elements.playArea.getX() + globals.elements.playArea.getWidth()
        && pos.y <= globals.elements.playArea.getY() + globals.elements.playArea.getHeight()
    );

    this.overDiscardArea = pos => (
        pos.x >= globals.elements.discardArea.getX()
        && pos.y >= globals.elements.discardArea.getY()
        && pos.x <= globals.elements.discardArea.getX() + globals.elements.discardArea.getWidth()
        && pos.y <= globals.elements.discardArea.getY() + globals.elements.discardArea.getHeight()
    );

    this.giveClue = () => {
        if (!globals.elements.giveClueButton.getEnabled()) {
            return;
        }

        // Prevent the user from accidentally giving a clue in certain situations
        if (Date.now() - globals.accidentalClueTimer < 1000) {
            return;
        }

        const target = globals.elements.clueTargetButtonGroup.getPressed();
        if (!target) {
            return;
        }
        const clueButton = globals.elements.clueButtonGroup.getPressed();
        if (!clueButton) {
            return;
        }

        // Erase the arrows
        globals.lobby.ui.showClueMatch(target.targetIndex, {});

        // Set the clue timer to prevent multiple clicks
        globals.accidentalClueTimer = Date.now();

        // Send the message to the server
        const action = {
            type: 'action',
            data: {
                type: ACT.CLUE,
                target: target.targetIndex,
                clue: clueToMsgClue(clueButton.clue, globals.variant),
            },
        };
        ui.endTurn(action);
    };

    this.saveReplay = function saveReplay(msg) {
        const msgData = msg.data;

        globals.replayLog.push(msg);

        if (msgData.type === 'turn') {
            globals.replayMax = msgData.num;
        }
        if (msgData.type === 'gameOver') {
            globals.replayMax += 1;
        }

        if (!globals.replay && globals.replayMax > 0) {
            globals.elements.replayButton.show();
        }

        if (globals.inReplay) {
            replay.adjustShuttles();
            globals.layers.UI.draw();
        }
    };

    this.replayAdvanced = function replayAdvanced() {
        globals.animateFast = false;

        if (globals.inReplay) {
            replay.goto(0);
        }

        globals.layers.card.draw();
        globals.layers.UI.draw();
        // We need to re-draw the UI or else the action text will not appear
    };

    this.showConnected = function showConnected(list) {
        if (!globals.ready) {
            return;
        }

        for (let i = 0; i < list.length; i++) {
            globals.elements.nameFrames[i].setConnected(list[i]);
        }

        globals.layers.UI.draw();
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

        globals.ImageLoader.progressCallback = (done, total) => {
            progresslabel.setText(`${done}/${total}`);
            loadinglayer.draw();
        };

        globals.stage.add(loadinglayer);
    }

    showLoading();

    this.handleNotify = function handleNotify(data) {
        // If an action in the game happens,
        // mark to make the tooltip go away after the user has finished entering their note
        if (notes.vars.editing !== null) {
            notes.vars.actionOccured = true;
        }

        // Automatically disable any tooltips once an action in the game happens
        if (globals.activeHover) {
            globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
            globals.activeHover = null;
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
            if (!globals.learnedCards[data.order]) {
                globals.learnedCards[data.order] = {
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

            const pos = globals.elements.drawDeck.cardback.getAbsolutePosition();

            child.setAbsolutePosition(pos);
            child.setRotation(-globals.elements.playerHands[data.who].getRotation());

            const scale = globals.elements.drawDeck.cardback.getWidth() / CARDW;
            child.setScale({
                x: scale,
                y: scale,
            });

            globals.elements.playerHands[data.who].add(child);
            globals.elements.playerHands[data.who].moveToTop();
        } else if (type === 'drawSize') {
            globals.deckSize = data.size;
            globals.elements.drawDeck.setCount(data.size);
        } else if (type === 'play' || type === 'discard') {
            // Local variables
            const suit = msgSuitToSuit(data.which.suit, globals.variant);
            const card = globals.deck[data.which.order];
            const child = card.parent; // This is the LayoutChild

            // Hide all of the existing arrows on the cards
            globals.lobby.ui.showClueMatch(-1);

            const learnedCard = globals.learnedCards[data.which.order];
            learnedCard.suit = suit;
            learnedCard.rank = data.which.rank;
            learnedCard.possibleSuits = [suit];
            learnedCard.possibleRanks = [data.which.rank];
            learnedCard.revealed = true;

            card.showOnlyLearned = false;
            card.trueSuit = suit;
            card.trueRank = data.which.rank;

            const pos = child.getAbsolutePosition();
            child.setRotation(child.parent.getRotation());
            card.suitPips.hide();
            card.rankPips.hide();
            child.remove();
            child.setAbsolutePosition(pos);

            globals.elements.clueLog.checkExpiry();

            if (type === 'play') {
                card.isPlayed = true;
                card.turnPlayed = globals.turn - 1;

                globals.elements.playStacks.get(suit).add(child);
                globals.elements.playStacks.get(suit).moveToTop();

                if (!card.isClued()) {
                    stats.updateEfficiency(1);
                }
            } else if (type === 'discard') {
                card.isDiscarded = true;
                card.turnDiscarded = globals.turn - 1;

                globals.elements.discardStacks.get(suit).add(child);
                for (const discardStack of globals.elements.discardStacks) {
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

                if (card.isClued()) {
                    stats.updateEfficiency(-1);
                }
            }

            // Reveal the card and get rid of the yellow border, if present
            // (this code must be after the efficiency code above)
            card.setBareImage();
            card.hideClues();
        } else if (type === 'reveal') {
            /*
                Has the following data:
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

            const learnedCard = globals.learnedCards[data.which.order];
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

            if (!globals.animateFast) {
                globals.layers.card.draw();
            }
        } else if (type === 'clue') {
            globals.cluesSpentPlusStrikes += 1;
            stats.updateEfficiency(0);

            const clue = msgClueToClue(data.clue, globals.variant);
            globals.lobby.ui.showClueMatch(-1);

            for (let i = 0; i < data.list.length; i++) {
                const card = globals.deck[data.list[i]];
                if (!card.isClued()) {
                    stats.updateEfficiency(1);
                } else {
                    stats.updateEfficiency(0);
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

            for (let i = 0; i < globals.elements.playerHands[data.target].children.length; i++) {
                const child = globals.elements.playerHands[data.target].children[i];

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
                width: globals.elements.clueLog.getWidth(),
                height: 0.017 * winH,
                giver: globals.playerNames[data.giver],
                target: globals.playerNames[data.target],
                clueName,
                list: data.list,
                neglist,
                turn: data.turn,
            });

            globals.elements.clueLog.add(entry);

            globals.elements.clueLog.checkExpiry();
        } else if (type === 'status') {
            // Update internal state variables
            globals.clues = data.clues;
            if (globals.variant.name.startsWith('Clue Starved')) {
                // In "Clue Starved" variants, 1 clue is represented on the server by 2
                // Thus, in order to get the "real" clue count, we have to divide by 2
                globals.clues /= 2;
            }
            globals.score = data.score;
            globals.maxScore = data.maxScore;

            // Update the number of clues in the bottom-right hand corner of the screen
            globals.elements.cluesNumberLabel.setText(globals.clues.toString());
            if (globals.clues < 1 || globals.clues === 8) {
                globals.elements.cluesNumberLabel.setFill('#df1c2d'); // Red
            } else if (globals.clues >= 1 && globals.clues < 2) {
                globals.elements.cluesNumberLabel.setFill('#ef8c1d'); // Orange
            } else if (globals.clues >= 2 && globals.clues < 3) {
                globals.elements.cluesNumberLabel.setFill('#efef1d'); // Yellow
            } else {
                globals.elements.cluesNumberLabel.setFill('#d8d5ef'); // White
            }

            if (globals.clues === 8) {
                // Show the red border around the discard pile
                // (to reinforce the fact that being at 8 clues is a special situation)
                globals.elements.noDiscardLabel.show();
                globals.elements.noDoubleDiscardLabel.hide();
            } else if (data.doubleDiscard) {
                // Show a yellow border around the discard pile
                // (to reinforce that this is a "Double Discard" situation)
                globals.elements.noDiscardLabel.hide();
                globals.elements.noDoubleDiscardLabel.show();
            } else {
                globals.elements.noDiscardLabel.hide();
                globals.elements.noDoubleDiscardLabel.hide();
            }

            // Update the score (in the bottom-right-hand corner)
            globals.elements.scoreNumberLabel.setText(globals.score);

            // Update the stats on the middle-left-hand side of the screen
            stats.updatePace();
            stats.updateEfficiency(0);

            if (!globals.animateFast) {
                globals.layers.UI.draw();
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
                    globals.layers.text.draw();
                }
            }
        } else if (type === 'strike') {
            globals.cluesSpentPlusStrikes += 1;
            stats.updateEfficiency(0);

            const x = new Kinetic.Image({
                x: (0.015 + 0.04 * (data.num - 1)) * winW,
                y: 0.125 * winH,
                width: 0.02 * winW,
                height: 0.036 * winH,
                image: globals.ImageLoader.get('x'),
                opacity: 0,
            });

            // We also record the turn that the strike happened
            x.turn = globals.turn;

            // Click on the x to go to the turn that the strike happened
            x.on('click', function squareClick() {
                if (globals.replay) {
                    replay.checkDisableSharedTurns();
                } else {
                    replay.enter();
                }
                replay.goto(this.turn + 1, true);
            });

            globals.elements.scoreArea.add(x);
            globals.elements.strikes[data.num - 1] = x;

            if (globals.animateFast) {
                x.setOpacity(1.0);
            } else {
                new Kinetic.Tween({
                    node: x,
                    opacity: 1.0,
                    duration: globals.animateFast ? 0.001 : 1.0,
                    runonce: true,
                }).play();
            }
        } else if (type === 'turn') {
            // Store the current turn in memory
            globals.turn = data.num;

            // Keep track of whether or not it is our turn (speedrun)
            globals.ourTurn = (data.who === globals.playerUs);
            if (!globals.ourTurn) {
                // Adding this here to avoid bugs with pre-moves
                globals.elements.clueArea.hide();
            }

            for (let i = 0; i < globals.playerNames.length; i++) {
                globals.elements.nameFrames[i].setActive(data.who === i);
            }

            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }

            globals.elements.turnNumberLabel.setText(`${globals.turn + 1}`);

            if (globals.queuedAction !== null && globals.ourTurn) {
                setTimeout(() => {
                    ui.sendMsg(globals.queuedAction);
                    ui.stopAction();

                    globals.queuedAction = null;
                }, 250);
            }
        } else if (type === 'gameOver') {
            for (let i = 0; i < globals.playerNames.length; i++) {
                globals.elements.nameFrames[i].off('mousemove');
            }

            if (globals.elements.timer1) {
                globals.elements.timer1.hide();
            }

            globals.layers.timer.draw();
            timer.stop();

            // If the game just finished for the players,
            // start the process of transforming it into a shared replay
            if (!globals.replay) {
                globals.replay = true;
                globals.replayTurn = globals.replayMax;
                globals.sharedReplayTurn = globals.replayTurn;
                globals.elements.replayButton.hide();
                // Hide the in-game replay button in the bottom-left-hand corner
            }

            // We could be in the middle of an in-game replay when the game ends,
            // so don't jerk them out of the in-game replay
            if (!globals.inReplay) {
                replay.enter();
            }

            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }
        } else if (type === 'reorder') {
            const hand = globals.elements.playerHands[data.target];
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
            timer.stop();
            globals.game.hide();
        } else if (type === 'deckOrder') {
            // TODO
        } else {
            console.log('Received an invalid notify message:', type);
        }
    };

    this.handleSpectators = (data) => {
        if (!globals.elements.spectatorsLabel) {
            // Sometimes we can get here without the spectators label being initiated yet
            return;
        }

        // Remember the current list of spectators
        globals.spectators = data.names;

        const shouldShowLabel = data.names.length > 0;
        globals.elements.spectatorsLabel.setVisible(shouldShowLabel);
        globals.elements.spectatorsNumLabel.setVisible(shouldShowLabel);
        if (shouldShowLabel) {
            globals.elements.spectatorsNumLabel.setText(data.names.length);

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
            if (!globals.spectators.includes(globals.sharedReplayLeader)) {
                // Check to see if the leader is away
                content += ' (away)';
            }
            $('#tooltip-leader').tooltipster('instance').content(content);
        }

        globals.layers.UI.batchDraw();
    };

    /*
        Recieved by the client when spectating a game
        Has the following data:
        {
            order: 16,
            note: '<strong>Zamiel:</strong> note1<br /><strong>Duneaught:</strong> note2<br />',
        }
    */
    this.handleNote = (data) => {
        // Set the note
        // (which is the combined notes from all of the players, formatted by the server)
        notes.set(data.order, data.notes, false);

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

        globals.layers.card.batchDraw();
    };

    /*
        Recieved by the client when:
        - joining a replay (will get all notes)
        - joining a shared replay (will get all notes)
        - joining an existing game as a spectator (will get all notes)
        - reconnecting an existing game as a player (will only get your own notes)

        Has the following data:
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
            notes.set(order, note, false);

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

        globals.layers.card.batchDraw();
    };

    this.handleReplayLeader = function handleReplayLeader(data) {
        // We might be entering this function after a game just ended
        globals.sharedReplay = true;
        globals.elements.replayExitButton.hide();

        // Update the stored replay leader
        globals.sharedReplayLeader = data.name;

        // Update the UI
        globals.elements.sharedReplayLeaderLabel.show();
        let content = `<strong>Leader:</strong> ${globals.sharedReplayLeader}`;
        if (!globals.spectators.includes(globals.sharedReplayLeader)) {
            // Check to see if the leader is away
            content += ' (away)';
        }
        $('#tooltip-leader').tooltipster('instance').content(content);

        globals.elements.sharedReplayLeaderLabelPulse.play();

        globals.elements.toggleSharedTurnButton.show();
        globals.layers.UI.draw();
    };

    this.handleReplayTurn = function handleReplayTurn(data) {
        globals.sharedReplayTurn = data.turn;
        replay.adjustShuttles();
        if (globals.useSharedTurns) {
            replay.goto(globals.sharedReplayTurn);
        } else {
            globals.elements.replayShuttleShared.getLayer().batchDraw();
        }
    };

    this.handleReplayIndicator = (data) => {
        // Ensure that the card exists as a sanity-check
        const indicated = globals.deck[data.order];
        if (!indicated) {
            return;
        }

        // Either show or hide the arrow (if it is already visible)
        const visible = !(
            indicated.indicatorArrow.visible()
            && indicated.indicatorArrow.getFill() === INDICATOR.REPLAY_LEADER
        );
        // (if the arrow is showing but is a different kind of arrow,
        // then just overwrite the existing arrow)
        globals.lobby.ui.showClueMatch(-1);
        indicated.setIndicator(visible, INDICATOR.REPLAY_LEADER);
    };

    this.stopAction = () => {
        globals.elements.clueArea.hide();
        globals.elements.noClueBox.hide();
        globals.elements.noClueLabel.hide();
        globals.elements.noDiscardLabel.hide();
        globals.elements.noDoubleDiscardLabel.hide();

        globals.lobby.ui.showClueMatch(-1);
        globals.elements.clueTargetButtonGroup.off('change');
        globals.elements.clueButtonGroup.off('change');

        // Make all of the cards in our hand not draggable
        // (but we need to keep them draggable if the pre-play setting is enabled)
        if (!globals.lobby.settings.speedrunPreplay) {
            const ourHand = globals.elements.playerHands[globals.playerUs];
            for (const child of ourHand.children) {
                // This is a LayoutChild
                child.off('dragend.play');
                child.setDraggable(false);
            }
        }

        globals.elements.drawDeck.cardback.setDraggable(false);
        globals.elements.deckPlayAvailableLabel.setVisible(false);
    };

    this.endTurn = function endTurn(action) {
        if (globals.ourTurn) {
            ui.sendMsg(action);
            ui.stopAction();
            globals.savedAction = null;
        } else {
            globals.queuedAction = action;
        }
    };

    this.handleAction = function handleAction(data) {
        globals.savedAction = data;

        if (globals.inReplay) {
            return;
        }

        if (data.canClue) {
            // Show the clue UI
            globals.elements.clueArea.show();
        } else {
            globals.elements.noClueBox.show();
            globals.elements.noClueLabel.show();
            if (!globals.animateFast) {
                globals.layers.UI.draw();
            }
        }

        // We have to redraw the UI layer to avoid a bug with the clue UI
        globals.layers.UI.draw();

        if (globals.playerNames.length === 2) {
            // Default the clue recipient button to the only other player available
            globals.elements.clueTargetButtonGroup.list[0].setPressed(true);
        }

        globals.elements.playerHands[globals.playerUs].moveToTop();

        // Set our hand to being draggable
        // (this is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable)
        if (!globals.lobby.settings.speedrunPreplay) {
            const ourHand = globals.elements.playerHands[globals.playerUs];
            for (const child of ourHand.children) {
                child.checkSetDraggable();
            }
        }

        if (globals.deckPlays) {
            globals.elements.drawDeck.cardback.setDraggable(data.canBlindPlayDeck);
            globals.elements.deckPlayAvailableLabel.setVisible(data.canBlindPlayDeck);

            // Ensure the deck is above other cards and UI elements
            if (data.canBlindPlayDeck) {
                globals.elements.drawDeck.moveToTop();
            }
        }

        const checkClueLegal = () => {
            const target = globals.elements.clueTargetButtonGroup.getPressed();
            const clueButton = globals.elements.clueButtonGroup.getPressed();

            if (!target || !clueButton) {
                globals.elements.giveClueButton.setEnabled(false);
                return;
            }

            const who = target.targetIndex;
            const match = globals.lobby.ui.showClueMatch(who, clueButton.clue);

            // By default, only enable the "Give Clue" button if the clue "touched"
            // one or more cards in the hand
            const enabled = match
                // Make an exception if they have the optional setting for "Empty Clues" turned on
                || globals.emptyClues
                // Make an exception for the "Color Blind" variants (color clues touch no cards)
                || (globals.variant.name.startsWith('Color Blind')
                    && clueButton.clue.type === CLUE_TYPE.COLOR)
                // Make an exception for certain characters
                || (globals.characterAssignments[globals.playerUs] === 'Blind Spot'
                    && who === (globals.playerUs + 1) % globals.playerNames.length)
                || (globals.characterAssignments[globals.playerUs] === 'Oblivious'
                    && who === (globals.playerUs - 1 + globals.playerNames.length)
                    % globals.playerNames.length);

            globals.elements.giveClueButton.setEnabled(enabled);
        };

        globals.elements.clueTargetButtonGroup.on('change', checkClueLegal);
        globals.elements.clueButtonGroup.on('change', checkClueLegal);
    };

    this.setMessage = (msg) => {
        globals.elements.msgLogGroup.addMessage(msg.text);

        globals.elements.messagePrompt.setMultiText(msg.text);
        if (!globals.animateFast) {
            globals.layers.UI.draw();
            globals.layers.overtop.draw();
        }
    };

    this.destroy = function destroy() {
        keyboard.destroy();
        timer.stop();
        globals.stage.destroy();
        // window.removeEventListener('resize', resizeCanvas, false);
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
        globals.baseTime = msgData.baseTime;
        globals.timePerTurn = msgData.timePerTurn;
        globals.deckPlays = msgData.deckPlays;
        globals.emptyClues = msgData.emptyClues;
        globals.characterAssignments = msgData.characterAssignments;
        globals.characterMetadata = msgData.characterMetadata;

        globals.inReplay = globals.replay;
        if (globals.replay) {
            globals.replayTurn = -1;
        }

        // Begin to load all of the card images
        globals.ImageLoader.start();
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
        globals.lastAction = msgData;
        this.handleAction.call(this, msgData);

        if (globals.animateFast) {
            return;
        }

        if (globals.lobby.settings.sendTurnNotify) {
            globals.lobby.sendNotify('It\'s your turn', 'turn');
        }
    } else if (msgType === 'spectators') {
        // This is used to update the names of the people currently spectating the game
        this.handleSpectators.call(this, msgData);
    } else if (msgType === 'clock') {
        // Update the clocks to show how much time people are taking
        // or how much time people have left
        timer.update(msgData);
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
        if (globals.sharedReplayLeader === globals.lobby.username) {
            // We don't have to draw any arrows;
            // we already did it manually immediately after sending the "replayAction" message
            return;
        }

        this.handleReplayIndicator.call(this, msgData);
    } else if (msgType === 'replayMorph') {
        // This is used in shared replays to make hypothetical game states
        if (globals.sharedReplayLeader === globals.lobby.username) {
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
        if (globals.sharedReplayLeader === globals.lobby.username) {
            // We don't have to play anything;
            // we already did it manually after sending the "replayAction" message
            return;
        }

        globals.game.sounds.play(msgData.sound);
    } else {
        console.error('Received an invalid message:', msgType);
    }
};

HanabiUI.prototype.sendMsg = function sendMsg(msg) {
    const { type } = msg;
    const { data } = msg;
    globals.lobby.conn.send(type, data);
};

HanabiUI.prototype.updateChatLabel = function updateChatLabel() {
    let text = 'Chat';
    if (globals.lobby.chatUnread > 0) {
        text += ` (${globals.lobby.chatUnread})`;
    }
    globals.elements.chatButton.setText(text);
    globals.layers.UI.draw();
};

HanabiUI.prototype.toggleChat = function toggleChat() {
    globals.game.chat.toggle();
};

// Expose the globals to functions in the "game" directory
HanabiUI.prototype.globals = globals;

module.exports = HanabiUI;
