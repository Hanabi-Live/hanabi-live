// These represent actions that can modify the state store. (They cause a state duplication to occur
// and the state reducers to fire.) All of the sub-actions from the "gameAction" command are listed
// here.

import type {
  CardOrder,
  NumPlayers,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi/data";
import type { EndCondition } from "@hanabi/game";
import type { Tuple } from "@hanabi/utils";
import type { CardIdentity } from "./CardIdentity";
import type { ClientAction } from "./ClientAction";
import type { MsgClue } from "./MsgClue";
import type { Spectator } from "./Spectator";
import type { SpectatorNote } from "./SpectatorNote";
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

export type GameAction =
  | ActionCardIdentity
  | ActionClue
  | ActionDiscard
  | ActionDraw
  | ActionGameOver
  | ActionPlay
  | ActionPlayerTimes
  | ActionStrike
  | ActionTurn
  | NoteAction;

export type NoteAction =
  | ActionEditNote
  | ActionNoteList
  | ActionNoteListPlayer
  | ActionReceiveNote
  | ActionSetEffMod;

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

// ------------
// Game actions
// ------------

/** Used to implement the "Slow-Witted" detrimental character. */
export interface ActionCardIdentity {
  readonly type: "cardIdentity";
  readonly playerIndex: PlayerIndex;
  readonly order: CardOrder;

  /** The server scrubs the identity under certain circumstances, which is represented by -1. */
  readonly suitIndex: SuitIndex | -1;

  /** The server scrubs the identity under certain circumstances, which is represented by -1. */
  readonly rank: Rank | -1;
}

export interface ActionClue {
  readonly type: "clue";
  readonly clue: MsgClue;

  /** The player index of the person giving the clue. */
  readonly giver: PlayerIndex;

  /** The card orders that were touched by this clue. */
  readonly list: readonly CardOrder[];

  /** The player index of the person being clued. */
  readonly target: PlayerIndex;

  readonly turn: number; // TODO: remove. This is unused.
  readonly ignoreNegative: boolean;
}

export interface ActionDiscard {
  readonly type: "discard";
  readonly playerIndex: PlayerIndex;
  readonly order: CardOrder;

  /**
   * -1 represents a card of an unknown suit. This will only be -1 in special variants where the
   * identity of discarded cards is not revealed.
   */
  readonly suitIndex: SuitIndex | -1;

  /**
   * -1 represents a card of an unknown rank. This will only be -1 in special variants where the
   * identity of discarded cards is not revealed.
   */
  readonly rank: Rank | -1;

  readonly failed: boolean;
}

export interface ActionDraw {
  readonly type: "draw";
  readonly playerIndex: PlayerIndex;
  readonly order: CardOrder;

  /** -1 represents a card of an unknown suit (e.g. it was drawn to our own hand). */
  readonly suitIndex: SuitIndex | -1;

  /** -1 represents a card of an unknown rank (e.g. it was drawn to our own hand). */
  readonly rank: Rank | -1;
}

interface ActionGameOver {
  readonly type: "gameOver";
  readonly endCondition: EndCondition;
  readonly playerIndex: PlayerIndex;

  /**
   * In a normal game, the `votes` array will be filled with the indices of the players who voted to
   * terminate the game. In a replay, `votes` will be equal to `null` because the server does not
   * store who voted to kill the game in the database.
   */
  readonly votes: readonly PlayerIndex[] | null;
}

export interface ActionPlay {
  readonly type: "play";
  readonly playerIndex: PlayerIndex;
  readonly order: CardOrder;

  /**
   * -1 represents a card of an unknown suit. This will only be -1 in special variants where the
   * identity of played cards is not revealed.
   */
  readonly suitIndex: SuitIndex | -1;

  /**
   * -1 represents a card of an unknown rank. This will only be -1 in special variants where the
   * identity of played cards is not revealed.
   */
  readonly rank: Rank | -1;
}

interface ActionPlayerTimes {
  readonly type: "playerTimes";
  readonly playerTimes: Tuple<number, NumPlayers>;
  readonly duration: number;
}

export interface ActionStrike {
  readonly type: "strike";
  readonly num: 1 | 2 | 3;

  /** The order of the card that was misplayed. */
  readonly order: CardOrder;

  readonly turn: number;
}

interface ActionTurn {
  readonly type: "turn";
  readonly num: number;
  readonly currentPlayerIndex: PlayerIndex;
}

// ------------
// Note actions
// ------------

interface ActionEditNote {
  readonly type: "editNote";
  readonly order: CardOrder;
  readonly text: string;
}

interface ActionReceiveNote {
  readonly type: "receiveNote";
  readonly order: CardOrder;
  readonly notes: readonly SpectatorNote[];
}

interface ActionNoteListPlayer {
  readonly type: "noteListPlayer";
  readonly texts: readonly string[];
}

interface ActionNoteList {
  readonly type: "noteList";
  readonly names: readonly string[];
  readonly noteTextLists: ReadonlyArray<readonly string[]>;
  readonly isSpectators: readonly boolean[];
}

interface ActionSetEffMod {
  readonly type: "setEffMod";
  readonly mod: number;
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
