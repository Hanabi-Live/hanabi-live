// Converts server payloads, which the connection has already validated against their generated
// schemas, where the client represents a value differently from the server. The remaining checks
// cover what the schemas cannot express: seat-indexed tuples.

import type {
  ClientCommandData,
  playerActionRequestSchema,
  ServerCommandData,
} from "@hanabi-live/data";
import type {
  ActionIncludingHypothetical,
  CardIdentity,
  GameAction,
  HiddenClue,
  MsgClue,
  NumPlayers,
  WireClue,
} from "@hanabi-live/game";
import { isValidNumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import type { z } from "zod";
import type { ClientAction } from "./game/types/ClientAction.ts";
import { SoundType } from "./game/types/SoundType.ts";

type WireEvent = ServerCommandData["gameEvent"]["event"];
type WireCardIdentity =
  ServerCommandData["cardIdentities"]["identities"][number];

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

type WireReplayAction = ServerCommandData["replayAction"]["action"];
type WireHypotheticalEvent = Extract<
  WireReplayAction,
  { type: "hypoAction" }
>["action"];
type OutgoingHypotheticalEvent = Extract<
  ClientCommandData["replayAction"]["action"],
  { type: "hypoAction" }
>["action"];

/** The server omits a clue that the recipient may not see; the game state keeps its giver. */
const HIDDEN_CLUE = {
  type: undefined,
  value: undefined,
} as const satisfies HiddenClue;

function toClue(clue: WireClue | undefined): HiddenClue | MsgClue {
  return clue ?? HIDDEN_CLUE;
}

/** Converts a hypothetical action from the server into the action the game state applies. */
export function toHypotheticalAction(
  action: WireHypotheticalEvent,
): ActionIncludingHypothetical {
  if (action.type !== "clue") {
    return action;
  }
  return { ...action, clue: toClue(action.clue) };
}

/** Converts a hypothetical action for the server, which omits a hidden clue. */
export function toWireHypotheticalAction(
  action: ActionIncludingHypothetical,
): OutgoingHypotheticalEvent {
  if (action.type !== "clue") {
    return action;
  }
  const { clue, ...rest } = action;
  return clue.type === undefined ? rest : { ...rest, clue };
}

/**
 * Converts a game event from the server into the action the game state applies. The game library
 * derives its event types from the same wire contracts. Every received clue applies its negative
 * information.
 */
export function toGameAction(event: WireEvent): GameAction {
  if (event.type !== "clue") {
    return event;
  }
  return { ...event, clue: toClue(event.clue), ignoreNegative: false };
}

type WireSound =
  | Extract<WireReplayAction, { type: "sound" }>["sound"]
  | ServerCommandData["soundLobby"]["file"];

/** The sound file for each sound the server names. Type checking requires one for every name. */
const WIRE_SOUNDS = {
  buzz: SoundType.Buzz,
  clap: SoundType.Clap,
  holy: SoundType.Holy,
  nooo: SoundType.Nooo,
  shutdown: SoundType.Shutdown,
  someoneJoined: SoundType.SomeoneJoined,
} as const satisfies Record<WireSound, SoundType>;

export function toSoundType(value: WireSound): SoundType {
  return WIRE_SOUNDS[value];
}
