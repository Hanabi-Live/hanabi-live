// Converts server payloads, which the connection has already validated against their generated
// schemas, where the client represents a value differently from the server. The remaining checks
// cover what the schemas cannot express: seat-indexed tuples.

import type { ServerCommandData } from "@hanabi-live/data";
import type { CardIdentity, GameAction, NumPlayers } from "@hanabi-live/game";
import { isValidNumPlayers, NO_VALUE } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import { SoundType } from "./game/types/SoundType";

type WireEvent = ServerCommandData["gameAction"]["action"];
type WireCardIdentity =
  ServerCommandData["cardIdentities"]["identities"][number];

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

/** The server marks an unknown suit or rank with `NO_VALUE`; the game state uses null. */
export function toCardIdentity(identity: WireCardIdentity): CardIdentity {
  return {
    suitIndex: identity.suitIndex === NO_VALUE ? null : identity.suitIndex,
    rank: identity.rank === NO_VALUE ? null : identity.rank,
  };
}

/**
 * Converts a game event from the server into the action the game state applies. The game library
 * derives its event types from the same wire contracts. The game state does not use a clue's turn,
 * and every received clue applies its negative information.
 */
export function toGameAction(event: WireEvent): GameAction {
  if (event.type !== "clue") {
    return event;
  }
  const { turn: _turn, ...clue } = event;
  return { ...clue, ignoreNegative: false };
}

type WireSound =
  | ServerCommandData["replaySound"]["sound"]
  | ServerCommandData["soundLobby"]["file"];

/** The sound file for each sound the server names. Type checking requires one for every name. */
const WIRE_SOUNDS = {
  buzz: SoundType.Buzz,
  clap: SoundType.Clap,
  holy: SoundType.Holy,
  nooo: SoundType.Nooo,
  shutdown: SoundType.Shutdown,
  "someone-joined": SoundType.SomeoneJoined,
} as const satisfies Record<WireSound, SoundType>;

export function toSoundType(value: WireSound): SoundType {
  return WIRE_SOUNDS[value];
}
