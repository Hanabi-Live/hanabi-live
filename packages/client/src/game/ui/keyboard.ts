// Functions for handling all of the keyboard shortcuts.

/* eslint-disable unicorn/prefer-keyboard-event-key -- The hotkeys compare key codes. On macOS,
Alt + B gives a symbol in `event.key`, not "b". And `event.code` names the physical key, which moves
the hotkeys on French keyboards. */

import type { CardOrder } from "@hanabi-live/game";
import {
  getClueCost,
  getTotalCardsInDeck,
  isAtMaxClueTokens,
} from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import * as KeyCode from "keycode-js";
import type Konva from "konva";
import { globals as lobbyGlobals } from "../../Globals.ts";
import { isElementShown } from "../../elementVisibility.ts";
import { Screen } from "../../lobby/types/Screen.ts";
import { isModalVisible, showPrompt } from "../../modals.ts";
import * as sounds from "../../sounds.ts";
import { store } from "../../store.ts";
import { copyStringToClipboard, getHtmlElement } from "../../utils.ts";
import { toWireAction } from "../../wire.ts";
import { GAME_CHAT_INPUT_ID } from "../GameChatBox.tsx";
import * as gameChat from "../chat.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import * as hypothetical from "../hypothetical.ts";
import { isOurSeat } from "../ourSeat.ts";
import { SoundType } from "../types/SoundType.ts";
import { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { backToLobby } from "./backToLobby.ts";
import * as clues from "./clues.ts";
import { confirmPlay } from "./confirmPlay.ts";
import * as replay from "./replay.ts";
import { setGlobalEmpathy } from "./setGlobalEmpathy.ts";

type Callback = () => void;

const hotkeyClueMap = new Map<number, Callback>();
const hotkeyPlayMap = new Map<number, Callback>();
const hotkeyDiscardMap = new Map<number, Callback>();

function selectNextPlayerTarget() {
  if (globals.state.replay.hypothetical === undefined) {
    globals.elements.clueTargetButtonGroup!.selectNextTarget();
  } else {
    globals.elements.clueTargetButtonGroup2!.selectNextTarget();
  }
}

// Build a mapping of hotkeys to functions.
export function init(): void {
  hotkeyClueMap.clear();
  hotkeyPlayMap.clear();
  hotkeyDiscardMap.clear();

  // Add Tab and semicolon for player selection.
  hotkeyClueMap.set(KeyCode.KEY_TAB, selectNextPlayerTarget);
  hotkeyClueMap.set(KeyCode.KEY_SEMICOLON, selectNextPlayerTarget);

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
  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);
}

export function destroy(): void {
  document.removeEventListener("keydown", keydown);
  document.removeEventListener("keyup", keyup);
}

function keydown(event: KeyboardEvent) {
  // Disable hotkeys if we not currently in a game, if we are editing a note, or if there's a
  // visible modal. (Not being in a game should not be possible, as the handler gets unregistered
  // upon going back to the lobby, but double check just in case.)
  if (
    store.getState().session.screen !== Screen.Game
    || globals.editingNote !== undefined
    || isModalVisible()
  ) {
    return;
  }

  if (event.which === KeyCode.KEY_ESCAPE) {
    // Escape = If the menu to end the game is open, close it.
    if (globals.elements.terminateMenu?.isVisible() === true) {
      globals.elements.terminateMenu.close();
      return;
    }

    // Escape = If the chat is open, close it.
    if (isElementShown(getHtmlElement("#game-chat-modal"))) {
      gameChat.hide();
      return;
    }

    if (globals.state.replay.hypothetical !== undefined) {
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
    if (isGameChatInputFocused()) {
      return;
    }

    // Ctrl + Space = Empathy that also applies notes (in a replay, those of each hand's player).
    setGlobalEmpathy(true, event.ctrlKey);
    return;
  }

  // Ctrl hotkeys
  if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
    // Ctrl + Enter = Give a clue / click on the "Give Clue" button. (The redesigned game screen
    // handles the clue hotkeys itself.)
    if (event.which === KeyCode.KEY_RETURN && !store.getState().newUi.shown) {
      clues.give(); // This function has validation inside of it
      return;
    }

    // Ctrl + c = Copy the current game ID.
    if (
      event.which === KeyCode.KEY_C
      && globals.state.finished
      // Account for users copying text from the chat window.
      && !isElementShown(getHtmlElement("#game-chat-modal"))
    ) {
      if (globals.state.replay.gameId !== undefined) {
        copyStringToClipboard(globals.state.replay.gameId.toString());
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
      sounds.play(SoundType.Us);
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
      gameChat.toggle();
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
    isGameChatInputFocused()
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || event.metaKey
  ) {
    return;
  }

  // Delete = Delete the note from the card that we are currently hovering-over, if any.
  if (
    event.which === KeyCode.KEY_DELETE
    && globals.activeHover !== undefined
    && globals.activeHover instanceof HanabiCard
  ) {
    const card: HanabiCard = globals.activeHover;
    card.setNote("");
    return;
  }

  // Replay hotkeys
  if (
    globals.state.replay.hypothetical === undefined
    || replay.isSpectatingHypothetical()
  ) {
    switch (event.which) {
      case KeyCode.KEY_LEFT: {
        replay.back();
        return;
      }

      case KeyCode.KEY_RIGHT: {
        replay.forward();
        return;
      }

      case KeyCode.KEY_UP:
      case KeyCode.KEY_DOWN: {
        if (globals.state.replay.shared !== undefined) {
          replay.toggleSharedSegments();
        } else if (!globals.state.finished) {
          if (globals.state.replay.segment === undefined) {
            replay.enter();
          } else {
            replay.exit();
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
    hypothetical.sendHypotheticalBack();
    return;
  } else if (event.which === KeyCode.KEY_RIGHT) {
    hypothetical.sendHypotheticalPassTurn();
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
  const ourTurnInOngoingGame =
    globals.state.replay.segment === undefined
    && isOurSeat(currentPlayerIndex, globals.metadata);
  const controlHypotheticalInSharedReplay =
    globals.state.replay.shared !== undefined
    && controlsHypothetical(globals.state);
  const shouldHaveKeyboardHotkeysForActions =
    ourTurnInOngoingGame || controlHypotheticalInSharedReplay;
  if (!shouldHaveKeyboardHotkeysForActions) {
    return undefined;
  }

  const ongoingGameState =
    globals.state.replay.hypothetical === undefined
      ? globals.state.ongoingGame
      : globals.state.replay.hypothetical.ongoing;

  const isClueAvailable =
    ongoingGameState.clueTokens >= getClueCost(globals.variant);
  // The redesigned game screen handles the clue hotkeys itself, on its own clue panel.
  if (isClueAvailable && !store.getState().newUi.shown) {
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

/** Whether the player is typing in the game's chat, as jQuery's ":focus" selector. */
function isGameChatInputFocused(): boolean {
  const { activeElement } = document;
  return (
    document.hasFocus()
    && activeElement !== null
    && activeElement.id === GAME_CHAT_INPUT_ID
  );
}

function keyup(event: KeyboardEvent) {
  if (event.which === KeyCode.KEY_SPACE) {
    // Space bar
    setGlobalEmpathy(false);
  }
}

function sharedReplaySendSound(sound: "buzz" | "clap" | "holy" | "nooo") {
  if (
    // Only send sound effects in shared replays.
    globals.state.replay.shared === undefined
    // Only send sound effects for shared replay leaders.
    || !globals.state.replay.shared.amLeader
  ) {
    return;
  }

  // Send it
  lobbyGlobals.connection.send("replayAction", {
    tableId: lobbyGlobals.joinedTableId,
    action: {
      type: "sound",
      sound,
    },
  });
}

function play() {
  promptCardOrder("play");
}

function discard() {
  promptCardOrder("discard");
}

type PlayOrDiscard = "play" | "discard";

function promptCardOrder(actionType: PlayOrDiscard) {
  const playerIndex =
    globals.state.replay.hypothetical === undefined
      ? globals.metadata.ourPlayerIndex
      : globals.state.replay.hypothetical.ongoing.turn.currentPlayerIndex;

  if (playerIndex === undefined) {
    return;
  }

  const hand =
    globals.state.replay.hypothetical === undefined
      ? globals.state.ongoingGame.hands[playerIndex]
      : globals.state.replay.hypothetical.ongoing.hands[playerIndex];

  if (hand === undefined) {
    return;
  }

  const maxSlotIndex = hand.length;
  const verb = actionType === "play" ? "Play" : "Discard";

  showPrompt(
    {
      type: "number",
      title: `${verb} Card`,
      description: `Enter the slot number (1 to ${maxSlotIndex}) of the card to ${verb.toLowerCase()}.`,
      current: undefined,
      label: "Card:",
      value: "1",
      min: "1",
      max: maxSlotIndex.toString(),
    },
    (response) => {
      if (response === "") {
        return;
      }
      if (/^deck$/iu.test(response)) {
        // Card orders start at 0, so the final card order is the length of the deck - 1.
        const totalCardsInDeck = getTotalCardsInDeck(globals.variant);
        const cardOrder = (totalCardsInDeck - 1) as CardOrder;
        performAction(actionType, cardOrder);
        return;
      }

      const slot = parseIntSafe(response);
      if (slot === undefined || slot < 1 || slot > maxSlotIndex) {
        return;
      }

      const cardOrder = hand[maxSlotIndex - slot];
      if (cardOrder !== undefined) {
        performAction(actionType, cardOrder);
      }
    },
  );
}

function click(element: Konva.Node) {
  return () => {
    element.dispatchEvent(new MouseEvent("click"));
  };
}

function performAction(actionType: PlayOrDiscard, order: CardOrder) {
  const cardState = globals.state.visibleState?.deck[order];
  if (actionType === "play" && cardState !== undefined) {
    confirmPlay(cardState, () => {
      sendAction(actionType, order);
    });
    return;
  }

  sendAction(actionType, order);
}

function sendAction(actionType: PlayOrDiscard, order: CardOrder) {
  if (globals.state.replay.hypothetical === undefined) {
    lobbyGlobals.connection.send(
      "playerAction",
      toWireAction(lobbyGlobals.joinedTableId, {
        type: actionType,
        order,
      }),
    );
  } else {
    hypothetical.sendHypotheticalAction({
      type: actionType,
      order,
    });
  }

  arrows.hideAll();
}
