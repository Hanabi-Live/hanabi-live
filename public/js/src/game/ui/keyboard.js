/*
    Functions for handling all of the keyboard shortcuts
*/

// Imports
const constants = require('../../constants');
const globals = require('./globals');
const misc = require('../../misc');
const notes = require('./notes');
const replay = require('./replay');
const ui = require('./ui');

// Constants
const { ACT } = constants;

// Variables
const hotkeyMap = {};

exports.init = () => {
    /*
        Build a mapping of hotkeys to functions
    */

    hotkeyMap.replay = {
        'ArrowLeft': replay.back,
        'ArrowRight': replay.forward,

        '[': replay.backRound,
        ']': replay.forwardRound,

        'Home': replay.backFull,
        'End': replay.forwardFull,
    };

    hotkeyMap.clue = {};

    // Add "Tab" for player selection
    hotkeyMap.clue.Tab = () => {
        globals.elements.clueTargetButtonGroup.selectNextTarget();
    };

    // Add "1", "2", "3", "4", and "5" (for number clues)
    for (let i = 0; i < globals.elements.rankClueButtons.length; i++) {
        // The button for "1" is at array index 0, etc.
        hotkeyMap.clue[i + 1] = click(globals.elements.rankClueButtons[i]);
    }

    // Add "q", "w", "e", "r", "t", and "y" (for color clues)
    // (we use qwert since they are conveniently next to 12345,
    // and also because the clue colors can change between different variants)
    const clueKeyRow = ['q', 'w', 'e', 'r', 't', 'y'];
    for (let i = 0; i < globals.elements.suitClueButtons.length && i < clueKeyRow.length; i++) {
        hotkeyMap.clue[clueKeyRow[i]] = click(globals.elements.suitClueButtons[i]);
    }

    // (the hotkey for giving a clue is enabled separately in the "keydown()" function)

    hotkeyMap.play = {
        'a': play, // The main play hotkey
        '+': play, // For numpad users
    };
    hotkeyMap.discard = {
        'd': discard, // The main discard hotkey
        '-': discard, // For numpad users
    };

    // Enable all of the keyboard hotkeys
    $(document).keydown(keydown);
};

exports.destroy = () => {
    $(document).unbind('keydown', keydown);
};

const keydown = (event) => {
    // Disable hotkeys if we not currently in a game
    // (this should not be possible, as the handler gets unregistered upon going back to the lobby,
    // but double check just in case)
    if (globals.lobby.currentScreen !== 'game') {
        return;
    }

    // Disable keyboard hotkeys if we are editing a note
    if (notes.vars.editing !== null) {
        return;
    }

    // Disable keyboard hotkeys if we are typing in the in-game chat
    if ($('#game-chat-input').is(':focus')) {
        return;
    }

    // Ctrl + Enter = Give a clue / click on the "Give Clue" button
    if (
        event.ctrlKey
        && event.key === 'Enter'
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
    ) {
        // The "giveClue()" function has validation inside of it
        ui.giveClue();
        return;
    }

    // Ctrl + c = Copy the current game ID
    if (
        event.key === 'c'
        && event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && globals.id !== 0
    ) {
        misc.copyStringToClipboard(globals.id);
    }

    // Escape: If in an in-game replay, exit back to the game
    if (
        event.key === 'Escape'
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && !globals.replay
    ) {
        replay.exit();
    }

    // Delete: Delete the note from the card that we are currently hovering-over, if any
    if (
        event.key === 'Delete'
        && !event.ctrlKey
        && !event.shiftKey
        && !event.altKey
        && !event.metaKey
        && globals.activeHover !== null
        && typeof globals.activeHover.order !== 'undefined'
    ) {
        notes.set(globals.activeHover.order, '');
        notes.update(globals.activeHover);
        return;
    }

    // Alt hotkeys
    if (
        event.altKey
        && !event.ctrlKey
        && !event.shiftKey
        && !event.metaKey
    ) {
        // Sound hotkeys
        if (event.key === 'b') { // Alt + b
            // This is used for fun in shared replays
            sharedReplaySendSound('buzz');
            return;
        }
        if (event.key === 'h') { // Alt + h
            // This is used for fun in shared replays
            sharedReplaySendSound('holy');
            return;
        }
        if (event.key === 'n') { // Alt + n
            // This is used for fun in shared replays
            sharedReplaySendSound('nooo');
            return;
        }
        if (event.key === 'z') { // Alt + z
            // This is used as a sound test
            globals.game.sounds.play('turn_us');
            return;
        }

        // Other
        if (event.key === 't') { // Alt + t
            const fakeMouseEvent = {
                evt: {
                    which: 3,
                },
            };
            replay.promptTurn(fakeMouseEvent);
        }
    }

    // Don't interfere with other kinds of hotkeys
    if (
        event.altKey
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.metaKey
    ) {
        return;
    }

    // Check for other keyboard hotkeys
    let hotkeyFunction;
    if (globals.elements.replayArea.visible()) {
        hotkeyFunction = hotkeyMap.replay[event.key];
    } else if (globals.savedAction !== null) { // We can take an action
        if (globals.savedAction.canClue) {
            hotkeyFunction = hotkeyMap.clue[event.key];
        }
        if (globals.savedAction.canDiscard) {
            hotkeyFunction = hotkeyFunction || hotkeyMap.discard[event.key];
        }
        hotkeyFunction = hotkeyFunction || hotkeyMap.play[event.key];
    }
    if (hotkeyFunction !== undefined) {
        event.preventDefault();
        hotkeyFunction();
    }
};

const sharedReplaySendSound = (sound) => {
    // Only enable sound effects in a shared replay
    if (!globals.replay || !globals.sharedReplay) {
        return;
    }

    // Only enable sound effects for shared replay leaders
    if (!globals.amSharedReplayLeader) {
        return;
    }

    // Send it
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.SOUND,
        sound,
    });
};

/*
    Helper functions
*/

const play = () => {
    action(true);
};
const discard = () => {
    action(false);
};

// If intendedPlay is true, it plays a card
// If intendedPlay is false, it discards a card
const action = (intendedPlay = true) => {
    const cardOrder = promptOwnHandOrder(intendedPlay ? 'play' : 'discard');

    if (cardOrder === null) {
        return;
    }
    if (cardOrder === 'deck' && !(intendedPlay && globals.savedAction.canBlindPlayDeck)) {
        return;
    }

    const data = {};
    if (cardOrder === 'deck') {
        data.type = ACT.DECKPLAY;
    } else {
        data.type = intendedPlay ? ACT.PLAY : ACT.DISCARD;
        data.target = cardOrder;
    }

    globals.lobby.conn.send('action', data);
    ui.stopAction();
    globals.savedAction = null;
};

// Keyboard actions for playing and discarding cards
const promptOwnHandOrder = (actionString) => {
    const playerCards = globals.elements.playerHands[globals.playerUs].children;
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

const click = elem => () => {
    elem.dispatchEvent(new MouseEvent('click'));
};
