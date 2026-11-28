// The lines of the lobby chat. They include private messages that arrive while we are not at a
// table.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import type { ChatLine } from "./ChatBox.tsx";

interface LobbyChatState {
  readonly lines: readonly ChatLine[];

  /**
   * Whether the server is sending the notices that follow the lobby's past messages, such as its
   * message of the day.
   */
  readonly intro: boolean;
}

const initialState: LobbyChatState = {
  lines: [],
  intro: false,
};

const lobbyChatSlice = createSlice({
  name: "lobbyChat",
  initialState,
  reducers: {
    lobbyChatLineAdded(state, action: PayloadAction<ChatLine>) {
      state.lines.push(castDraft(action.payload));
    },
    /**
     * The server sent the lobby's past messages, which have these IDs. It does so after each
     * reconnect. Then its notices come again, so the old ones go. A public message that the list
     * could hold but does not was deleted while we were away.
     */
    lobbyChatListed(state, action: PayloadAction<readonly number[]>) {
      const listed = new Set(action.payload);
      const oldest = Math.min(...listed);
      const newest = Math.max(...listed);
      state.lines = state.lines.filter(
        (line) =>
          line.intro !== true
          && (line.chatId === undefined
            || line.privateMessage !== undefined
            || line.chatId < oldest
            || line.chatId > newest
            || listed.has(line.chatId)),
      );
      state.intro = true;
    },
    /** The server sent everything that it sends when the lobby loads. */
    lobbyChatIntroEnded(state) {
      state.intro = false;
    },
    lobbyChatLineDeleted(state, action: PayloadAction<number>) {
      state.lines = state.lines.filter(
        (line) => line.chatId !== action.payload,
      );
    },
  },
});

export const {
  lobbyChatLineAdded,
  lobbyChatListed,
  lobbyChatIntroEnded,
  lobbyChatLineDeleted,
} = lobbyChatSlice.actions;
export const lobbyChatReducer = lobbyChatSlice.reducer;
