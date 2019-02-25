// Imports
const buildUI = require('./buildUI');
const cardDraw = require('./cardDraw');
const constants = require('../../constants');
const convert = require('./convert');
const globals = require('./globals');
const globalsInit = require('./globalsInit');
const graphics = require('./graphics');
const Loader = require('./loader');
const keyboard = require('./keyboard');
const notes = require('./notes');
const notify = require('./notify');
const timer = require('./timer');
const websocket = require('./websocket');

function HanabiUI(lobby, game) {
    // Since the "HanabiUI" object is being reinstantiated,
    // we need to explicitly reinitialize all varaibles (or else they will retain their old values)
    globalsInit();
    cardDraw.init();
    // (the keyboard functions can only be initialized once the clue buttons are drawn)
    notes.init();
    timer.init();

    // Store references to the parent objects for later use
    globals.lobby = lobby; // This is the "globals.js" in the root of the "src" directory
    // It we name it "lobby" here to distinguish it from the UI globals;
    // after more refactoring, we will eventually merge these objects to make it less confusing
    globals.game = game; // This is the "game.js" in the root of the "game" directory
    // We should also combine this with the UI object in the future

    // Initialize the stage and show the loading screen
    this.initStage();
    globals.ImageLoader = new Loader(this.finishedLoadingImages);
    this.showLoadingScreen();
}

HanabiUI.prototype.initStage = function initStage() {
    // Initialize and size the stage depending on the window size
    globals.stage = new graphics.Stage({
        container: 'game',
    });
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
    globals.stage.setWidth(cw);
    globals.stage.setHeight(ch);
};

HanabiUI.prototype.showLoadingScreen = function showLoadingScreen() {
    const winW = globals.stage.getWidth();
    const winH = globals.stage.getHeight();

    const loadinglayer = new graphics.Layer();

    const loadinglabel = new graphics.Text({
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

    const progresslabel = new graphics.Text({
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
        loadinglayer.batchDraw();
    };
    globals.stage.add(loadinglayer);
};

HanabiUI.prototype.finishedLoadingImages = function finishedLoadingImages() {
    // Build images for every card (with respect to the variant that we are playing)
    cardDraw.buildCards();

    // Draw the user interface
    buildUI();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    keyboard.init();

    // Tell the server that we are finished loading
    globals.lobby.conn.send('ready');
};

HanabiUI.prototype.endTurn = function endTurn(action) {
    if (globals.ourTurn) {
        globals.ourTurn = false;
        globals.lobby.conn.send(action.type, action.data);
        globals.lobby.ui.stopAction();
        globals.savedAction = null;
    } else {
        globals.queuedAction = action;
        globals.elements.premoveCancelButton.setVisible(true);
        console.log(globals.queuedAction);
        let text = 'Cancel Pre-';
        if (globals.queuedAction.data.type === constants.ACT.CLUE) {
            text += 'Clue';
        } else if (globals.queuedAction.data.type === constants.ACT.PLAY) {
            text += 'Play';
        } else if (globals.queuedAction.data.type === constants.ACT.DISCARD) {
            text += 'Discard';
        }
        globals.elements.premoveCancelButton.setText(text);
        globals.layers.UI.batchDraw();
    }
};

HanabiUI.prototype.handleAction = function handleAction(data) {
    globals.savedAction = data;

    if (globals.inReplay) {
        return;
    }

    if (data.canClue) {
        // Reset and show the clue UI
        if (globals.playerNames.length === 2) {
            // In 2-player games,
            // default the clue recipient button to the only other player available
            // Otherwise, leave the last player selected
            globals.elements.clueTargetButtonGroup.list[0].setPressed(true);
        }
        globals.elements.clueTypeButtonGroup.clearPressed();
        globals.elements.clueArea.show();
    } else {
        globals.elements.noClueBox.show();
        globals.elements.noClueLabel.show();
    }
    globals.layers.UI.batchDraw();

    globals.elements.playerHands[globals.playerUs].moveToTop();

    // Set our hand to being draggable
    if (
        // This is unnecessary if the pre-play setting is enabled,
        // as the hand will already be draggable
        !globals.lobby.settings.speedrunPreplay
        // This is unnecessary if this a speedrun,
        // as clicking on cards takes priority over dragging cards
        && !globals.speedrun
    ) {
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
        const clueButton = globals.elements.clueTypeButtonGroup.getPressed();

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
                && clueButton.clue.type === constants.CLUE_TYPE.COLOR)
            // Make an exception for certain characters
            || (globals.characterAssignments[globals.playerUs] === 'Blind Spot'
                && who === (globals.playerUs + 1) % globals.playerNames.length)
            || (globals.characterAssignments[globals.playerUs] === 'Oblivious'
                && who === (globals.playerUs - 1 + globals.playerNames.length)
                % globals.playerNames.length);

        globals.elements.giveClueButton.setEnabled(enabled);
    };

    globals.elements.clueTargetButtonGroup.on('change', checkClueLegal);
    globals.elements.clueTypeButtonGroup.on('change', checkClueLegal);
};

HanabiUI.prototype.stopAction = function stopAction() {
    globals.elements.clueArea.hide();
    globals.elements.noClueBox.hide();
    globals.elements.noClueLabel.hide();
    globals.elements.noDiscardLabel.hide();
    globals.elements.noDoubleDiscardLabel.hide();

    globals.lobby.ui.showClueMatch(-1);
    globals.elements.clueTargetButtonGroup.off('change');
    globals.elements.clueTypeButtonGroup.off('change');

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

HanabiUI.prototype.showClueMatch = function showClueMatch(target, clue) {
    // Hide all of the existing arrows on the cards
    for (let i = 0; i < globals.deck.length; i++) {
        globals.deck[i].setIndicator(false, null, null, null);
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
        if (clue.type === constants.CLUE_TYPE.RANK) {
            if (
                clue.value === card.trueRank
                || (globals.variant.name.startsWith('Multi-Fives') && card.trueRank === 5)
            ) {
                touched = true;
            }
        } else if (clue.type === constants.CLUE_TYPE.COLOR) {
            const clueColor = clue.value;
            if (
                card.trueSuit === constants.SUIT.RAINBOW
                || card.trueSuit === constants.SUIT.RAINBOW1OE
                || card.trueSuit.clueColors.includes(clueColor)
            ) {
                touched = true;
            }
        }

        if (touched) {
            match = true;
            card.setIndicator(true, null, null, clue);
        } else {
            card.setIndicator(false, null, null, null);
        }
    }

    globals.layers.card.batchDraw();

    return match;
};

HanabiUI.prototype.giveClue = function giveClue() {
    const target = globals.elements.clueTargetButtonGroup.getPressed();
    const clueButton = globals.elements.clueTypeButtonGroup.getPressed();
    if (
        !globals.ourTurn // We can only give clues on our turn
        || globals.clues === 0 // We can only give a clue if there is one available
        || !target // We might have not selected a clue recipient
        || !clueButton // We might have not selected a type of clue
        // We might be trying to give an invalid clue (e.g. an Empty Clue)
        || !globals.elements.giveClueButton.enabled
        // Prevent the user from accidentally giving a clue in certain situations
        || (Date.now() - globals.accidentalClueTimer < 1000)
    ) {
        return;
    }

    // Erase the arrows
    globals.lobby.ui.showClueMatch(target.targetIndex, {});

    // Set the clue timer to prevent multiple clicks
    globals.accidentalClueTimer = Date.now();

    // Send the message to the server
    globals.lobby.ui.endTurn({
        type: 'action',
        data: {
            type: constants.ACT.CLUE,
            target: target.targetIndex,
            clue: convert.clueToMsgClue(clueButton.clue, globals.variant),
        },
    });
};

HanabiUI.prototype.handleWebsocket = function handleWebsocket(command, data) {
    if (Object.prototype.hasOwnProperty.call(websocket, command)) {
        websocket[command](data);
    } else {
        console.error(`A WebSocket function for the "${command}" is not defined.`);
    }
};

HanabiUI.prototype.handleNotify = function handleNotify(data) {
    // If a user is editing a note and an action in the game happens,
    // mark to make the tooltip go away as soon as they are finished editing the note
    if (notes.vars.editing !== null) {
        notes.vars.actionOccured = true;
    }

    // Automatically disable any tooltips once an action in the game happens
    if (globals.activeHover) {
        globals.activeHover.dispatchEvent(new MouseEvent('mouseout'));
        globals.activeHover = null;
    }

    const { type } = data;
    if (Object.prototype.hasOwnProperty.call(notify, type)) {
        notify[type](data);
    } else {
        console.error(`A WebSocket notify function for the "${type}" is not defined.`);
    }
};

HanabiUI.prototype.updateChatLabel = function updateChatLabel() {
    let text = 'Chat';
    if (globals.lobby.chatUnread > 0) {
        text += ` (${globals.lobby.chatUnread})`;
    }
    globals.elements.chatButton.setText(text);
    globals.layers.UI.batchDraw();
};

HanabiUI.prototype.toggleChat = function toggleChat() {
    globals.game.chat.toggle();
};

HanabiUI.prototype.destroy = function destroy() {
    keyboard.destroy();
    timer.stop();
    globals.stage.destroy();
    // window.removeEventListener('resize', resizeCanvas, false);
};

// Expose the globals to functions in the "game" directory
HanabiUI.prototype.globals = globals;

module.exports = HanabiUI;
