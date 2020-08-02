// Functions for handling all of the keyboard shortcuts

import Konva from 'konva';
import Screen from '../../lobby/types/Screen';
import { copyStringToClipboard } from '../../misc';
import ActionType from '../types/ActionType';
import { MAX_CLUE_NUM } from '../types/constants';
import ReplayActionType from '../types/ReplayActionType';
import backToLobby from './backToLobby';
import * as clues from './clues';
import globals from './globals';
import HanabiCard from './HanabiCard';
import * as hypothetical from './hypothetical';
import * as replay from './replay';
import * as turn from './turn';

// Variables
type Callback = () => void;
const hotkeyClueMap = new Map<string, Callback>();
const hotkeyPlayMap = new Map<string, Callback>();
const hotkeyDiscardMap = new Map<string, Callback>();

// Build a mapping of hotkeys to functions
export const init = () => {
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
  if (globals.lobby.currentScreen !== Screen.Game) {
    return;
  }

  // Disable keyboard hotkeys if we are editing a note
  if (globals.editingNote !== null) {
    return;
  }

  if (event.key === 'Escape') {
    // Escape = If the chat is open, close it
    if ($('#game-chat-modal').is(':visible')) {
      globals.game!.chat.hide();
      return;
    }

    if (globals.state.finished) {
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
      && globals.state.finished
      && !($('#game-chat-modal').is(':visible'))
    ) {
      if (globals.state.replay.databaseID !== null) {
        copyStringToClipboard(globals.state.replay.databaseID.toString());
      }
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
      globals.game!.sounds.play('turn_us');
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
    && globals.activeHover instanceof HanabiCard
  ) {
    const card: HanabiCard = globals.activeHover;
    card.setNote('');
    return;
  }

  // Replay hotkeys
  if (globals.state.replay.hypothetical !== null) {
    if (event.key === 'ArrowLeft') {
      hypothetical.sendBack();
      return;
    }
  } else {
    switch (event.key) {
      case 'ArrowLeft': {
        replay.back();
        return;
      }

      case 'ArrowRight': {
        replay.forward();
        return;
      }

      case 'ArrowUp':
      case 'ArrowDown': {
        if (globals.state.replay.shared !== null) {
          replay.toggleSharedSegments();
        } else if (!globals.state.finished) {
          replay.exit();
        }
        return;
      }

      case '[': {
        replay.backRound();
        return;
      }

      case ']': {
        replay.forwardRound();
        return;
      }

      case 'Home': {
        replay.backFull();
        return;
      }

      case 'End': {
        replay.forwardFull();
        return;
      }

      default: {
        break;
      }
    }
  }

  // Check for other keyboard hotkeys
  const currentPlayerIndex = globals.state.ongoingGame.turn.currentPlayerIndex;
  const ourPlayerIndex = globals.state.metadata.ourPlayerIndex;
  const shouldHaveKeyboardHotkeysForActions = (
    // If it is our turn in an ongoing-game
    (!globals.state.replay.active && currentPlayerIndex === ourPlayerIndex)
    // If we are in a hypothetical and we are the shared replay leader
    || (
      globals.state.replay.hypothetical !== null
      && globals.state.replay.shared !== null
      && globals.state.replay.shared.amLeader
    )
  );
  if (!shouldHaveKeyboardHotkeysForActions) {
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
  if (
    // Only send sound effects in shared replays
    globals.state.replay.shared === null
    // Only send sound effects for shared replay leaders
    || !globals.state.replay.shared.amLeader
  ) {
    return;
  }

  // Send it
  globals.lobby.conn!.send('replayAction', {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.Sound,
    sound,
  });
};

const play = () => {
  performAction(true);
};

const discard = () => {
  performAction(false);
};

// If playAction is true, it plays a card
// If playAction is false, it discards a card
const performAction = (playAction = true) => {
  const cardOrder = promptOwnHandOrder(playAction ? 'play' : 'discard');

  if (cardOrder === null) {
    return;
  }

  let type = playAction ? ActionType.Play : ActionType.Discard;
  let target = cardOrder;

  if (cardOrder === 'deck') {
    if (!playAction) {
      return;
    }

    type = ActionType.Play;
    target = globals.deck.length - 1;
  }

  globals.lobby.conn!.send('action', {
    tableID: globals.lobby.tableID,
    type,
    target,
  });
  turn.hideClueUIAndDisableDragging();
};

// Keyboard actions for playing and discarding cards
const promptOwnHandOrder = (actionString: string) : string | number | null => {
  const playerCards = globals.elements.playerHands[globals.state.metadata.ourPlayerIndex].children;
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

  return (playerCards[maxSlotIndex - numResponse].children[0] as HanabiCard).state.order;
};

const click = (element: Konva.Node) => () => {
  element.dispatchEvent(new MouseEvent('click'));
};
