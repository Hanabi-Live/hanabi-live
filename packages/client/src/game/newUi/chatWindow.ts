// The in-game chat in its own browser window, so that the player can move it to another screen.

import { store } from "../../store.ts";
import { GAME_CHAT_INPUT_ID } from "../GameChatBox.tsx";
import { newUiChatPoppedOutChanged } from "./newUiSlice.ts";

/** Each tab opens the chat into the same window, and does not open a second one. */
const CHAT_WINDOW_NAME = "hanabi-live-chat";

/** The size of the chat window when it opens, in pixels. The player can resize it. */
const CHAT_WINDOW_WIDTH = 420;
const CHAT_WINDOW_HEIGHT = 720;

let chatWindow: Window | undefined;

/** The window that the chat is in, while it is popped out. */
export function getChatWindow(): Window | undefined {
  return chatWindow;
}

/**
 * Opens the chat window. Call it from a click, because browsers block a window that opens without
 * one. The chat panel then moves the chat into the window.
 */
export function popOutChat(): void {
  const opened = window.open(
    "",
    CHAT_WINDOW_NAME,
    `popup,width=${CHAT_WINDOW_WIDTH},height=${CHAT_WINDOW_HEIGHT}`,
  );
  if (opened === null) {
    console.warn("The browser blocked the chat window.");
    return;
  }

  chatWindow = opened;
  store.dispatch(newUiChatPoppedOutChanged(true));
}

/** Puts the chat back in the panel, and closes its window. */
export function dockChat(): void {
  const closing = chatWindow;
  chatWindow = undefined;
  store.dispatch(newUiChatPoppedOutChanged(false));
  closing?.close();
}

/** Brings the chat window to the front, and focuses its input. */
export function focusChatWindow(focusInput: boolean): void {
  if (chatWindow === undefined) {
    return;
  }

  chatWindow.focus();
  if (focusInput) {
    chatWindow.document
      .querySelector<HTMLElement>(`#${GAME_CHAT_INPUT_ID}`)
      ?.focus();
  }
}
