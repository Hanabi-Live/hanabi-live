/*
    Functions for handling all of the keyboard shortcuts
*/

// Imports
const globals = require('./globals');
const constants = require('../../constants');
const notes = require('./notes');
const replay = require('./replay');

// Constants
const { ACT } = constants;

// Variables
const hotkeyMap = {};

exports.init = () => {
    /*
        Build mappings of hotkeys to functions
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

    // Give a clue
    if (event.ctrlKey && event.key === 'Enter') { // Ctrl + Enter
        globals.lobby.ui.giveClue();
        return;
    }

    // Don't interfere with other kinds of hotkeys
    if (event.ctrlKey || event.altKey) {
        return;
    }

    // Delete the note from the card that we are currently hovering-over, if any
    if (
        event.key === 'Delete'
        && globals.activeHover !== null
        && typeof globals.activeHover.order !== 'undefined'
    ) {
        // Note that "activeHover" will remain set even if we move the mouse away from the card,
        // so this means that if the mouse is not hovering over ANY card, then the note that will be
        // deleted will be from the last tooltip shown
        notes.set(globals.activeHover.order, '');
        notes.update(globals.activeHover);
        return;
    }

    // Send a sound
    if (event.key === 'Z') { // Shift + z
        // This is used for fun in shared replays
        sharedReplaySendSound('buzz');
        return;
    }
    if (event.key === 'X') { // Shift + x
        // This is used for fun in shared replays
        sharedReplaySendSound('god');
        return;
    }
    if (event.key === 'C') { // Shift + c
        // This is used as a sound test
        globals.game.sounds.play('turn_us');
        return;
    }

    // Don't interfere with other kinds of hotkeys
    if (event.shiftKey) {
        return;
    }

    // Check for keyboard hotkeys
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
    if (globals.sharedReplayLeader !== globals.lobby.username) {
        return;
    }

    // Send it
    globals.lobby.conn.send('replayAction', {
        type: constants.REPLAY_ACTION_TYPE.SOUND,
        sound,
    });

    // Play the sound effect manually so that
    // we don't have to wait for the client to server round-trip
    globals.game.sounds.play(sound);
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
    globals.lobby.ui.stopAction();
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
