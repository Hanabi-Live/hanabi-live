// Zen mode hides the chat, its unread messages, and who is watching, so that the players can focus
// on the game. A player right-clicks the chat button to turn it on or off. Both game screens use
// it.

import { store } from "../store.ts";
import * as gameChat from "./chat.ts";
import { gameChatZenChanged } from "./gameChatSlice.ts";

/** Turns zen mode on or off. A finished game has no players to distract, so it turns it off. */
export function toggleZen(): void {
  const { game, gameChat: chat } = store.getState();
  const zen = game.current?.finished === false && !chat.zen;
  store.dispatch(gameChatZenChanged(zen));
  if (zen) {
    gameChat.hide();
  }
}

/** Whether zen mode hides the chat's unread messages and who is watching. */
export function isZenShown(finished: boolean): boolean {
  return !finished && store.getState().gameChat.zen;
}
