// The in-game chat in its own browser window, so that the player can move it away from the table.

import { store } from "../../store.ts";
import { GAME_CHAT_INPUT_ID } from "../GameChatBox.tsx";
import {
  newUiChatOpenChanged,
  newUiChatPoppedOutChanged,
} from "./newUiSlice.ts";

/** Each tab opens the chat into the same window, and does not open a second one. */
const CHAT_WINDOW_NAME = "hanabi-live-chat";

/** The size of the chat window when it opens, in pixels. The player can resize it. */
const CHAT_WINDOW_WIDTH = 420;
const CHAT_WINDOW_HEIGHT = 720;

/**
 * Chromium's Document Picture-in-Picture API, which opens a window that stays on top of the other
 * windows. TypeScript does not have types for it yet.
 */
interface DocumentPictureInPicture {
  readonly requestWindow: (options: {
    readonly width: number;
    readonly height: number;
  }) => Promise<Window>;
}

declare global {
  // eslint-disable-next-line vars-on-top
  var documentPictureInPicture: DocumentPictureInPicture | undefined;
}

let chatWindow: Window | undefined;

/** The window that the chat is in, while it is popped out. */
export function getChatWindow(): Window | undefined {
  return chatWindow;
}

/**
 * Opens the chat window. Call it from a click, because browsers block a window that opens without
 * one. The chat panel then moves the chat into the window.
 *
 * The window stays on top of the game, so that clicking the table does not hide the chat. Browsers
 * without the Picture-in-Picture API get a normal window instead.
 */
export function popOutChat(): void {
  openChatWindow()
    .then((opened) => {
      if (opened === undefined) {
        console.warn("The browser blocked the chat window.");
        return;
      }

      chatWindow = opened;
      store.dispatch(newUiChatPoppedOutChanged(true));
    })
    .catch((error: unknown) => {
      console.error("Failed to open the chat window:", error);
    });
}

async function openChatWindow(): Promise<Window | undefined> {
  if (globalThis.documentPictureInPicture !== undefined) {
    try {
      return await globalThis.documentPictureInPicture.requestWindow({
        width: CHAT_WINDOW_WIDTH,
        height: CHAT_WINDOW_HEIGHT,
      });
    } catch (error) {
      console.warn("Failed to open the chat on top of the game:", error);
    }
  }

  return (
    window.open(
      "",
      CHAT_WINDOW_NAME,
      `popup,width=${CHAT_WINDOW_WIDTH},height=${CHAT_WINDOW_HEIGHT}`,
    ) ?? undefined
  );
}

/** Puts the chat back in the panel, and closes its window. */
export function dockChat(): void {
  const closing = chatWindow;
  chatWindow = undefined;
  store.dispatch(newUiChatPoppedOutChanged(false));
  closing?.close();
}

/**
 * Puts the chat back after the player closed its window. The panel stays collapsed, because the
 * player closed the chat and did not ask to see it in the panel.
 */
export function chatWindowClosed(): void {
  store.dispatch(newUiChatOpenChanged(false));
  dockChat();
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
