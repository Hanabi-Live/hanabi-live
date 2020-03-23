/*
    Functions for handling all of the keyboard shortcuts
*/

// Imports
import * as action from './action';
import { Action } from './actions';
import { ACTION, REPLAY_ACTION_TYPE, MAX_CLUE_NUM } from '../../constants';
import backToLobby from './backToLobby';
import * as clues from './clues';
import { copyStringToClipboard } from '../../misc';
import globals from './globals';
import * as hypothetical from './hypothetical';
import * as replay from './replay';

// Variables
const hotkeyClueMap = new Map();
const hotkeyPlayMap = new Map();
const hotkeyDiscardMap = new Map();

export const init = () => {
    /*
        Build a mapping of hotkeys to functions
    */

    hotkeyClueMap.clear();
    hotkeyPlayMap.clear();
    hotkeyDiscardMap.clear();

    // Add "Tab" for player selection
    hotkeyClueMap.set('Tab', () => {
        globals.elements.clueTargetButtonGroup!.selectNextTarget();
    });

    // Add "1", "2", "3", "4", and "5" (for rank clues)
    for (let i = 0; i < globals.elements.rankClueButtons.length; i++) {
        // The button for "1" is at array index 0, etc.
        hotkeyClueMap.set(`${i + 1}`, click(globals.elements.rankClueButtons[i]));
    }

    // Add "q", "w", "e", "r", "t", and "y" (for color clues)
    // (we use qwert since they are conveniently next to 12345,
    // and also because the clue colors can change between different variants)
    const clueKeyRow = ['q', 'w', 'e', 'r', 't', 'y'];
    for (let i = 0; i < globals.elements.colorClueButtons.length && i < clueKeyRow.length; i++) {
        hotkeyClueMap.set(clueKeyRow[i], click(globals.elements.colorClueButtons[i]));
    }

    hotkeyPlayMap.set('a', play); // The main play hotkey
    hotkeyPlayMap.set('+', play); // For numpad users
    hotkeyDiscardMap.set('d', discard); // The main discard hotkey
    hotkeyDiscardMap.set('-', discard); // For numpad users

    // Enable all of the keyboard hotkeys
    $(document).keydown(keydown);
};

export const destroy = () => {
    $(document).unbind('keydown', keydown);
};

const keydown = (event: JQuery.KeyDownEvent) => {
    // Disable hotkeys if we not currently in a game
    // (this should not be possible, as the handler gets unregistered upon going back to the lobby,
    // but double check just in case)
    if (globals.lobby.currentScreen !== 'game') {
        return;
    }

    // Disable keyboard hotkeys if we are editing a note
    if (globals.editingNote !== null) {
        return;
    }

    if (event.key === 'Escape') {
        // Escape = If the chat is open, close it
        if ($('#game-chat-modal').is(':visible')) {
            globals.game.chat.hide();
            return;
        }

        if (globals.replay) {
            // Escape = If in a replay, exit back to the lobby
            backToLobby();
            return;
        }

        // Escape = If in an in-game replay, exit back to the game
        replay.exit();
        return;
    }

    // Ctrl hotkeys
    if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
        // Ctrl + Enter = Give a clue / click on the "Give Clue" button
        if (event.key === 'Enter') {
            clues.give(); // This function has validation inside of it
            return;
        }

        // Ctrl + c = Copy the current game ID
        if (
            event.key === 'c'
            && globals.replay
            && !($('#game-chat-modal').is(':visible'))
        ) {
            copyStringToClipboard(globals.databaseID.toString());
            return;
        }
    }

    // Alt hotkeys
    if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
        // Sound hotkeys
        if (event.key === 'b' || event.key === '∫') { // Alt + b
            // This is used for fun in shared replays
            sharedReplaySendSound('buzz');
            return;
        }
        if (event.key === 'h' || event.key === '˙') { // Alt + h
            // This is used for fun in shared replays
            sharedReplaySendSound('holy');
            return;
        }
        if (event.key === 'n' || event.key === '˜') { // Alt + n
            // This is used for fun in shared replays
            sharedReplaySendSound('nooo');
            return;
        }
        if (event.key === 'z' || event.key === 'Ω') { // Alt + z
            // This is used as a sound test
            globals.game.sounds.play('turn_us');
            return;
        }

        // Other
        if (event.key === 'l' || event.key === '¬') { // Alt + l
            backToLobby();
            return;
        }
        if (event.key === 't' || event.key === '†') { // Alt + t
            replay.promptTurn();
            return;
        }
    }

    // The rest of the hotkeys should be disabled if we are typing in the in-game chat
    // or if a modifier key is pressed
    if (
        $('#game-chat-input').is(':focus')
        || event.ctrlKey
        || event.shiftKey
        || event.altKey
        || event.metaKey
    ) {
        return;
    }

    // Delete = Delete the note from the card that we are currently hovering-over, if any
    if (
        event.key === 'Delete'
        && globals.activeHover !== null
        && globals.activeHover.type === 'HanabiCard'
    ) {
        const card = globals.activeHover;
        card.setNote('');
        return;
    }

    // Replay hotkeys
    if (globals.hypothetical) {
        if (event.key === 'ArrowLeft') {
            hypothetical.sendBackOneTurn();
            return;
        }
    } else {
        if (event.key === 'ArrowLeft') {
            replay.enter();
            replay.back();
            return;
        }
        if (event.key === 'ArrowRight') {
            replay.enter();
            replay.forward();
            return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (globals.sharedReplay) {
                replay.toggleSharedTurns();
            } else if (!globals.replay) {
                replay.exit();
            }
            return;
        }
        if (event.key === '[') {
            replay.enter();
            replay.backRound();
            return;
        }
        if (event.key === ']') {
            replay.enter();
            replay.forwardRound();
            return;
        }
        if (event.key === 'Home') {
            replay.enter();
            replay.backFull();
            return;
        }
        if (event.key === 'End') {
            replay.enter();
            replay.forwardFull();
            return;
        }
    }

    // Check for other keyboard hotkeys
    if (globals.inReplay || globals.currentPlayerIndex !== globals.playerUs) {
        return;
    }

    let hotkeyFunction;
    if (globals.clues >= 1) {
        hotkeyFunction = hotkeyClueMap.get(event.key);
    }
    if (globals.clues < MAX_CLUE_NUM) {
        hotkeyFunction = hotkeyFunction || hotkeyDiscardMap.get(event.key);
    }
    hotkeyFunction = hotkeyFunction || hotkeyPlayMap.get(event.key);
    if (hotkeyFunction !== undefined) {
        event.preventDefault();
        hotkeyFunction();
    }
};

const sharedReplaySendSound = (sound: string) => {
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
        type: REPLAY_ACTION_TYPE.SOUND,
        sound,
    });
};

/*
    Helper functions
*/

const play = () => {
    performAction(true);
};
const discard = () => {
    performAction(false);
};

// If intendedPlay is true, it plays a card
// If intendedPlay is false, it discards a card
const performAction = (intendedPlay = true) => {
    const cardOrder = promptOwnHandOrder(intendedPlay ? 'play' : 'discard');

    if (cardOrder === null) {
        return;
    }
    if (cardOrder === 'deck' && !intendedPlay) {
        return;
    }

    const actionObject = {} as Action;
    if (cardOrder === 'deck') {
        actionObject.type = ACTION.DECKPLAY;
    } else {
        actionObject.type = intendedPlay ? ACTION.PLAY : ACTION.DISCARD;
        actionObject.target = cardOrder;
    }

    globals.lobby.conn.send('action', actionObject);
    action.stop();
};

// Keyboard actions for playing and discarding cards
const promptOwnHandOrder = (actionString: string) => {
    const playerCards = globals.elements.playerHands[globals.playerUs].children;
    const maxSlotIndex = playerCards.length;
    const msg = `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${actionString}.`;
    const response = window.prompt(msg);

    if (response === null || response === '') {
        return null;
    }
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

const click = (element: any) => () => {
    element.dispatchEvent(new MouseEvent('click'));
};
