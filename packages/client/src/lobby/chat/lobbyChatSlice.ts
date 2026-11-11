// The lines of the lobby chat. They include private messages that arrive while we are not at a
// table.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { ChatLine } from "./ChatBox.tsx";

interface LobbyChatState {
  readonly lines: readonly ChatLine[];
}

const initialState: LobbyChatState = {
  lines: [],
};

const lobbyChatSlice = createSlice({
  name: "lobbyChat",
  initialState,
  reducers: {
    lobbyChatLineAdded(state, action: PayloadAction<ChatLine>) {
      state.lines.push(action.payload);
    },
    lobbyChatLineDeleted(state, action: PayloadAction<number>) {
      state.lines = state.lines.filter(
        (line) => line.chatID !== action.payload,
      );
    },
  },
});

export const { lobbyChatLineAdded, lobbyChatLineDeleted } =
  lobbyChatSlice.actions;
export const lobbyChatReducer = lobbyChatSlice.reducer;
