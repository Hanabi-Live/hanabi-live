// Converts server payloads, which the connection has already validated against their generated
// schemas, where the client represents a value differently from the server. The remaining checks
// cover what the schemas cannot express: seat-indexed tuples.

import type {
  ClientRequestData,
  playerActionRequestSchema,
  ServerEventData,
} from "@hanabi-live/data";
import type {
  ActionIncludingHypothetical,
  CardIdentity,
  NumPlayers,
} from "@hanabi-live/game";
import { isValidNumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import type { z } from "zod";
import type { ClientAction } from "./game/types/ClientAction.ts";
import { SoundType } from "./game/types/SoundType.ts";

type WireCardIdentity = ServerEventData["gameFinished"]["deck"][number];

/** Converts an action that we took into the "playerAction" command's payload. */
export function toWireAction(
  tableId: number,
  action: ClientAction,
): z.input<typeof playerActionRequestSchema> {
  return { tableId, action };
}

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

/** A card's identity, which the server names once the game ends. */
export function toCardIdentity(identity: WireCardIdentity): CardIdentity {
  return { suitIndex: identity.suitIndex, rank: identity.rank };
}

type WireReplayAction = ServerEventData["replayAction"]["action"];
type OutgoingHypotheticalEvent = Extract<
  Extract<
    ClientRequestData["replayAction"]["action"],
    { type: "hypothetical" }
  >["control"],
  { type: "event" }
>["event"];

/** Converts a hypothetical action for the server, which omits a hidden clue. */
export function toWireHypotheticalAction(
  action: ActionIncludingHypothetical,
): OutgoingHypotheticalEvent {
  if (action.type !== "clue") {
    return action;
  }
  const { clue, ...rest } = action;
  if (clue.type !== undefined) {
    return { ...rest, clue };
  }
  return clue.visibleType === undefined
    ? rest
    : { ...rest, clue: { type: clue.visibleType } };
}

type WireSound = Extract<WireReplayAction, { type: "sound" }>["sound"];

/** The sound file for each sound the server names. Type checking requires one for every name. */
const WIRE_SOUNDS = {
  buzz: SoundType.Buzz,
  clap: SoundType.Clap,
  holy: SoundType.Holy,
  nooo: SoundType.Nooo,
} as const satisfies Record<WireSound, SoundType>;

export function toSoundType(value: WireSound): SoundType {
  return WIRE_SOUNDS[value];
}
