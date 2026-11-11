// Our past games, from the "gameHistory" server message, and the other games on a seed, from the
// "gameHistoryOtherScores" server message.

import type { GameHistoryEntry, ServerCommandData } from "@hanabi-live/data";
import { compareGameHistory } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store.ts";

type OtherScores = ServerCommandData["gameHistoryOtherScores"];
type LobbyStatus = ServerCommandData["lobbyStatus"];

const gamesAdapter = createEntityAdapter({
  selectId: (game: GameHistoryEntry): number => game.gameId,
});

interface HistoryState {
  readonly games: ReturnType<typeof gamesAdapter.getInitialState>;

  /** The number of games that we have played, or undefined until the server counts them. */
  readonly totalGames: number | undefined;

  /** Whether the server failed to count our games. */
  readonly totalGamesFailed: boolean;

  /** Whether we are waiting for a page of our history. */
  readonly loading: boolean;

  /** The seed whose other scores we show, and the pages of its games that the server sent. */
  readonly otherScores:
    | {
        readonly seed: string;
        readonly games: readonly GameHistoryEntry[];

        /** The seed's variant, or undefined until the server sends a game. */
        readonly variantName: string | undefined;

        /** The number of games on the seed, or undefined until the server counts them. */
        readonly total: number | undefined;

        /** Whether we are waiting for a page of the seed's games. */
        readonly loading: boolean;
      }
    | undefined;
}

const initialState: HistoryState = {
  games: gamesAdapter.getInitialState(),
  totalGames: undefined,
  totalGamesFailed: false,
  loading: false,
  otherScores: undefined,
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    historyRequested(state) {
      state.loading = true;
    },
    historyReceived(state, action: PayloadAction<readonly GameHistoryEntry[]>) {
      gamesAdapter.setMany(state.games, action.payload);
      state.loading = false;
    },
    totalGamesChanged(state, action: PayloadAction<number | undefined>) {
      state.totalGames = action.payload;
      state.totalGamesFailed = false;
    },
    lobbyStatusReceived(state, action: PayloadAction<LobbyStatus>) {
      const status = action.payload;
      state.totalGames =
        status.type === "ready" ? status.totalGames : undefined;
      state.totalGamesFailed = status.type === "error";
    },
    otherScoresRequested(state, action: PayloadAction<string>) {
      state.otherScores = {
        seed: action.payload,
        games: [],
        variantName: undefined,
        total: undefined,
        loading: true,
      };
    },
    moreOtherScoresRequested(state) {
      if (state.otherScores !== undefined) {
        state.otherScores.loading = true;
      }
    },
    otherScoresReceived(state, action: PayloadAction<OtherScores>) {
      const { games, offset, seed, total } = action.payload;
      const shown = state.otherScores;
      // Ignore a late reply for a seed that we no longer show.
      if (shown?.seed !== seed) {
        return state;
      }
      return {
        ...state,
        otherScores: {
          seed,
          // A page replaces the games from its offset on, so a repeated reply does not add them
          // twice.
          games: [...shown.games.slice(0, offset), ...games],
          variantName: games[0]?.options.variantName ?? shown.variantName,
          total,
          loading: false,
        },
      };
    },
  },
});

export const {
  historyRequested,
  historyReceived,
  totalGamesChanged,
  lobbyStatusReceived,
  otherScoresRequested,
  moreOtherScoresRequested,
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
  (games: readonly GameHistoryEntry[]): readonly GameHistoryEntry[] =>
    games.toSorted(compareGameHistory),
);
