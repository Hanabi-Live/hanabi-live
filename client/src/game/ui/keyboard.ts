// Functions for handling all of the keyboard shortcuts

import * as KeyCode from "keycode-js";
import Konva from "konva";
import Screen from "../../lobby/types/Screen";
import { copyStringToClipboard, parseIntSafe } from "../../misc";
import { closeModals, isModalVisible, showPrompt } from "../../modals";
import { clueTokensRules, deckRules } from "../rules";
import ActionType from "../types/ActionType";
import ReplayActionType from "../types/ReplayActionType";
import backToLobby from "./backToLobby";
import * as clues from "./clues";
import globals from "./globals";
import HanabiCard from "./HanabiCard";
import * as hypothetical from "./hypothetical";
import * as replay from "./replay";
import setGlobalEmpathy from "./setGlobalEmpathy";
import * as turn from "./turn";

// Variables
type Callback = () => void;
const hotkeyClueMap = new Map<number, Callback>();
const hotkeyPlayMap = new Map<number, Callback>();
const hotkeyDiscardMap = new Map<number, Callback>();

// Build a mapping of hotkeys to functions
export function init(): void {
  hotkeyClueMap.clear();
  hotkeyPlayMap.clear();
  hotkeyDiscardMap.clear();

  // Add "Tab" for player selection
  hotkeyClueMap.set(KeyCode.KEY_TAB, () => {
    if (globals.state.replay.hypothetical === null) {
      globals.elements.clueTargetButtonGroup!.selectNextTarget();
    } else {
      globals.elements.clueTargetButtonGroup2!.selectNextTarget();
    }
  });

  // Add "1", "2", "3", "4", and "5" (for rank clues)
  for (let i = 0; i < globals.elements.rankClueButtons.length; i++) {
    // Normal keyboard
    hotkeyClueMap.set(
      i + KeyCode.KEY_1,
      click(globals.elements.rankClueButtons[i]),
    );
    // Numpad
    hotkeyClueMap.set(
      i + KeyCode.KEY_NUMPAD1,
      click(globals.elements.rankClueButtons[i]),
    );
  }

  // Add "q", "w", "e", "r", "t", and "y" (for color clues)
  // (we use qwert since they are conveniently next to 12345,
  // and also because the clue colors can change between different variants)
  const clueKeyRow = [
    KeyCode.KEY_Q,
    KeyCode.KEY_W,
    KeyCode.KEY_E,
    KeyCode.KEY_R,
    KeyCode.KEY_T,
    KeyCode.KEY_Y,
  ];
  for (
    let i = 0;
    i < globals.elements.colorClueButtons.length && i < clueKeyRow.length;
    i++
  ) {
    hotkeyClueMap.set(
      clueKeyRow[i],
      click(globals.elements.colorClueButtons[i]),
    );
  }

  hotkeyPlayMap.set(KeyCode.KEY_A, play); // The main play hotkey
  hotkeyPlayMap.set(KeyCode.KEY_ADD, play); // For numpad users
  hotkeyDiscardMap.set(KeyCode.KEY_D, discard); // The main discard hotkey
  hotkeyDiscardMap.set(KeyCode.KEY_SUBTRACT, discard); // For numpad users

  // Enable all of the keyboard hotkeys
  $(document).keydown(keydown);
  $(document).keyup(keyup);
}

export function destroy(): void {
  $(document).unbind("keydown", keydown);
  $(document).unbind("keyup", keyup);
}

function keydown(event: JQuery.KeyDownEvent) {
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

  // Disable keyboard hotkeys if there's a visible modal
  if (isModalVisible()) {
    return;
  }

  if (event.which === KeyCode.KEY_ESCAPE) {
    // Escape = If the chat is open, close it
    if ($("#game-chat-modal").is(":visible")) {
      globals.game!.chat.hide();
      return;
    }

    if (globals.state.replay.hypothetical !== null) {
      // Escape = If in a hypothetical, exit back to the replay
      hypothetical.end();
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

  if (event.which === KeyCode.KEY_SPACE) {
    // Space bar
    // Don't activate global empathy if we are typing in the in-game chat
    if ($("#game-chat-input").is(":focus")) {
      return;
    }

    setGlobalEmpathy(true);
    return;
  }

  // Ctrl hotkeys
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    // Ctrl + Enter = Give a clue / click on the "Give Clue" button
    if (event.which === KeyCode.KEY_RETURN) {
      clues.give(); // This function has validation inside of it
      return;
    }

    // Ctrl + c = Copy the current game ID
    if (
      event.which === KeyCode.KEY_C &&
      globals.state.finished &&
      // Account for users copying text from the chat window
      !$("#game-chat-modal").is(":visible")
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
    if (event.which === KeyCode.KEY_B) {
      // Alt + b
      // This is used for fun in shared replays
      sharedReplaySendSound("buzz");
      return;
    }
    if (event.which === KeyCode.KEY_H) {
      // Alt + h
      // This is used for fun in shared replays
      sharedReplaySendSound("holy");
      return;
    }
    if (event.which === KeyCode.KEY_N) {
      // Alt + n
      // This is used for fun in shared replays
      sharedReplaySendSound("nooo");
      return;
    }
    if (event.which === KeyCode.KEY_Z) {
      // Alt + z
      // This is used as a sound test
      globals.game!.sounds.play("turn_us");
      return;
    }

    // Other
    if (event.which === KeyCode.KEY_C) {
      // Alt + c
      globals.game!.chat.toggle();
      return;
    }
    if (event.which === KeyCode.KEY_L) {
      // Alt + l
      backToLobby();
      return;
    }
    if (event.which === KeyCode.KEY_T) {
      // Alt + t
      replay.promptTurn();
      return;
    }
  }

  // The rest of the hotkeys should be disabled if we are typing in the in-game chat
  // or if a modifier key is pressed
  if (
    $("#game-chat-input").is(":focus") ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.metaKey
  ) {
    return;
  }

  // Delete = Delete the note from the card that we are currently hovering-over, if any
  if (
    event.which === KeyCode.KEY_DELETE &&
    globals.activeHover !== null &&
    globals.activeHover instanceof HanabiCard
  ) {
    const card: HanabiCard = globals.activeHover;
    card.setNote("");
    return;
  }

  // Replay hotkeys
  if (globals.state.replay.hypothetical !== null) {
    if (event.which === KeyCode.KEY_LEFT) {
      globals.store!.dispatch({ type: "dragReset" });
      hypothetical.sendBack();
      return;
    }
  } else {
    switch (event.which) {
      case KeyCode.KEY_LEFT: {
        globals.store!.dispatch({ type: "dragReset" });
        replay.back();
        return;
      }

      case KeyCode.KEY_RIGHT: {
        replay.forward();
        return;
      }

      case KeyCode.KEY_UP:
      case KeyCode.KEY_DOWN: {
        if (globals.state.replay.shared !== null) {
          replay.toggleSharedSegments();
        } else if (!globals.state.finished) {
          if (globals.state.replay.active) {
            replay.exit();
          } else {
            replay.enter();
          }
        }
        return;
      }

      case KeyCode.KEY_OPEN_BRACKET: {
        replay.backRound();
        return;
      }

      case KeyCode.KEY_CLOSE_BRACKET: {
        replay.forwardRound();
        return;
      }

      case KeyCode.KEY_HOME: {
        replay.backFull();
        return;
      }

      case KeyCode.KEY_END: {
        replay.forwardFull();
        return;
      }

      default: {
        break;
      }
    }
  }

  // Check for other keyboard hotkeys
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  const shouldHaveKeyboardHotkeysForActions =
    // If it is our turn in an ongoing-game
    (!globals.state.replay.active && currentPlayerIndex === ourPlayerIndex) ||
    // If we are in a hypothetical and we are the shared replay leader
    (globals.state.replay.hypothetical !== null &&
      (globals.state.replay.shared === null ||
        globals.state.replay.shared.amLeader));
  const ongoingGameState =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;
  if (!shouldHaveKeyboardHotkeysForActions) {
    return;
  }

  let hotkeyFunction;
  if (
    ongoingGameState.clueTokens >=
    clueTokensRules.getAdjusted(1, globals.variant)
  ) {
    hotkeyFunction = hotkeyClueMap.get(event.which);
  }
  if (!clueTokensRules.atMax(ongoingGameState.clueTokens, globals.variant)) {
    hotkeyFunction = hotkeyFunction || hotkeyDiscardMap.get(event.which); // eslint-disable-line
  }
  hotkeyFunction = hotkeyFunction || hotkeyPlayMap.get(event.which); // eslint-disable-line
  if (hotkeyFunction !== undefined) {
    event.preventDefault();
    hotkeyFunction();
  }
}

function keyup(event: JQuery.KeyUpEvent) {
  if (event.which === KeyCode.KEY_SPACE) {
    // Space bar
    setGlobalEmpathy(false);
  }
}

function sharedReplaySendSound(sound: string) {
  if (
    // Only send sound effects in shared replays
    globals.state.replay.shared === null ||
    // Only send sound effects for shared replay leaders
    !globals.state.replay.shared.amLeader
  ) {
    return;
  }

  // Send it
  globals.lobby.conn!.send("replayAction", {
    tableID: globals.lobby.tableID,
    type: ReplayActionType.Sound,
    sound,
  });
}

function play() {
  promptCardOrder(true);
}

function discard() {
  promptCardOrder(false);
}

// If playAction is true, it plays a card
// If playAction is false, it discards a card
function promptCardOrder(playAction = true): void {
  const playerIndex =
    globals.state.replay.hypothetical === null
      ? globals.metadata.ourPlayerIndex
      : globals.state.replay.hypothetical.ongoing.turn.currentPlayerIndex!;
  const hand =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame.hands[playerIndex]
      : globals.state.replay.hypothetical.ongoing.hands[playerIndex];
  const maxSlotIndex = hand.length;
  const verb = playAction ? "play" : "discard";

  const title = document.getElementById("play-discard-title");
  if (title !== null) {
    title.innerHTML = `${verb} Card`;
  }

  const paragraph = document.getElementById("play-discard-message");
  if (paragraph !== null) {
    paragraph.innerHTML = `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${verb}.`;
  }

  const element = <HTMLInputElement>(
    document.getElementById("play-discard-card")
  );
  element.min = "1";
  element.max = maxSlotIndex.toString();
  element.value = "1";

  const button = <HTMLButtonElement>(
    document.getElementById("play-discard-button")
  );
  button.onclick = () => {
    closeModals();
    const performAction = (action: boolean, target: number) => {
      const type = action ? ActionType.Play : ActionType.Discard;

      if (globals.state.replay.hypothetical === null) {
        globals.lobby.conn!.send("action", {
          tableID: globals.lobby.tableID,
          type,
          target,
        });
      } else {
        hypothetical.send({
          type,
          target,
        });
      }
      turn.hideArrowsAndDisableDragging();
    };
    const response = element.value ?? "";

    if (response === null || response === "") {
      return;
    }
    if (/^deck$/i.test(response)) {
      // Card orders start at 0, so the final card order is the length of the deck - 1
      performAction(playAction, deckRules.totalCards(globals.variant) - 1);
      return;
    }
    const slot = parseIntSafe(response);
    if (Number.isNaN(slot)) {
      return;
    }
    if (slot < 1 || slot > maxSlotIndex) {
      return;
    }

    performAction(playAction, hand[maxSlotIndex - slot]);
  };

  showPrompt("#play-discard-modal", null, element, button);
}

const click = (element: Konva.Node) => () => {
  element.dispatchEvent(new MouseEvent("click"));
};
