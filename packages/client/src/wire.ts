// Converts server payloads, which the connection has already validated against their generated
// schemas, into the game library's narrower types. Each conversion checks the narrowing, so a value
// outside it fails here instead of corrupting the game state.

import type { ServerCommandData } from "@hanabi-live/data";
import type {
  CardIdentity,
  CardOrder,
  GameAction,
  HiddenClue,
  MsgClue,
  NumPlayers,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi-live/game";
import {
  cardOrder,
  ClueType,
  colorIndex,
  EndCondition,
  isValidNumPlayers,
  playerIndex,
  rank,
  rankClueNumber,
  suitIndex,
} from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { isEnumValue } from "complete-common";
import { ReplayArrowOrder } from "./game/types/ReplayArrowOrder";
import { SoundType } from "./game/types/SoundType";

type WireEvent = ServerCommandData["gameAction"]["action"];

export function toPlayerIndex(value: number): PlayerIndex {
  return playerIndex.parse(value);
}

/** Server seats use -1 for "no player". */
export function toOptionalPlayerIndex(value: number): PlayerIndex | -1 {
  return value === -1 ? -1 : toPlayerIndex(value);
}

export function toCardOrder(value: number): CardOrder {
  return cardOrder.parse(value);
}

/** Server card identities use -1 for an unknown suit or rank. */
function toSuitIndex(value: number): SuitIndex | -1 {
  return value === -1 ? -1 : suitIndex.parse(value);
}

function toRank(value: number): Rank | -1 {
  return value === -1 ? -1 : rank.parse(value);
}

/** Checks that a list has one entry per player. */
export function toPlayerTuple<T>(
  values: readonly T[],
  description: string,
): Tuple<T, NumPlayers> {
  if (!isValidNumPlayers(values.length)) {
    throw new TypeError(
      `The server sent ${values.length} ${description}, which is not a valid number of players.`,
    );
  }
  return [...values] as unknown as Tuple<T, NumPlayers>;
}

export function toCardIdentity(identity: {
  readonly suitIndex: number;
  readonly rank: number;
}): CardIdentity {
  return {
    suitIndex:
      identity.suitIndex === -1 ? null : suitIndex.parse(identity.suitIndex),
    rank: identity.rank === -1 ? null : rank.parse(identity.rank),
  };
}

function toClue(clue: {
  readonly type: number;
  readonly value: number;
}): MsgClue | HiddenClue {
  if (!isEnumValue(clue.type, ClueType)) {
    return { type: -1, value: -1 };
  }
  return clue.type === ClueType.Color
    ? { type: ClueType.Color, value: colorIndex.parse(clue.value) }
    : { type: ClueType.Rank, value: rankClueNumber.parse(clue.value) };
}

function toEndCondition(value: number): EndCondition {
  if (!isEnumValue(value, EndCondition)) {
    throw new TypeError(`The server sent an unknown end condition: ${value}`);
  }
  return value;
}

function toStrikeNumber(value: number): 1 | 2 | 3 {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new TypeError(`The server sent an invalid strike number: ${value}`);
  }
  return value;
}

/** A replay arrow points at a card, or at a part of the board that negative values name. */
export function toReplayArrowOrder(
  value: number,
): CardOrder | ReplayArrowOrder {
  if (value >= 0) {
    return toCardOrder(value);
  }
  if (!isEnumValue(value, ReplayArrowOrder)) {
    throw new TypeError(`The server sent an unknown replay arrow: ${value}`);
  }
  return value;
}

/**
 * Converts a game event from the server into the action the game state applies. Status events
 * return undefined: the client computes clue counts and scores itself.
 */
export function toGameAction(event: WireEvent): GameAction | undefined {
  switch (event.type) {
    case "draw":
    case "play":
    case "cardIdentity": {
      return {
        type: event.type,
        playerIndex: toPlayerIndex(event.playerIndex),
        order: toCardOrder(event.order),
        suitIndex: toSuitIndex(event.suitIndex),
        rank: toRank(event.rank),
      };
    }

    case "discard": {
      return {
        type: "discard",
        playerIndex: toPlayerIndex(event.playerIndex),
        order: toCardOrder(event.order),
        suitIndex: toSuitIndex(event.suitIndex),
        rank: toRank(event.rank),
        failed: event.failed,
      };
    }

    case "clue": {
      return {
        type: "clue",
        clue: toClue(event.clue),
        giver: toPlayerIndex(event.giver),
        target: toPlayerIndex(event.target),
        list: event.list.map(toCardOrder),
        ignoreNegative: false,
      };
    }

    case "strike": {
      return {
        type: "strike",
        num: toStrikeNumber(event.num),
        order: toCardOrder(event.order),
        turn: event.turn,
      };
    }

    case "status": {
      return undefined;
    }

    case "turn": {
      return {
        type: "turn",
        num: event.num,
        currentPlayerIndex: toOptionalPlayerIndex(event.currentPlayerIndex),
      };
    }

    case "gameOver": {
      return {
        type: "gameOver",
        endCondition: toEndCondition(event.endCondition),
        playerIndex: toOptionalPlayerIndex(event.playerIndex),
        votes: event.votes === null ? null : event.votes.map(toPlayerIndex),
      };
    }

    case "playerTimes": {
      return {
        type: "playerTimes",
        playerTimes: toPlayerTuple(event.playerTimes, "player times"),
        duration: event.duration,
      };
    }
  }
}

/** Sounds the server names that the client does not have are not played. */
export function toSoundType(value: string): SoundType | undefined {
  return isEnumValue(value, SoundType) ? value : undefined;
}
