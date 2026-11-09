// Our past games, from the "gameHistory" server message, and the other games on a seed, from the
// "gameHistoryOtherScores" server message.

import type { GameHistory, ServerCommandData } from "@hanabi-live/data";
import { compareGameHistory } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store";

type OtherScores = ServerCommandData["gameHistoryOtherScores"];

const gamesAdapter = createEntityAdapter({
  selectId: (game: GameHistory): number => game.id,
});

interface HistoryState {
  readonly games: ReturnType<typeof gamesAdapter.getInitialState>;

  /** The number of games that we have played, or null until the server counts them. */
  readonly totalGames: number | null;

  /** Whether we are waiting for a page of our history. */
  readonly loading: boolean;

  /** The seed whose other scores we show, and its games once the server sends them. */
  readonly otherScores: {
    readonly seed: string;
    readonly result: OtherScores | null;
  } | null;
}

const initialState: HistoryState = {
  games: gamesAdapter.getInitialState(),
  totalGames: null,
  loading: false,
  otherScores: null,
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    historyRequested(state) {
      state.loading = true;
    },
    historyReceived(state, action: PayloadAction<readonly GameHistory[]>) {
      gamesAdapter.setMany(state.games, action.payload);
      state.loading = false;
    },
    totalGamesChanged(state, action: PayloadAction<number | null>) {
      state.totalGames = action.payload;
    },
    otherScoresRequested(state, action: PayloadAction<string>) {
      state.otherScores = { seed: action.payload, result: null };
    },
    otherScoresReceived(state, action: PayloadAction<OtherScores>) {
      const { seed } = action.payload;
      // Ignore a late reply for a seed that we no longer show.
      return state.otherScores?.seed === seed
        ? { ...state, otherScores: { seed, result: action.payload } }
        : state;
    },
  },
});

export const {
  historyRequested,
  historyReceived,
  totalGamesChanged,
  otherScoresRequested,
  otherScoresReceived,
} = historySlice.actions;
export const historyReducer = historySlice.reducer;

const gamesSelectors = gamesAdapter.getSelectors(
  (state: RootState) => state.history.games,
);

export const selectShownGameCount = gamesSelectors.selectTotal;

/** The newest games come first. */
export const selectHistoryGames = createSelector(
  [gamesSelectors.selectAll],
  (games: readonly GameHistory[]): readonly GameHistory[] =>
    games.toSorted(compareGameHistory),
);
