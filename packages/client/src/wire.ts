// Converts server payloads, which the connection has already validated against their generated
// schemas, into the game library's narrower types. Each conversion checks the narrowing, so a value
// outside it fails here instead of corrupting the game state.

import type { ServerCommandData } from "@hanabi-live/data";
import type {
  ActionIncludingHypothetical,
  CardIdentity,
  CardOrder,
  GameAction,
  HiddenClue,
  MsgClue,
  NumPlayers,
  PlayerIndex,
} from "@hanabi-live/game";
import {
  cardOrder,
  ClueType,
  colorIndex,
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
type WireHypotheticalAction = ServerCommandData["hypoAction"];

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
 * Converts a game event from the server into the action the game state applies. The game library
 * derives its event types from the same wire contracts. Status events return undefined: the client
 * computes clue counts and scores itself.
 */
export function toGameAction(event: WireEvent): GameAction | undefined {
  switch (event.type) {
    case "clue": {
      return {
        type: "clue",
        clue: toClue(event.clue),
        giver: event.giver,
        target: event.target,
        list: event.list,
        ignoreNegative: false,
      };
    }

    case "status": {
      return undefined;
    }

    default: {
      return event;
    }
  }
}

/** Converts a relayed hypothetical action into the action the game state applies. */
export function toHypotheticalAction(
  action: WireHypotheticalAction,
): ActionIncludingHypothetical {
  return action.type === "clue"
    ? { ...action, clue: toClue(action.clue) }
    : action;
}

/** Sounds the server names that the client does not have are not played. */
export function toSoundType(value: string): SoundType | undefined {
  return isEnumValue(value, SoundType) ? value : undefined;
}
