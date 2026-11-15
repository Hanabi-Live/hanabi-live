// The chat of the game that we are in: its lines, how many of them we have not read, and whether
// zen mode hides it.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import type { ChatLine } from "../lobby/chat/ChatBox.tsx";

interface GameChatState {
  readonly lines: readonly ChatLine[];
  readonly unread: number;

  /**
   * Whether zen mode is on: the chat button hides the unread messages, and the screen hides who is
   * watching, so that the players can focus on the game. It lasts until the player turns it off.
   */
  readonly zen: boolean;
}

const initialState: GameChatState = {
  lines: [],
  unread: 0,
  zen: false,
};

const gameChatSlice = createSlice({
  name: "gameChat",
  initialState,
  reducers: {
    gameChatLineAdded(state, action: PayloadAction<ChatLine>) {
      state.lines.push(castDraft(action.payload));
    },
    gameChatCleared(state) {
      state.lines = [];
      state.unread = 0;
    },
    gameChatUnreadChanged(state, action: PayloadAction<number>) {
      state.unread = action.payload;
    },
    gameChatZenChanged(state, action: PayloadAction<boolean>) {
      state.zen = action.payload;
    },
  },
});

export const {
  gameChatLineAdded,
  gameChatCleared,
  gameChatUnreadChanged,
  gameChatZenChanged,
} = gameChatSlice.actions;
export const gameChatReducer = gameChatSlice.reducer;
