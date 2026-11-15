import type { GameAction, PlayerIndex } from "@hanabi-live/game";
import { getDefaultMetadata } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import {
  getGameEnd,
  getGameEndTooltipHtml,
  getShownGameEnd,
} from "./gameEnd.ts";
import { initialState } from "./reducers/initialStates/initialState.ts";
import type { State } from "./types/State.ts";

const GAME_OVER = {
  type: "gameOver",
  endCondition: "strikeout",
  voters: [],
} as const satisfies GameAction;

const PLAYER_TIMES = {
  type: "playerTimes",
  playerTimesMs: [61_000, 125_000],
  durationMs: 186_000,
} as const satisfies GameAction;

/** A state that shows a turn of a game, which is over when no player has the turn. */
function showing({
  finished = true,
  currentPlayerIndex,
  actions = [GAME_OVER, PLAYER_TIMES],
}: {
  readonly finished?: boolean;
  readonly currentPlayerIndex?: PlayerIndex;
  readonly actions?: readonly GameAction[];
}): State {
  const initial = initialState(getDefaultMetadata(2));
  const visibleState = {
    ...initial.ongoingGame,
    turn: {
      ...initial.ongoingGame.turn,
      currentPlayerIndex,
    },
  };
  return {
    ...initial,
    finished,
    visibleState,
    replay: {
      ...initial.replay,
      actions,
    },
  };
}

describe("how the game ended", () => {
  test("shows on the turn on which the game ended", () => {
    const gameEnd = getShownGameEnd(showing({}));
    expect(gameEnd?.summary).toBe("Strikeout");
    expect(gameEnd?.description).toBe("Players had three misplayed cards.");
    expect(gameEnd?.playerTimesMs).toStrictEqual([61_000, 125_000]);
    expect(getGameEndTooltipHtml(gameEnd!)).toBe(
      "<strong>Strikeout</strong><br />Players had three misplayed cards.<br />The game took: 3:06",
    );
  });

  test("does not show on an earlier turn", () => {
    expect(getShownGameEnd(showing({ currentPlayerIndex: 0 }))).toBeUndefined();
  });

  test("does not show in a game that has not ended", () => {
    expect(getShownGameEnd(showing({ finished: false }))).toBeUndefined();
    expect(getGameEnd(showing({ finished: false }))).toBeUndefined();
  });

  test("is known on every turn of a finished game", () => {
    const gameEnd = getGameEnd(showing({ currentPlayerIndex: 0 }));
    expect(gameEnd?.summary).toBe("Strikeout");
  });

  test("shows without times when the server did not send them", () => {
    const gameEnd = getShownGameEnd(showing({ actions: [GAME_OVER] }));
    expect(gameEnd?.playerTimesMs).toBeUndefined();
    expect(getGameEndTooltipHtml(gameEnd!)).toBe(
      "<strong>Strikeout</strong><br />Players had three misplayed cards.",
    );
  });

  test("has no sentence when the summary says it all", () => {
    const gameEnd = getShownGameEnd(
      showing({
        actions: [
          {
            type: "gameOver",
            endCondition: "timeout",
            playerIndex: 0,
            voters: [],
          },
          PLAYER_TIMES,
        ],
      }),
    );
    expect(gameEnd?.summary).toBe("Alice ran out of time");
    expect(getGameEndTooltipHtml(gameEnd!)).toBe(
      "<strong>Alice ran out of time</strong><br />The game took: 3:06",
    );
  });
});
