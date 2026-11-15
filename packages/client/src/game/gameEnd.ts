// How a finished game ended, for the turn on which it ended. The classic screen writes this in its
// action log. The New UI has no action log, so it shows it in other places.

import type {
  EndCondition,
  GameMetadata,
  PlayerIndex,
} from "@hanabi-live/game";
import {
  getGameOverText,
  getPlayerName,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { escapeHtml } from "../utils.ts";
import type { State } from "./types/State.ts";

export interface GameEnd {
  /** A few words about how the game ended, such as "Out of strikes". */
  readonly summary: string;

  /** The sentence that the classic screen's action log writes, such as "Players lose!". */
  readonly description: string;

  /**
   * Each player's clock when the game ended, in seat order: the time left in a timed game, or the
   * time taken in an untimed one. It is `undefined` when the server did not send the times.
   */
  readonly playerTimesMs: readonly number[] | undefined;

  /** How long the game took, if the server sent it. */
  readonly durationMs: number | undefined;
}

/**
 * Returns how the game ended, when the screen shows the turn on which it ended. It is `undefined`
 * on the other turns, in a hypothetical, and in a game that has not ended.
 */
export function getShownGameEnd(state: State): GameEnd | undefined {
  const { visibleState } = state;
  if (
    visibleState === undefined
    || !state.finished
    || state.replay.hypothetical !== undefined
    // The game is over from the turn of the "gameOver" action on (see "turnReducer.ts").
    || visibleState.turn.currentPlayerIndex !== undefined
  ) {
    return undefined;
  }

  let gameOver:
    | Extract<State["replay"]["actions"][number], { type: "gameOver" }>
    | undefined;
  let playerTimes:
    | Extract<State["replay"]["actions"][number], { type: "playerTimes" }>
    | undefined;
  for (const action of state.replay.actions) {
    if (action.type === "gameOver") {
      gameOver = action;
    } else if (action.type === "playerTimes") {
      playerTimes = action;
    }
  }
  if (gameOver === undefined) {
    return undefined;
  }

  return {
    summary: getGameOverSummary(
      gameOver.endCondition,
      gameOver.playerIndex,
      state.metadata,
    ),
    description: getGameOverText(
      gameOver.endCondition,
      gameOver.playerIndex,
      visibleState.score,
      state.metadata,
      gameOver.voters,
    ),
    playerTimesMs: playerTimes?.playerTimesMs,
    durationMs: playerTimes?.durationMs,
  };
}

/** A few words about how a game ended, short enough for the bar under the table. */
function getGameOverSummary(
  endCondition: EndCondition,
  playerIndex: PlayerIndex | undefined,
  metadata: GameMetadata,
): string {
  const playerName = getPlayerName(playerIndex, metadata);

  switch (endCondition) {
    case "normal": {
      return "Finished";
    }

    case "strikeout": {
      return "Out of strikes";
    }

    case "timeout": {
      return `${playerName} ran out of time`;
    }

    case "terminatedByPlayer": {
      return `Ended by ${playerName}`;
    }

    case "terminatedByVote": {
      return "Ended by a vote";
    }

    case "speedrunFail": {
      return "Speedrun failed";
    }

    case "idleTimeout": {
      return "Idle for too long";
    }

    case "characterSoftlock": {
      return `${playerName} had no clues`;
    }

    case "allOrNothingFail": {
      return "All or Nothing failed";
    }

    case "allOrNothingSoftlock": {
      return `${playerName} could not move`;
    }
  }
}

/** The tooltip of the game's result, as HTML: what happened, and how long the game took. */
export function getGameEndTooltipHtml(gameEnd: GameEnd): string {
  const description = escapeHtml(gameEnd.description);
  return gameEnd.durationMs === undefined
    ? description
    : `${description}<br />The game took ${millisecondsToClockString(gameEnd.durationMs)}.`;
}
