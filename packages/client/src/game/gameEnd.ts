// How a finished game ended, for the turn on which it ended. The classic screen writes this in its
// action log. The New UI has no action log, so it shows it in other places.

import type {
  EndCondition,
  GameMetadata,
  PlayerIndex,
} from "@hanabi-live/game";
import {
  getNumberWord,
  getPlayerName,
  getPlayerNames,
  MAX_STRIKES,
  millisecondsToClockString,
} from "@hanabi-live/game";
import { escapeHtml } from "../utils.ts";
import type { State } from "./types/State.ts";

export interface GameEnd {
  /** A few words about how the game ended, such as "Strikeout". */
  readonly summary: string;
  readonly endCondition: EndCondition;

  /**
   * A sentence that explains the summary, such as "Players had three misplayed cards.". It is
   * `undefined` when the summary already says it all.
   */
  readonly description: string | undefined;

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
  const onLastTurn =
    state.visibleState !== undefined
    && state.replay.hypothetical === undefined
    // The game is over from the turn of the "gameOver" action on (see "turnReducer.ts").
    && state.visibleState.turn.currentPlayerIndex === undefined;
  return onLastTurn ? getGameEnd(state) : undefined;
}

/**
 * Returns how a finished game ended, on any turn of its replay. It is `undefined` in a game that
 * has not ended.
 */
export function getGameEnd(state: State): GameEnd | undefined {
  if (!state.finished) {
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
    endCondition: gameOver.endCondition,
    summary: getGameOverSummary(
      gameOver.endCondition,
      gameOver.playerIndex,
      state.metadata,
    ),
    description: getGameOverDescription(
      gameOver.endCondition,
      gameOver.playerIndex,
      state.metadata,
      gameOver.voters,
    ),
    playerTimesMs: playerTimes?.playerTimesMs,
    durationMs: playerTimes?.durationMs,
  };
}

/** A few words about how a game ended, for the heading of its tooltip. */
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
      return "Strikeout";
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

    case "allOrNothingFail": {
      return "All or Nothing failed";
    }

    case "allOrNothingSoftlock": {
      return `${playerName} could not move`;
    }
  }
}

/**
 * A sentence that explains how a game ended, for the tooltip of its summary. The classic screen's
 * action log has its own sentences (see `getGameOverText`).
 */
function getGameOverDescription(
  endCondition: EndCondition,
  playerIndex: PlayerIndex | undefined,
  metadata: GameMetadata,
  voters: readonly PlayerIndex[],
): string | undefined {
  const playerName = getPlayerName(playerIndex, metadata);

  switch (endCondition) {
    case "normal": {
      return "Players finished the game normally.";
    }

    case "strikeout": {
      return `Players had ${getNumberWord(MAX_STRIKES)} misplayed cards.`;
    }

    // The summary already says who ran out of time.
    case "timeout": {
      return undefined;
    }

    case "terminatedByPlayer": {
      return `${playerName} terminated the game.`;
    }

    case "terminatedByVote": {
      return `${getPlayerNames(voters, metadata)} voted to terminate the game.`;
    }

    case "speedrunFail": {
      return "A perfect score was not attained.";
    }

    case "idleTimeout": {
      return "Players were idle for too long.";
    }

    // The game ends as soon as the maximum score drops below a perfect score.
    case "allOrNothingFail": {
      return "A perfect score was no longer possible.";
    }

    case "allOrNothingSoftlock": {
      return `${playerName} was left with 0 clues and 0 cards.`;
    }
  }
}

/**
 * The tooltip of the game's result, as HTML: how the game ended, what happened, and how long the
 * game took.
 */
export function getGameEndTooltipHtml(gameEnd: GameEnd): string {
  const lines = [`<strong>${escapeHtml(gameEnd.summary)}</strong>`];
  if (gameEnd.description !== undefined) {
    lines.push(escapeHtml(gameEnd.description));
  }
  if (gameEnd.durationMs !== undefined) {
    lines.push(
      `The game took: ${millisecondsToClockString(gameEnd.durationMs)}`,
    );
  }
  return lines.join("<br />");
}
