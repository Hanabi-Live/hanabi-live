// Converts server payloads, which the connection has already validated against their generated
// schemas, where the client represents a value differently from the server. The remaining checks
// cover what the schemas cannot express: seat-indexed tuples.

import type {
  actionRequestSchema,
  ClientCommandData,
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
import { ClueType, isValidNumPlayers } from "@hanabi-live/game";
import type { Tuple } from "complete-common";
import type { z } from "zod";
import type { ClientAction } from "./game/types/ClientAction";
import { SoundType } from "./game/types/SoundType";

type WireEvent = ServerCommandData["gameAction"]["action"];
type WireCardIdentity =
  ServerCommandData["cardIdentities"]["identities"][number];

/** Converts an action that we took into the "action" command's payload. */
export function toWireAction(
  tableID: number,
  action: ClientAction,
): z.input<typeof actionRequestSchema> {
  return { tableID, ...action };
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

/** The server omits a suit or rank that the recipient may not see. */
export function toCardIdentity(identity: WireCardIdentity): CardIdentity {
  return { suitIndex: identity.suitIndex, rank: identity.rank };
}

type WireReplayAction = ServerCommandData["replayAction"];
type WireHypotheticalAction = Extract<
  WireReplayAction,
  { type: "hypoAction" }
>["action"];
type OutgoingHypotheticalAction = Extract<
  ClientCommandData["replayAction"],
  { type: "hypoAction" }
>["action"];

/** The server omits a clue that the recipient may not see; the game state keeps its giver. */
const HIDDEN_CLUE = {
  type: undefined,
  value: undefined,
} as const satisfies HiddenClue;

/** Converts a clue from the server, naming its type with the enum. */
function toClue(clue: WireClue | undefined): HiddenClue | MsgClue {
  if (clue === undefined) {
    return HIDDEN_CLUE;
  }
  return clue.type === 0
    ? { type: ClueType.Color, value: clue.value }
    : { type: ClueType.Rank, value: clue.value };
}

/** Converts a hypothetical action from the server into the action the game state applies. */
export function toHypotheticalAction(
  action: WireHypotheticalAction,
): ActionIncludingHypothetical {
  if (action.type !== "clue") {
    return action;
  }
  return { ...action, clue: toClue(action.clue) };
}

/** Converts a hypothetical action for the server, which omits a hidden clue. */
export function toWireHypotheticalAction(
  action: ActionIncludingHypothetical,
): OutgoingHypotheticalAction {
  if (action.type !== "clue") {
    return action;
  }
  const { clue, ...rest } = action;
  return clue.type === undefined ? rest : { ...rest, clue };
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
  return { ...clue, clue: toClue(clue.clue), ignoreNegative: false };
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
  "someone-joined": SoundType.SomeoneJoined,
} as const satisfies Record<WireSound, SoundType>;

export function toSoundType(value: WireSound): SoundType {
  return WIRE_SOUNDS[value];
}
