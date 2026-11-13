// The state of the redesigned game screen (the "New UI" setting) that is not part of the game.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface NewUiState {
  /** Whether the redesigned game screen is showing the current game. */
  readonly shown: boolean;
  /** Whether the chat panel is open, as opposed to collapsed into a thin rail. */
  readonly chatOpen: boolean;
}

const initialState: NewUiState = {
  shown: false,
  chatOpen: true,
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
  },
});

export const { newUiShownChanged, newUiChatOpenChanged } = newUiSlice.actions;
export const newUiReducer = newUiSlice.reducer;
