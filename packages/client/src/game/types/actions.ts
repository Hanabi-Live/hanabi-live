// These represent actions that can modify the state store. (They cause a state duplication to occur
// and the state reducers to fire.) All of the sub-actions from the "gameEvent" command are listed
// here.

import type { ServerCommandData, Spectator } from "@hanabi-live/data";
import type {
  ActionIncludingHypothetical,
  CardIdentity,
  GameAction,
} from "@hanabi-live/game";
import type { ClientAction } from "./ClientAction.ts";
import type { UIAction } from "./UIAction.ts";

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

/** The parts of the "init" message that the state uses. */
export interface ActionInit extends Readonly<
  Pick<
    ServerCommandData["init"],
    | "datetimeStarted"
    | "datetimeFinished"
    | "mode"
    | "gameId"
    | "sharedReplay"
    | "pausePlayerIndex"
    | "pauseQueued"
  >
> {
  readonly type: "init";
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
  readonly premove: ClientAction | undefined;
}

interface ActionPause extends Readonly<
  Pick<ServerCommandData["pause"], "pausePlayerIndex">
> {
  readonly type: "pause";
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
  Pick<ServerCommandData["finishOngoingGame"], "gameId" | "sharedReplay">
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
  Pick<ServerCommandData["replayLeader"], "username">
> {
  readonly type: "replayLeader";
}

interface ActionRestartDeclined extends Readonly<
  Pick<ServerCommandData["restartDeclined"], "usernames">
> {
  readonly type: "restartDeclined";
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  readonly type: "hypoStart";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly showDrawnCards: boolean;
  readonly actions: readonly ActionIncludingHypothetical[];
}

export interface ActionHypotheticalEnd {
  readonly type: "hypoEnd";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
}

export interface ActionHypotheticalAction {
  readonly type: "hypoAction";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly action: ActionIncludingHypothetical;
}

export interface ActionHypotheticalBack {
  readonly type: "hypoBack";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
}

interface ActionHypotheticalShowDrawnCards {
  readonly type: "hypoShowDrawnCards";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly showDrawnCards: boolean;
}
