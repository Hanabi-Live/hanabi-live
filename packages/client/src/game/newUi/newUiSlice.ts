// The state of the redesigned game screen (the "New UI" setting) that is not part of the game.

import type { CardOrder } from "@hanabi-live/game";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { gameCleared, gameStarted } from "../gameSlice.ts";
import type { ArrowTarget } from "../highlightArrow.ts";

/** The highlight arrow, and the view of the game that it was drawn on (see "arrow.ts"). */
export interface ShownArrow {
  readonly target: ArrowTarget;
  readonly view: string;
}

interface NewUiState {
  /** Whether the redesigned game screen is showing the current game. */
  readonly shown: boolean;
  /** Whether the chat panel is open, as opposed to collapsed into a thin rail. */
  readonly chatOpen: boolean;
  /** Whether the chat is in its own browser window, which the player can move to another screen. */
  readonly chatPoppedOut: boolean;
  /**
   * The cards whose notes someone else changed while we spectate, and that we have not looked at
   * since.
   */
  readonly unreadNotes: readonly CardOrder[];
  /** The highlight arrow, if one is drawn. */
  readonly arrow: ShownArrow | undefined;
}

const initialState: NewUiState = {
  shown: false,
  chatOpen: true,
  chatPoppedOut: false,
  unreadNotes: [],
  arrow: undefined,
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
    newUiChatPoppedOutChanged(state, action: PayloadAction<boolean>) {
      state.chatPoppedOut = action.payload;
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
    newUiArrowChanged(state, action: PayloadAction<ShownArrow | undefined>) {
      state.arrow = action.payload;
    },
  },
  extraReducers: (builder) => {
    // The notes and the arrow of another game do not belong in this one.
    builder
      .addCase(gameStarted, (state) => {
        state.unreadNotes = [];
        state.arrow = undefined;
      })
      .addCase(gameCleared, (state) => {
        state.unreadNotes = [];
        state.arrow = undefined;
      });
  },
});

export const {
  newUiShownChanged,
  newUiChatOpenChanged,
  newUiChatPoppedOutChanged,
  newUiNoteUnread,
  newUiNoteRead,
  newUiArrowChanged,
} = newUiSlice.actions;
export const newUiReducer = newUiSlice.reducer;
