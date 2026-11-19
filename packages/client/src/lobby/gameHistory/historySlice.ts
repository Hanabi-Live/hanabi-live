// Our past games, from the replies to "gameHistory", and the other games on a seed, from the
// replies to "seedGames".

import type {
  GameSummary,
  ReplyData,
  ServerEventData,
} from "@hanabi-live/data";
import { compareGameHistory } from "@hanabi-live/data";
import type { PayloadAction } from "@reduxjs/toolkit";
import {
  createEntityAdapter,
  createSelector,
  createSlice,
} from "@reduxjs/toolkit";
import type { RootState } from "../../store.ts";

/** A page of the games on a seed, with the seed and the position that the request named. */
interface OtherScores {
  readonly seed: string;
  readonly offset: number;
  readonly page: ReplyData["seedGames"];
}
type LobbyStatus = ServerEventData["lobbyStatus"];

/** A page of our history, with the filter that the request named. */
interface HistoryPage {
  readonly filter: string;
  readonly page: ReplyData["gameHistory"];
}

const gamesAdapter = createEntityAdapter({
  selectId: (game: GameSummary): number => game.gameId,
});

interface HistoryState {
  readonly games: ReturnType<typeof gamesAdapter.getInitialState>;

  /** The number of games that we have played, or undefined until the server counts them. */
  readonly totalGames: number | undefined;

  /** Whether the server failed to count our games. */
  readonly totalGamesFailed: boolean;

  /** Whether we are waiting for a page of our history. */
  readonly loading: boolean;

  /**
   * The text that finds the games to show, which the server matches against variants and the other
   * players. It is empty to show every game.
   */
  readonly filter: string;

  /** The number of games that the filter finds, or undefined until the server counts them. */
  readonly matchingTotal: number | undefined;

  /** The seed whose other scores we show, and the pages of its games that the server sent. */
  readonly otherScores:
    | {
        readonly seed: string;
        readonly games: readonly GameSummary[];

        /** The seed's variant, or undefined until the server sends a game. */
        readonly variantId: number | undefined;

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
  filter: "",
  matchingTotal: undefined,
  otherScores: undefined,
};

const historySlice = createSlice({
  name: "history",
  initialState,
  reducers: {
    historyRequested(state) {
      state.loading = true;
    },
    historyReceived(state, action: PayloadAction<HistoryPage>) {
      const { filter, page } = action.payload;
      // Ignore a late reply for a filter that we no longer show.
      if (filter !== state.filter) {
        return;
      }
      gamesAdapter.setMany(state.games, page.games);
      state.matchingTotal = page.total;
      state.loading = false;
    },
    /** A failed request for a page of our history adds no games. */
    historyFailed(state, action: PayloadAction<string>) {
      if (action.payload === state.filter) {
        state.loading = false;
      }
    },
    /** We just finished a game. It is undefined when the filter does not find it. */
    historyGameAdded(state, action: PayloadAction<GameSummary | undefined>) {
      if (action.payload === undefined) {
        return;
      }
      gamesAdapter.setOne(state.games, action.payload);
      if (state.matchingTotal !== undefined) {
        state.matchingTotal++;
      }
    },
    historyFilterChanged(state, action: PayloadAction<string>) {
      state.filter = action.payload;
      state.matchingTotal = undefined;
      gamesAdapter.removeAll(state.games);
    },
    totalGamesChanged(state, action: PayloadAction<number | undefined>) {
      state.totalGames = action.payload;
      state.totalGamesFailed = false;
    },
    lobbyStatusReceived(state, action: PayloadAction<LobbyStatus>) {
      const status = action.payload;
      state.totalGames = status.type === "ready" ? status.numGames : undefined;
      state.totalGamesFailed = status.type === "error";
    },
    otherScoresRequested(state, action: PayloadAction<string>) {
      state.otherScores = {
        seed: action.payload,
        games: [],
        variantId: undefined,
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
      const {
        seed,
        offset,
        page: { games, total },
      } = action.payload;
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
          variantId: games[0]?.options.variantId ?? shown.variantId,
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
  historyFailed,
  historyGameAdded,
  historyFilterChanged,
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
  (games: readonly GameSummary[]): readonly GameSummary[] =>
    games.toSorted(compareGameHistory),
);

/**
 * The number of games in our history, or the number that the filter finds. It is undefined until
 * the server counts them.
 */
export function selectHistoryTotal(state: RootState): number | undefined {
  const { totalGames, filter, matchingTotal } = state.history;
  return filter === "" ? (totalGames ?? matchingTotal) : matchingTotal;
}
