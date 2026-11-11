// State about our own session that React components read. The jQuery code reads and writes it
// through the accessors on `globals`.

import type { Settings, UserId } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import { Screen } from "./lobby/types/Screen.ts";

interface SessionState {
  /** `undefined` until the server's "welcome" message arrives. */
  readonly userId: UserId | undefined;
  readonly username: string;
  readonly friends: readonly string[];
  /** The users whom we have blocked. */
  readonly blocked: readonly string[];
  readonly settings: Settings;
  readonly screen: Screen;
  /**
   * The section of the lobby page, such as "Create Game" or "Settings", that replaces the lobby.
   */
  readonly lobbyPage: string | undefined;
  /** Whether we asked the server to create a table and it has not answered yet. */
  readonly creatingTable: boolean;
  /** Whether the error modal is showing, which the page cannot recover from. */
  readonly errorOccurred: boolean;
}

const initialState: SessionState = {
  userId: undefined,
  username: "",
  friends: [],
  blocked: [],
  settings: defaultSettings,
  screen: Screen.Login,
  lobbyPage: undefined,
  creatingTable: false,
  errorOccurred: false,
};

const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    userIdChanged(state, action: PayloadAction<UserId | undefined>) {
      state.userId = action.payload;
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
    lobbyPageChanged(state, action: PayloadAction<string | undefined>) {
      state.lobbyPage = action.payload;
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
  userIdChanged,
  usernameChanged,
  friendsChanged,
  blockedChanged,
  settingsChanged,
  screenChanged,
  lobbyPageChanged,
  creatingTableChanged,
  errorOccurredChanged,
} = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
