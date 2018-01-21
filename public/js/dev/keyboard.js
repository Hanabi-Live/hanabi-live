const constants = require('./constants');
const globals = require('./globals');
const replay = require('./game/replay');

$(document).keydown((event) => {
    // Don't interfere with other kinds of hotkeys
    if (event.ctrlKey || event.metaKey) { // "metaKey" is the Command / Windows key
        return;
    }

    if (globals.currentScreen === 'lobby') {
        if (event.altKey && event.key === 'c') { // Alt + c
            // Click the "Create Game" button
            $('#nav-buttons-games-create-game').click();
        } else if (event.altKey && event.key === 'h') { // Alt + h
            // Click the "Show History" button
            $('#nav-buttons-games-history').click();
        } else if (event.altKey && event.key === 't') { // Alt + t
            // Click the "Settings" button
            $('#nav-buttons-games-settings').click();
        } else if (event.altKey && event.key === 'o') { // Alt + o
            // Click the "Sign Out" button
            $('#nav-buttons-games-sign-out').click();
        } else if (event.altKey && event.key === 's') { // Alt + s
            // Click on the "Start Game" button
            $('#nav-buttons-game-start').click();
        } else if (event.altKey && event.key === 'l') { // Alt + l
            // Click on the "Leave Game" button
            $('#nav-buttons-game-leave').click();
        } else if (event.altKey && event.key === 'r') { // Alt + r
            // Click on the "Return to Lobby" button
            // (either at the "game" screen or the "history" screen or the "scores" screen)
            if ($('#nav-buttons-game-unattend').is(':visible')) {
                $('#nav-buttons-game-unattend').click();
            } else if ($('#nav-buttons-history-return').is(':visible')) {
                $('#nav-buttons-history-return').click();
            } else if ($('#nav-buttons-return-table').is(':visible')) {
                $('#nav-buttons-return-table').click();
            }
        }
    } else if (globals.currentScreen === 'game') {
        // Don't interfere with other kinds of hotkeys
        if (event.altKey) {
            return;
        }

        // Don't do anything if we are currently editing a note,
        // as we will be typing keystrokes into the input box
        if (globals.ui.editingNote) {
            return;
        }

        // TODO
        /*
        let keyHandler;
        if (globals.ui.objects.replayArea.visible) {
            keyHandler = replayNavigationKeyMap[event.key];
        } else if (globals.lastAction !== null) { // current user can take an action
            // TODO check to see if it is our turn?

            if (globals.lastAction.canClue) {
                keyHandler = clueKeyMap[event.key];
            }
            if (globals.lastAction.canDiscard) {
                keyHandler = keyHandler || discardKeyMap[event.key];
            }
            keyHandler = keyHandler || playKeyMap[event.key];
        }

        if (keyHandler !== undefined) {
            event.preventDefault();
            keyHandler();
        }
        */
    }
});

const replayNavigationKeyMap = {
    'Home': replay.rewindBeginning,
    'End': replay.forwardEnd,

    'ArrowLeft': replay.backward,
    'ArrowRight': replay.forward,

    '[': replay.rewindRound,
    ']': replay.forwardRound,
};
const clueKeyMap = {};
buildClueKeyMap();
const discardKeyMap = {
    'd': discard, // The main discard hotkey
    '-': discard, // For numpad users
};
const playKeyMap = {
    'a': play, // The main play hotkey
    '+': play, // For numpad users
};

function buildClueKeyMap() {
    // Add "Tab" for player selection
    clueKeyMap.Tab = () => {
        // TODO
        // clueTargetButtonGroup.selectNextTarget();
    };

    // Add "12345" to the map (for number clues)
    // TODO
    /*
    for (let i = 0; i < rankClueButtons.length; i++) {
        // The button for "1" is at array index 0, etc.
        // clueKeyMap[i + 1] = mouseClickHelper(rankClueButtons[i]);
    }
    */

    // Add "qwert" (for color clues)
    // (we want to use qwert since they are conveniently next to 12345, and also
    // because the clue colors can change between different variants)
    // TODO
    /*
    const clueKeyRow = ['q', 'w', 'e', 'r', 't', 'y'];
    for (let i = 0; i < suitClueButtons.length && i < clueKeyRow.length; i++) {
        clueKeyMap[clueKeyRow[i]] = mouseClickHelper(suitClueButtons[i]);
    }
    */

    // Add "Enter" for pressing the 'Give Clue' button
    // TODO
    // clueKeyMap.Enter = mouseClickHelper(submitClue);
}

function play() {
    action(true);
}

function discard() {
    action(false);
}

function action(intendedPlay) {
    const cardOrder = promptUserForSlot(intendedPlay ? 'play' : 'discard');

    if (cardOrder === null) {
        return;
    }
    if (cardOrder === 'deck' && !(intendedPlay && globals.lastAction.canBlindPlayDeck)) {
        return;
    }

    const resp = {};
    if (cardOrder === 'deck') {
        resp.type = constants.ACT.DECKPLAY;
    } else {
        resp.type = intendedPlay ? constants.ACT.PLAY : constants.ACT.DISCARD;
        resp.target = cardOrder;
    }

    globals.conn.send('action', {
        resp,
    });

    // TODO
    // ui.stopAction();

    globals.lastAction = null;
}

function promptUserForSlot(actionString) {
    // TODO
    /*
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
    */
}
