// Functions for handling all of the keyboard shortcuts.

import type { CardOrder } from "@hanabi-live/game";
import {
  getAdjustedClueTokens,
  getTotalCardsInDeck,
  isAtMaxClueTokens,
} from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import * as KeyCode from "keycode-js";
import type Konva from "konva";
import { Screen } from "../../lobby/types/Screen";
import { closeModals, isModalVisible, showPrompt } from "../../modals";
import {
  copyStringToClipboard,
  getHTMLElement,
  getHTMLInputElement,
} from "../../utils";
import { ActionType } from "../types/ActionType";
import { ReplayActionType } from "../types/ReplayActionType";
import { SoundType } from "../types/SoundType";
import { HanabiCard } from "./HanabiCard";
import { globals } from "./UIGlobals";
import { backToLobby } from "./backToLobby";
import * as clues from "./clues";
import * as hypothetical from "./hypothetical";
import * as replay from "./replay";
import { setGlobalEmpathy } from "./setGlobalEmpathy";
import * as turn from "./turn";

type Callback = () => void;

const hotkeyClueMap = new Map<number, Callback>();
const hotkeyPlayMap = new Map<number, Callback>();
const hotkeyDiscardMap = new Map<number, Callback>();

const playDiscardButton = getHTMLElement("#play-discard-button");
const playDiscardCard = getHTMLInputElement("#play-discard-card");
const playDiscardMessage = getHTMLElement("#play-discard-message");
const playDiscardTitle = getHTMLElement("#play-discard-title");

// Build a mapping of hotkeys to functions.
export function init(): void {
  hotkeyClueMap.clear();
  hotkeyPlayMap.clear();
  hotkeyDiscardMap.clear();

  // Add "Tab" for player selection.
  hotkeyClueMap.set(KeyCode.KEY_TAB, () => {
    if (globals.state.replay.hypothetical === null) {
      globals.elements.clueTargetButtonGroup!.selectNextTarget();
    } else {
      globals.elements.clueTargetButtonGroup2!.selectNextTarget();
    }
  });

  // Add "1", "2", "3", "4", and "5" (for rank clues).
  for (const [
    i,
    rankClueButton,
  ] of globals.elements.rankClueButtons.entries()) {
    hotkeyClueMap.set(i + KeyCode.KEY_1, click(rankClueButton)); // Normal keyboard
    hotkeyClueMap.set(i + KeyCode.KEY_NUMPAD1, click(rankClueButton)); // Numpad
  }

  // Add "q", "w", "e", "r", "t", and "y" (for color clues). (We use qwert since they are
  // conveniently next to 12345, and also because the clue colors can change between different
  // variants.)
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
      clueKeyRow[i]!,
      click(globals.elements.colorClueButtons[i]!),
    );
  }

  hotkeyPlayMap.set(KeyCode.KEY_A, play); // The main play hotkey
  hotkeyPlayMap.set(KeyCode.KEY_ADD, play); // For numpad users
  hotkeyDiscardMap.set(KeyCode.KEY_D, discard); // The main discard hotkey
  hotkeyDiscardMap.set(KeyCode.KEY_SUBTRACT, discard); // For numpad users

  // Enable all of the keyboard hotkeys.
  $(document).keydown(keydown);
  $(document).keyup(keyup);
}

export function destroy(): void {
  $(document).unbind("keydown", keydown);
  $(document).unbind("keyup", keyup);
}

function keydown(event: JQuery.KeyDownEvent) {
  // Disable hotkeys if we not currently in a game. (This should not be possible, as the handler
  // gets unregistered upon going back to the lobby, but double check just in case.)
  if (globals.lobby.currentScreen !== Screen.Game) {
    return;
  }

  // Disable keyboard hotkeys if we are editing a note.
  if (globals.editingNote !== null) {
    return;
  }

  // Disable keyboard hotkeys if there's a visible modal.
  if (isModalVisible()) {
    return;
  }

  if (event.which === KeyCode.KEY_ESCAPE) {
    // Escape = If the chat is open, close it.
    if ($("#game-chat-modal").is(":visible")) {
      globals.game!.chat.hide();
      return;
    }

    if (globals.state.replay.hypothetical !== null) {
      // Escape = If in a hypothetical, exit back to the replay.
      hypothetical.endHypothetical();
      return;
    }

    if (globals.state.finished) {
      // Escape = If in a replay, exit back to the lobby.
      backToLobby();
      return;
    }

    // Escape = If in an in-game replay, exit back to the game.
    replay.exit();
    return;
  }

  if (event.which === KeyCode.KEY_SPACE) {
    // Space bar. Do not activate global empathy if we are typing in the in-game chat.
    if ($("#game-chat-input").is(":focus")) {
      return;
    }

    setGlobalEmpathy(true);
    return;
  }

  // Ctrl hotkeys
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    // Ctrl + Enter = Give a clue / click on the "Give Clue" button.
    if (event.which === KeyCode.KEY_RETURN) {
      clues.give(); // This function has validation inside of it
      return;
    }

    // Ctrl + c = Copy the current game ID.
    if (
      event.which === KeyCode.KEY_C &&
      globals.state.finished &&
      // Account for users copying text from the chat window.
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
      // Alt + b. This is used for fun in shared replays.
      sharedReplaySendSound("buzz");
      return;
    }
    if (event.which === KeyCode.KEY_H) {
      // Alt + h. This is used for fun in shared replays.
      sharedReplaySendSound("holy");
      return;
    }
    if (event.which === KeyCode.KEY_N) {
      // Alt + n. This is used for fun in shared replays.
      sharedReplaySendSound("nooo");
      return;
    }
    if (event.which === KeyCode.KEY_Z) {
      // Alt + z. This is used as a sound test.
      globals.game!.sounds.play(SoundType.Us);
      return;
    }
    if (event.which === KeyCode.KEY_A) {
      // Alt + a. This is used for fun in shared replays.
      sharedReplaySendSound("clap");
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

  // The rest of the hotkeys should be disabled if we are typing in the in-game chat or if a
  // modifier key is pressed.
  if (
    $("#game-chat-input").is(":focus") ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.metaKey
  ) {
    return;
  }

  // Delete = Delete the note from the card that we are currently hovering-over, if any.
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
  if (globals.state.replay.hypothetical === null) {
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
  } else if (event.which === KeyCode.KEY_LEFT) {
    globals.store!.dispatch({ type: "dragReset" });
    hypothetical.sendHypotheticalBack();
    return;
  }

  // Normal gameplay hotkeys
  const hotkeyFunction = getNormalGameplayHotkeyFunction(event.which);
  if (hotkeyFunction !== undefined) {
    event.preventDefault();
    hotkeyFunction();
  }
}

/** The "normal" hotkeys include hotkeys for playing cards, discarding cards, and giving clues. */
function getNormalGameplayHotkeyFunction(
  keyCode: number,
): Callback | undefined {
  // Do nothing if we are not in a normal game situation.
  const { currentPlayerIndex } = globals.state.ongoingGame.turn;
  const { ourPlayerIndex } = globals.metadata;
  const ourTurnInOngoingGame =
    !globals.state.replay.active && currentPlayerIndex === ourPlayerIndex;
  const amSharedReplayLeaderInHypothetical =
    globals.state.replay.shared !== null &&
    globals.state.replay.shared.amLeader &&
    globals.state.replay.hypothetical !== null;
  const shouldHaveKeyboardHotkeysForActions =
    ourTurnInOngoingGame || amSharedReplayLeaderInHypothetical;
  if (!shouldHaveKeyboardHotkeysForActions) {
    return undefined;
  }

  const ongoingGameState =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;

  const oneClueToken = getAdjustedClueTokens(1, globals.variant);
  const isClueAvailable = ongoingGameState.clueTokens >= oneClueToken;
  if (isClueAvailable) {
    const hotkeyFunction = hotkeyClueMap.get(keyCode);
    if (hotkeyFunction !== undefined) {
      return hotkeyFunction;
    }
  }

  const atMaxClueTokens = isAtMaxClueTokens(
    ongoingGameState.clueTokens,
    globals.variant,
  );
  if (!atMaxClueTokens) {
    const hotkeyFunction = hotkeyDiscardMap.get(keyCode);
    if (hotkeyFunction !== undefined) {
      return hotkeyFunction;
    }
  }

  return hotkeyPlayMap.get(keyCode);
}

function keyup(event: JQuery.KeyUpEvent) {
  if (event.which === KeyCode.KEY_SPACE) {
    // Space bar
    setGlobalEmpathy(false);
    if (globals.state.replay.hypothetical !== null) {
      hypothetical.changeStartingHandVisibility();
    }
  }
}

function sharedReplaySendSound(sound: string) {
  if (
    // Only send sound effects in shared replays.
    globals.state.replay.shared === null ||
    // Only send sound effects for shared replay leaders.
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
  promptCardOrder(ActionType.Play);
}

function discard() {
  promptCardOrder(ActionType.Discard);
}

function promptCardOrder(actionType: ActionType.Play | ActionType.Discard) {
  const playerIndex =
    globals.state.replay.hypothetical === null
      ? globals.metadata.ourPlayerIndex
      : globals.state.replay.hypothetical.ongoing.turn.currentPlayerIndex;

  if (playerIndex === null) {
    return;
  }

  const hand =
    globals.state.replay.hypothetical === null
      ? globals.state.ongoingGame.hands[playerIndex]
      : globals.state.replay.hypothetical.ongoing.hands[playerIndex];

  if (hand === undefined) {
    return;
  }

  const maxSlotIndex = hand.length;
  const verb = ActionType[actionType];

  playDiscardTitle.innerHTML = `${verb} Card`;
  playDiscardMessage.innerHTML = `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${verb.toLowerCase()}.`;

  playDiscardCard.min = "1";
  playDiscardCard.max = maxSlotIndex.toString();
  playDiscardCard.value = "1";

  // We can't use "addEventListener" because we can't easily remove the previous listener.
  // eslint-disable-next-line unicorn/prefer-add-event-listener
  playDiscardButton.onclick = () => {
    closeModals();

    const response = playDiscardCard.value;
    if (response === "") {
      return;
    }
    if (/^deck$/i.test(response)) {
      // Card orders start at 0, so the final card order is the length of the deck - 1.
      const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
      const cardOrder = (totalCardsInDeck - 1) as CardOrder;
      performAction(actionType, cardOrder);
      return;
    }

    const slot = parseIntSafe(response);
    if (slot === undefined) {
      return;
    }
    if (slot < 1 || slot > maxSlotIndex) {
      return;
    }

    const cardOrder = hand[maxSlotIndex - slot];
    if (cardOrder !== undefined) {
      performAction(actionType, cardOrder);
    }
  };

  showPrompt("#play-discard-modal", null, playDiscardCard, playDiscardButton);
}

function click(element: Konva.Node) {
  return () => {
    element.dispatchEvent(new MouseEvent("click"));
  };
}

function performAction(
  actionType: ActionType.Play | ActionType.Discard,
  target: CardOrder,
) {
  if (globals.state.replay.hypothetical === null) {
    globals.lobby.conn!.send("action", {
      tableID: globals.lobby.tableID,
      type: actionType,
      target,
    });
  } else {
    hypothetical.sendHypotheticalAction({
      type: actionType,
      target,
    });
  }

  turn.hideArrowsAndDisableDragging();
}
