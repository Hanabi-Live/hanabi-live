import type { CardIdentity } from "./CardIdentity";
import type { CardIdentityType } from "./CardIdentityType";
import type { ClientAction } from "./ClientAction";
import type { EndCondition } from "./EndCondition";
import type { MsgClue } from "./MsgClue";
import type { Spectator } from "./Spectator";
import type { SpectatorNote } from "./SpectatorNote";
import type { UIAction } from "./UI";

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

export type ActionIncludingHypothetical = GameAction | ActionHypotheticalMorph;

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
  readonly pausePlayerIndex: number;
}

interface ActionListReceived {
  readonly type: "gameActionList";
  readonly actions: GameAction[];
}

// ---------------------
// Miscellaneous actions
// ---------------------

interface ActionCardIdentities {
  readonly type: "cardIdentities";
  readonly cardIdentities: CardIdentity[];
}

interface ActionPremove {
  readonly type: "premove";
  readonly premove: ClientAction | null;
}

interface ActionPause {
  readonly type: "pause";
  readonly active: boolean;
  readonly playerIndex: number;
}

interface ActionPauseQueue {
  readonly type: "pauseQueue";
  readonly queued: boolean;
}

interface ActionSpectators {
  readonly type: "spectators";
  readonly spectators: Spectator[];
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

// Used to implement the "Slow-Witted" detrimental character
export interface ActionCardIdentity {
  readonly type: "cardIdentity";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionClue {
  readonly type: "clue";
  readonly clue: MsgClue;
  readonly giver: number;
  readonly list: number[];
  readonly target: number;
  readonly turn: number; // TODO: remove. This is unused
  readonly ignoreNegative: boolean;
}

export interface ActionDiscard {
  readonly type: "discard";
  readonly failed: boolean;
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionDraw {
  readonly type: "draw";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

interface ActionGameOver {
  readonly type: "gameOver";
  readonly endCondition: EndCondition;
  readonly playerIndex: number;

  /**
   * In a normal game, the `votes` array will be equal to the indices of the players who voted to
   * terminate the game. In a replay, `votes` will be equal to `null` because the server does not
   * store who voted to kill the game in the database.
   */
  readonly votes: number[] | null;
}

export interface ActionPlay {
  readonly type: "play";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

interface ActionPlayerTimes {
  readonly type: "playerTimes";
  readonly playerTimes: number[];
  readonly duration: number;
}

export interface ActionStrike {
  readonly type: "strike";
  readonly num: number; // 1 for the first strike, 2 for the second strike, etc.
  readonly order: number; // The order of the card that was misplayed
  readonly turn: number;
}

interface ActionTurn {
  readonly type: "turn";
  readonly num: number;
  readonly currentPlayerIndex: number;
}

// ------------
// Note actions
// ------------

interface ActionEditNote {
  readonly type: "editNote";
  readonly order: number;
  readonly text: string;
}

interface ActionReceiveNote {
  readonly type: "receiveNote";
  readonly order: number;
  readonly notes: SpectatorNote[];
}

interface ActionNoteListPlayer {
  readonly type: "noteListPlayer";
  readonly texts: string[];
}

interface ActionNoteList {
  readonly type: "noteList";
  readonly names: string[];
  readonly noteTextLists: string[][];
  readonly isSpectators: boolean[];
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
  readonly actions: ActionIncludingHypothetical[];
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
  readonly suitIndex: number | CardIdentityType;
  readonly rank: number | CardIdentityType;
  readonly order: number;
}

interface ActionHypotheticalShowDrawnCards {
  readonly type: "hypoShowDrawnCards";
  readonly showDrawnCards: boolean;
}
