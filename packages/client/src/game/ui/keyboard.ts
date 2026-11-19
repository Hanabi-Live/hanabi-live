// Functions for handling all of the keyboard shortcuts.

import type { CardOrder } from "@hanabi-live/game";
import {
  getClueCost,
  getTotalCardsInDeck,
  isAtMaxClueTokens,
} from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import type Konva from "konva";
import { globals as lobbyGlobals } from "../../Globals.ts";
import { isElementShown } from "../../elementVisibility.ts";
import { getHotkeyLetter } from "../../hotkeyLetter.ts";
import { Screen } from "../../lobby/types/Screen.ts";
import { isModalVisible, showPrompt } from "../../modals.ts";
import * as sounds from "../../sounds.ts";
import { store } from "../../store.ts";
import { getHtmlElement } from "../../utils.ts";
import { GAME_CHAT_INPUT_ID } from "../GameChatBox.tsx";
import * as gameChat from "../chat.ts";
import { getColorKeyIndex, getRankKeyIndex } from "../clueKeys.ts";
import { confirmPlay } from "../confirmPlay.ts";
import { controlsHypothetical } from "../controlsHypothetical.ts";
import * as hypothetical from "../hypothetical.ts";
import { isOurSeat } from "../ourSeat.ts";
import { SoundType } from "../types/SoundType.ts";
import { HanabiCard } from "./HanabiCard.ts";
import { globals } from "./UiGlobals.ts";
import * as arrows from "./arrows.ts";
import { backToLobby } from "./backToLobby.ts";
import * as clues from "./clues.ts";
import * as replay from "./replay.ts";
import { setGlobalEmpathy } from "./setGlobalEmpathy.ts";
import * as turn from "./turn.ts";

type Callback = () => void;

function selectNextPlayerTarget() {
  if (globals.state.replay.hypothetical === undefined) {
    globals.elements.clueTargetButtonGroup!.selectNextTarget();
  } else {
    globals.elements.clueTargetButtonGroup2!.selectNextTarget();
  }
}

export function init(): void {
  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", keyup);
}

export function destroy(): void {
  document.removeEventListener("keydown", keydown);
  document.removeEventListener("keyup", keyup);
}

function keydown(event: KeyboardEvent) {
  // Disable hotkeys if we not currently in a game, if the game's state has not arrived yet, if we
  // are editing a note, or if there's a visible modal. (Not being in a game should not be possible,
  // as the handler gets unregistered upon going back to the lobby, but double check just in case.)
  // Until the state arrives, the ongoing game is the initial state, where the first player is to
  // move, so that player would get the hotkeys for their turn.
  if (
    store.getState().session.screen !== Screen.Game
    || globals.state.visibleState === undefined
    || globals.editingNote !== undefined
    || isModalVisible()
  ) {
    return;
  }

  if (event.key === "Escape") {
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

  if (event.key === " ") {
    // Space bar. Do not activate global empathy if we are typing in the in-game chat.
    if (isGameChatInputFocused()) {
      return;
    }

    setGlobalEmpathy(true);
    return;
  }

  // Ctrl + Enter = Give a clue / click on the "Give Clue" button. (The redesigned game screen
  // handles the clue hotkeys itself.)
  if (
    event.ctrlKey
    && !event.shiftKey
    && !event.altKey
    && !event.metaKey
    && event.key === "Enter"
    && !store.getState().newUi.shown
  ) {
    clues.give(); // This function has validation inside of it
    return;
  }

  // Alt hotkeys
  if (event.altKey && !event.ctrlKey && !event.shiftKey && !event.metaKey) {
    switch (getHotkeyLetter(event)) {
      // Sounds. These are used for fun in shared replays.
      case "a": {
        sharedReplaySendSound("clap");
        return;
      }

      case "b": {
        sharedReplaySendSound("buzz");
        return;
      }

      case "h": {
        sharedReplaySendSound("holy");
        return;
      }

      case "n": {
        sharedReplaySendSound("nooo");
        return;
      }

      // A sound test.
      case "z": {
        sounds.play(SoundType.Us);
        return;
      }

      case "c": {
        gameChat.toggle();
        return;
      }

      case "l": {
        backToLobby();
        return;
      }

      case "t": {
        replay.promptTurn();
        return;
      }

      default: {
        break;
      }
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
    event.key === "Delete"
    && globals.activeHover !== undefined
    && globals.activeHover instanceof HanabiCard
  ) {
    const card: HanabiCard = globals.activeHover;
    card.setNote("");
    return;
  }

  // Page Up = Enter a hypothetical from the replay, as the "Enter Hypothetical" button does. (The
  // browser would otherwise scroll the page.)
  if (event.key === "PageUp") {
    event.preventDefault();
    if (globals.state.finished || globals.state.replay.segment !== undefined) {
      hypothetical.startHypothetical(); // This function has validation inside of it
    }
    return;
  }

  // Page Down = Leave the hypothetical.
  if (event.key === "PageDown") {
    event.preventDefault();
    hypothetical.endHypothetical(); // This function has validation inside of it
    return;
  }

  // Replay hotkeys
  if (
    globals.state.replay.hypothetical === undefined
    || replay.isSpectatingHypothetical()
  ) {
    // The brackets count by where the keys are, to the right of P, because many keyboards need
    // AltGr to type "[" and "]".
    if (event.code === "BracketLeft") {
      replay.backRound();
      return;
    }
    if (event.code === "BracketRight") {
      replay.forwardRound();
      return;
    }

    // The keys below would otherwise also scroll the element that was clicked last, such as the
    // chat.
    switch (event.key) {
      case "ArrowLeft": {
        event.preventDefault();
        replay.back();
        return;
      }

      case "ArrowRight": {
        event.preventDefault();
        replay.forward();
        return;
      }

      case "ArrowUp":
      case "ArrowDown": {
        if (globals.state.replay.shared !== undefined) {
          event.preventDefault();
          replay.toggleSharedSegments();
        } else if (!globals.state.finished) {
          event.preventDefault();
          if (globals.state.replay.segment === undefined) {
            replay.enter();
          } else {
            replay.exit();
          }
        }
        return;
      }

      case "Home": {
        event.preventDefault();
        replay.backFull();
        return;
      }

      case "End": {
        event.preventDefault();
        replay.forwardFull();
        return;
      }

      default: {
        break;
      }
    }
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    hypothetical.sendHypotheticalBack();
    return;
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    hypothetical.sendHypotheticalPassTurn();
    return;
  }

  // Normal gameplay hotkeys
  const hotkeyFunction = getNormalGameplayHotkeyFunction(event);
  if (hotkeyFunction === undefined) {
    return;
  }

  event.preventDefault();
  hotkeyFunction();
}

/** The "normal" hotkeys include hotkeys for playing cards, discarding cards, and giving clues. */
function getNormalGameplayHotkeyFunction(
  event: KeyboardEvent,
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
    const hotkeyFunction = getClueHotkeyFunction(event);
    if (hotkeyFunction !== undefined) {
      return hotkeyFunction;
    }
  }

  const atMaxClueTokens = isAtMaxClueTokens(
    ongoingGameState.clueTokens,
    globals.variant,
  );
  // "a" and "d", and "+" and "-" on the number pad.
  if (
    !atMaxClueTokens
    && (getHotkeyLetter(event) === "d" || event.code === "NumpadSubtract")
  ) {
    return discard;
  }
  if (getHotkeyLetter(event) === "a" || event.code === "NumpadAdd") {
    return play;
  }

  return undefined;
}

/**
 * Tab and ";" select the next player. "1" to "5" select a rank (see `getRankKeyIndex`). "q" to "y"
 * select a color (see `getColorKeyIndex`). We use "qwerty" because these keys are next to the
 * number keys, and because the clue colors change between variants.
 */
function getClueHotkeyFunction(event: KeyboardEvent): Callback | undefined {
  if (event.key === "Tab" || event.key === ";") {
    return selectNextPlayerTarget;
  }

  const rankIndex = getRankKeyIndex(event);
  if (rankIndex !== undefined) {
    const button = globals.elements.rankClueButtons[rankIndex];
    return button === undefined ? undefined : click(button);
  }

  const colorIndex = getColorKeyIndex(event);
  const button =
    colorIndex === undefined
      ? undefined
      : globals.elements.colorClueButtons[colorIndex];
  return button === undefined ? undefined : click(button);
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
  if (event.key === " ") {
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
  // This shows that the move waits for the server, as a move made with the mouse does.
  turn.end({
    type: actionType,
    order,
  });
  arrows.hideAll();
}
