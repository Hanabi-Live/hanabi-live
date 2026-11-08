// State about our own session that React components read. The jQuery code reads and writes it
// through the accessors on `globals`.

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { Screen } from "./lobby/types/Screen";

interface SessionState {
  readonly username: string;
  readonly friends: readonly string[];
  readonly screen: Screen;
}

const initialState: SessionState = {
  username: "",
  friends: [],
  screen: Screen.Login,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    usernameChanged(state, action: PayloadAction<string>) {
      state.username = action.payload;
    },
    friendsChanged(state, action: PayloadAction<readonly string[]>) {
      state.friends = [...action.payload];
    },
    screenChanged(state, action: PayloadAction<Screen>) {
      state.screen = action.payload;
    },
  },
});

export const { usernameChanged, friendsChanged, screenChanged } =
  sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
