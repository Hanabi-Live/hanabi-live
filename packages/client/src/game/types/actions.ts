// These represent actions that can modify the state store. (They cause a state duplication to occur
// and the state reducers to fire.) All of the sub-actions from the "gameAction" command are listed
// here.

import type { Spectator } from "@hanabi-live/data";
import type {
  CardIdentity,
  CardOrder,
  GameAction,
  PlayerIndex,
  Rank,
  SuitIndex,
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

export type ActionIncludingHypothetical =
  | GameAction
  | ActionHypotheticalMorph
  | ActionHypotheticalUnmorph;

export type ReplayAction =
  | ActionReplayEnter
  | ActionReplayExit
  | ActionReplaySegment
  | ActionReplaySharedSegment
  | ActionReplayUseSharedSegments
  | ActionReplayLeader
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

export interface ActionInit {
  readonly type: "init";
  readonly datetimeStarted: string;
  readonly datetimeFinished: string;
  readonly spectating: boolean;
  readonly shadowing: boolean;

  /** True if either a dedicated solo replay or a shared replay. */
  readonly replay: boolean;

  readonly sharedReplay: boolean;
  readonly databaseID: number;
  readonly sharedReplaySegment: number;
  readonly sharedReplayLeader: string;
  readonly paused: boolean;
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

interface ActionPause {
  readonly type: "pause";
  readonly active: boolean;
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

interface ActionFinishOngoingGame {
  readonly type: "finishOngoingGame";
  readonly databaseID: number;
  readonly sharedReplayLeader: string;
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

interface ActionReplayLeader {
  readonly type: "replayLeader";
  readonly name: string;
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

interface ActionHypotheticalMorph {
  readonly type: "morph"; // This is not "hypoMorph" because it is a game action.

  /** -1 represents a card of an unknown card. */
  readonly suitIndex: SuitIndex | -1;

  /** -1 represents a card of an unknown rank. */
  readonly rank: Rank | -1;

  readonly order: CardOrder;
}

interface ActionHypotheticalUnmorph {
  readonly type: "unmorph"; // This is not "hypoUnmorph" because it is a game action.
  readonly order: CardOrder;
}

interface ActionHypotheticalShowDrawnCards {
  readonly type: "hypoShowDrawnCards";
  readonly showDrawnCards: boolean;
}
