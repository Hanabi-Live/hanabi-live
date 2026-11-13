// The chat of the game that we are in: its lines, and how many of them we have not read.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import type { ChatLine } from "../lobby/chat/ChatBox.tsx";

interface GameChatState {
  readonly lines: readonly ChatLine[];
  readonly unread: number;
}

const initialState: GameChatState = {
  lines: [],
  unread: 0,
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
  },
});

export const { gameChatLineAdded, gameChatCleared, gameChatUnreadChanged } =
  gameChatSlice.actions;
export const gameChatReducer = gameChatSlice.reducer;
