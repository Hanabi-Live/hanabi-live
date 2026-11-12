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
import type { UiAction } from "./UiAction.ts";

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
  | ActionGameFinished
  | UiAction;

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

/** The parts of the "gameInit" message that the state uses. */
export interface ActionInit extends Readonly<
  Pick<ServerCommandData["gameInit"], "startedAt" | "finishedAt" | "mode">
> {
  readonly type: "init";

  /** The name of the shared replay's leader. */
  readonly leader: string | undefined;
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
  Pick<ServerCommandData["pause"], "playerIndex" | "queued">
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

interface ActionGameFinished extends Readonly<
  Pick<ServerCommandData["gameFinished"], "gameId" | "sharedReplay">
> {
  readonly type: "gameFinished";

  /** The server does not send this; the client records when it received the message. */
  readonly datetimeFinished: string;

  /** The name of the shared replay's leader, which the server sends as a user ID. */
  readonly leader: string;
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

interface ActionReplayLeader {
  readonly type: "replayLeader";
  readonly username: string;
}

interface ActionRestartDeclined extends Readonly<
  Pick<ServerCommandData["restartDeclined"], "restartDeclined">
> {
  readonly type: "restartDeclined";
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  readonly type: "hypotheticalStart";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly showDrawnCards: boolean;
  readonly actions: readonly ActionIncludingHypothetical[];
}

export interface ActionHypotheticalEnd {
  readonly type: "hypotheticalEnd";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
}

export interface ActionHypotheticalAction {
  readonly type: "hypotheticalAction";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly action: ActionIncludingHypothetical;
}

export interface ActionHypotheticalBack {
  readonly type: "hypotheticalBack";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
}

interface ActionHypotheticalShowDrawnCards {
  readonly type: "hypotheticalShowDrawnCards";
  /** Whether this is for the shared replay's hypothetical, rather than our own. */
  readonly shared: boolean;
  readonly showDrawnCards: boolean;
}
