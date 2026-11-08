// Converts server payloads, which the connection has already validated against their generated
// schemas, where the client represents a value differently from the server. The remaining checks
// cover what the schemas cannot express: seat-indexed tuples and values only the client names.

import type { ServerCommandData } from "@hanabi-live/data";
import type {
  CardIdentity,
  CardOrder,
  GameAction,
  NumPlayers,
} from "@hanabi-live/game";
import { cardOrder, isValidNumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { isEnumValue } from "complete-common";
import { ReplayArrowOrder } from "./game/types/ReplayArrowOrder";
import { SoundType } from "./game/types/SoundType";

type WireEvent = ServerCommandData["gameAction"]["action"];
type WireCardIdentity =
  ServerCommandData["cardIdentities"]["cardIdentities"][number];

/** The game state indexes some lists by seat, so each needs one entry per player. */
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

/** The server marks an unknown suit or rank with -1; the game state uses null. */
export function toCardIdentity(identity: WireCardIdentity): CardIdentity {
  return {
    suitIndex: identity.suitIndex === -1 ? null : identity.suitIndex,
    rank: identity.rank === -1 ? null : identity.rank,
  };
}

/**
 * A replay arrow points at a card, or at a part of the board that negative values name. Only the
 * client knows those parts, so the server relays the value as an integer.
 */
export function toReplayArrowOrder(
  value: number,
): CardOrder | ReplayArrowOrder {
  if (value >= 0) {
    return cardOrder.parse(value);
  }
  if (!isEnumValue(value, ReplayArrowOrder)) {
    throw new TypeError(`The server sent an unknown replay arrow: ${value}`);
  }
  return value;
}

/**
 * Converts a game event from the server into the action the game state applies. The game library
 * derives its event types from the same wire contracts. Status events return undefined: the client
 * computes clue counts and scores itself. The game state does not use a clue's turn, and every
 * received clue applies its negative information.
 */
export function toGameAction(event: WireEvent): GameAction | undefined {
  switch (event.type) {
    case "clue": {
      const { turn: _turn, ...clue } = event;
      return { ...clue, ignoreNegative: false };
    }

    case "status": {
      return undefined;
    }

    default: {
      return event;
    }
  }
}

/** Sounds the server names that the client does not have are not played. */
export function toSoundType(value: string): SoundType | undefined {
  return isEnumValue(value, SoundType) ? value : undefined;
}
