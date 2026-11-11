// State about our own session that React components read. The jQuery code reads and writes it
// through the accessors on `globals`.

import type { Settings } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { NO_USER_ID } from "./constants";
import { Screen } from "./lobby/types/Screen";

interface SessionState {
  /** `NO_USER_ID` until the server's "welcome" message arrives. */
  readonly userID: number;
  readonly username: string;
  readonly friends: readonly string[];
  /** The users whom we have blocked. */
  readonly blocked: readonly string[];
  readonly settings: Settings;
  readonly screen: Screen;
  /** Whether a lobby page, such as "Create Game" or "Settings", replaces the lobby. */
  readonly lobbyPageShown: boolean;
  /** Whether we asked the server to create a table and it has not answered yet. */
  readonly creatingTable: boolean;
  /** Whether the error modal is showing, which the page cannot recover from. */
  readonly errorOccurred: boolean;
}

const initialState: SessionState = {
  userID: NO_USER_ID,
  username: "",
  friends: [],
  blocked: [],
  settings: defaultSettings,
  screen: Screen.Login,
  lobbyPageShown: false,
  creatingTable: false,
  errorOccurred: false,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    userIDChanged(state, action: PayloadAction<number>) {
      state.userID = action.payload;
    },
    usernameChanged(state, action: PayloadAction<string>) {
      state.username = action.payload;
    },
    friendsChanged(state, action: PayloadAction<readonly string[]>) {
      state.friends = [...action.payload];
    },
    blockedChanged(state, action: PayloadAction<readonly string[]>) {
      state.blocked = [...action.payload];
    },
    settingsChanged(state, action: PayloadAction<Settings>) {
      state.settings = action.payload;
    },
    screenChanged(state, action: PayloadAction<Screen>) {
      state.screen = action.payload;
    },
    lobbyPageShownChanged(state, action: PayloadAction<boolean>) {
      state.lobbyPageShown = action.payload;
    },
    creatingTableChanged(state, action: PayloadAction<boolean>) {
      state.creatingTable = action.payload;
    },
    errorOccurredChanged(state, action: PayloadAction<boolean>) {
      state.errorOccurred = action.payload;
    },
  },
});

export const {
  userIDChanged,
  usernameChanged,
  friendsChanged,
  blockedChanged,
  settingsChanged,
  screenChanged,
  lobbyPageShownChanged,
  creatingTableChanged,
  errorOccurredChanged,
} = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
