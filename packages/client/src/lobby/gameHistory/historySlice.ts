// The seed whose other games the lobby shows. The lists themselves load from the HTTP API each time
// a screen opens (see "HistoryLists.tsx").

import type { PayloadAction } from "@reduxjs/toolkit";
import { createSlice } from "@reduxjs/toolkit";

interface HistoryState {
  readonly otherScoresSeed: string | undefined;
}

const initialState: HistoryState = {
  otherScoresSeed: undefined,
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    otherScoresShown(state, action: PayloadAction<string>) {
      state.otherScoresSeed = action.payload;
    },
  },
});

export const { otherScoresShown } = historySlice.actions;
export const historyReducer = historySlice.reducer;
