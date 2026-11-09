// The lines of the lobby chat. They include private messages that arrive while we are not at a
// table.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

export interface LobbyChatLine {
  /** Identifies the line on this page only. */
  readonly key: number;

  /** The database ID of a lobby message, which a moderator can delete. */
  readonly chatID?: number;

  /** The whole line as HTML, which the client builds from text that the server escaped. */
  readonly html: string;

  /** Whether the line arrived live, so it fades in. Lines from the history do not. */
  readonly fadeIn: boolean;
}

interface LobbyChatState {
  readonly lines: readonly LobbyChatLine[];
}

const initialState: LobbyChatState = {
  lines: [],
};

const lobbyChatSlice = createSlice({
  name: "lobbyChat",
  initialState,
  reducers: {
    lobbyChatLineAdded(state, action: PayloadAction<LobbyChatLine>) {
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
