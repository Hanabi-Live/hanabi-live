// The lines of the chat of the game that we are in.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import type { ChatLine } from "../lobby/chat/ChatBox.tsx";

interface GameChatState {
  readonly lines: readonly ChatLine[];
}

const initialState: GameChatState = {
  lines: [],
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
    },
  },
});

export const { gameChatLineAdded, gameChatCleared } = gameChatSlice.actions;
export const gameChatReducer = gameChatSlice.reducer;
