// The table that we are at before its game starts: its players and options, its chat, and who is
// typing there.

import type { ServerCommandData } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";
import type { ChatLine } from "../chat/ChatBox";

interface PregameChatLine extends ChatLine {
  /** What the line's button applies to the table, in a suggestion to its owner. */
  readonly suggestion?: NonNullable<ServerCommandData["chat"]["suggestion"]>;
}

export type Game = ServerCommandData["pregame"];

interface PregameState {
  /** From the "pregame" message. */
  readonly game: Game | undefined;

  readonly chatLines: readonly PregameChatLine[];

  /** The people at our table who are typing. The game chat shows them too. */
  readonly typing: readonly string[];
}

const initialState: PregameState = {
  game: undefined,
  chatLines: [],
  typing: [],
};

const pregameSlice = createSlice({
  name: "pregame",
  initialState,
  reducers: {
    gameChanged: (state, action: PayloadAction<Game | undefined>) => ({
      ...state,
      game: action.payload,
    }),
    pregameChatLineAdded(state, action: PayloadAction<PregameChatLine>) {
      state.chatLines.push(action.payload);
    },
    pregameChatCleared(state) {
      state.chatLines = [];
    },
    typingStarted(state, action: PayloadAction<string>) {
      if (!state.typing.includes(action.payload)) {
        state.typing.push(action.payload);
      }
    },
    typingStopped(state, action: PayloadAction<string>) {
      state.typing = state.typing.filter((name) => name !== action.payload);
    },
    typingCleared(state) {
      state.typing = [];
    },
  },
});

export const {
  gameChanged,
  pregameChatLineAdded,
  pregameChatCleared,
  typingStarted,
  typingStopped,
  typingCleared,
} = pregameSlice.actions;
export const pregameReducer = pregameSlice.reducer;
