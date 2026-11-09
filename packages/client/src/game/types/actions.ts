// These represent actions that can modify the state store. (They cause a state duplication to occur
// and the state reducers to fire.) All of the sub-actions from the "gameAction" command are listed
// here.

import type { ServerCommandData, Spectator } from "@hanabi-live/data";
import type {
  ActionIncludingHypothetical,
  CardIdentity,
  GameAction,
  PlayerIndex,
} from "@hanabi-live/game";
import type { ClientAction } from "./ClientAction";
import type { UIAction } from "./UIAction";

export type Action =
  | ActionInit
  | ActionListReceived
  | GameAction
  | ReplayAction
  | ActionCardIdentities
  | ActionPremove
  | ActionPause
  | ActionPauseQueue
  | ActionSpectators
  | ActionFinishOngoingGame
  | UIAction;

export type { ActionIncludingHypothetical } from "@hanabi-live/game";

export type ReplayAction =
  | ActionReplayEnter
  | ActionReplayExit
  | ActionReplaySegment
  | ActionReplaySharedSegment
  | ActionReplayUseSharedSegments
  | ActionReplayLeader
  | ActionRestartDeclined
  | HypotheticalAction;

type HypotheticalAction =
  | ActionHypotheticalStart
  | ActionHypotheticalEnd
  | ActionHypotheticalAction
  | ActionHypotheticalBack
  | ActionHypotheticalShowDrawnCards;

// ----------------------
// Initialization actions
// ----------------------

/**
 * The parts of the "init" message that the state uses. `replay` is true for both dedicated solo
 * replays and shared replays.
 */
export interface ActionInit extends Readonly<
  Pick<
    ServerCommandData["init"],
    | "datetimeStarted"
    | "datetimeFinished"
    | "datetimeSharedReplayStarted"
    | "spectating"
    | "shadowing"
    | "replay"
    | "sharedReplay"
    | "databaseID"
    | "sharedReplaySegment"
    | "sharedReplayLeader"
    | "sharedReplayEffMod"
    | "spoilerFree"
    | "restartDeclined"
    | "paused"
    | "pauseQueued"
  >
> {
  readonly type: "init";

  /** The server sends `NO_VALUE` when nobody is pausing; the state keeps a seat. */
  readonly pausePlayerIndex: PlayerIndex;
}

interface ActionListReceived {
  readonly type: "gameActionList";
  readonly actions: readonly GameAction[];
}

// ---------------------
// Miscellaneous actions
// ---------------------

interface ActionCardIdentities {
  readonly type: "cardIdentities";
  readonly cardIdentities: readonly CardIdentity[];
}

interface ActionPremove {
  readonly type: "premove";
  readonly premove: ClientAction | null;
}

interface ActionPause extends Readonly<
  Pick<ServerCommandData["pause"], "active">
> {
  readonly type: "pause";

  /** The server sends `NO_VALUE` when nobody is pausing; the state keeps a seat. */
  readonly playerIndex: PlayerIndex;
}

interface ActionPauseQueue {
  readonly type: "pauseQueue";
  readonly queued: boolean;
}

interface ActionSpectators {
  readonly type: "spectators";
  readonly spectators: readonly Spectator[];
}

interface ActionFinishOngoingGame extends Readonly<
  Pick<
    ServerCommandData["finishOngoingGame"],
    "databaseID" | "sharedReplayLeader"
  >
> {
  readonly type: "finishOngoingGame";

  /** The server does not send this; the client records when it received the message. */
  readonly datetimeFinished: string;
}

// --------------
// Replay actions
// --------------

export interface ActionReplayEnter {
  readonly type: "replayEnter";
  readonly segment: number;
}

interface ActionReplayExit {
  readonly type: "replayExit";
}

interface ActionReplaySegment {
  readonly type: "replaySegment";
  readonly segment: number;
}

interface ActionReplaySharedSegment {
  readonly type: "replaySharedSegment";
  readonly segment: number;
}

interface ActionReplayUseSharedSegments {
  readonly type: "replayUseSharedSegments";
  readonly useSharedSegments: boolean;
}

interface ActionReplayLeader extends Readonly<
  Pick<ServerCommandData["replayLeader"], "name">
> {
  readonly type: "replayLeader";
}

interface ActionRestartDeclined extends Readonly<
  Pick<ServerCommandData["restartDeclined"], "names">
> {
  readonly type: "restartDeclined";
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  readonly type: "hypoStart";
  readonly showDrawnCards: boolean;
  readonly actions: readonly ActionIncludingHypothetical[];
}

export interface ActionHypotheticalEnd {
  readonly type: "hypoEnd";
}

export interface ActionHypotheticalAction {
  readonly type: "hypoAction";
  readonly action: ActionIncludingHypothetical;
}

export interface ActionHypotheticalBack {
  readonly type: "hypoBack";
}

interface ActionHypotheticalShowDrawnCards {
  readonly type: "hypoShowDrawnCards";
  readonly showDrawnCards: boolean;
}
