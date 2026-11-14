// The state of the redesigned game screen (the "New UI" setting) that is not part of the game.

import type { CardOrder } from "@hanabi-live/game";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { gameCleared, gameStarted } from "../gameSlice.ts";

interface NewUiState {
  /** Whether the redesigned game screen is showing the current game. */
  readonly shown: boolean;
  /** Whether the chat panel is open, as opposed to collapsed into a thin rail. */
  readonly chatOpen: boolean;
  /**
   * The cards whose notes someone else changed while we spectate, and that we have not looked at
   * since.
   */
  readonly unreadNotes: readonly CardOrder[];
}

const initialState: NewUiState = {
  shown: false,
  chatOpen: true,
  unreadNotes: [],
};

const newUiSlice = createSlice({
  name: "newUi",
  initialState,
  reducers: {
    newUiShownChanged(state, action: PayloadAction<boolean>) {
      state.shown = action.payload;
    },
    newUiChatOpenChanged(state, action: PayloadAction<boolean>) {
      state.chatOpen = action.payload;
    },
    newUiNoteUnread(state, action: PayloadAction<CardOrder>) {
      if (!state.unreadNotes.includes(action.payload)) {
        state.unreadNotes.push(action.payload);
      }
    },
    newUiNoteRead(state, action: PayloadAction<CardOrder>) {
      state.unreadNotes = state.unreadNotes.filter(
        (order) => order !== action.payload,
      );
    },
  },
  extraReducers: (builder) => {
    // The notes of another game are not unread in this one.
    builder
      .addCase(gameStarted, (state) => {
        state.unreadNotes = [];
      })
      .addCase(gameCleared, (state) => {
        state.unreadNotes = [];
      });
  },
});

export const {
  newUiShownChanged,
  newUiChatOpenChanged,
  newUiNoteUnread,
  newUiNoteRead,
} = newUiSlice.actions;
export const newUiReducer = newUiSlice.reducer;
