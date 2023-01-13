import { CardIdentity } from "./CardIdentity";
import { CardIdentityType } from "./CardIdentityType";
import { ClientAction } from "./ClientAction";
import { EndCondition } from "./EndCondition";
import { MsgClue } from "./MsgClue";
import { Spectator } from "./Spectator";
import { SpectatorNote } from "./SpectatorNote";
import { UIAction } from "./UI";

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
  type: "init";
  datetimeStarted: string;
  datetimeFinished: string;
  spectating: boolean;
  shadowing: boolean;
  replay: boolean; // True if either a dedicated solo replay or a shared replay
  sharedReplay: boolean;
  databaseID: number;
  sharedReplaySegment: number;
  sharedReplayLeader: string;
  paused: boolean;
  pausePlayerIndex: number;
}

interface ActionListReceived {
  type: "gameActionList";
  readonly actions: GameAction[];
}

// ---------------------
// Miscellaneous actions
// ---------------------

interface ActionCardIdentities {
  type: "cardIdentities";
  readonly cardIdentities: CardIdentity[];
}

interface ActionPremove {
  type: "premove";
  readonly premove: ClientAction | null;
}

interface ActionPause {
  type: "pause";
  active: boolean;
  playerIndex: number;
}

interface ActionPauseQueue {
  type: "pauseQueue";
  queued: boolean;
}

interface ActionSpectators {
  type: "spectators";
  spectators: Spectator[];
}

interface ActionFinishOngoingGame {
  type: "finishOngoingGame";
  databaseID: number;
  sharedReplayLeader: string;
  datetimeFinished: string;
}

// ------------
// Game actions
// ------------

// Used to implement the "Slow-Witted" detrimental character
export interface ActionCardIdentity {
  type: "cardIdentity";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionClue {
  type: "clue";
  readonly clue: MsgClue;
  readonly giver: number;
  readonly list: number[];
  readonly target: number;
  readonly turn: number; // TODO: remove. This is unused
}

export interface ActionDiscard {
  type: "discard";
  readonly failed: boolean;
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionDraw {
  type: "draw";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

interface ActionGameOver {
  type: "gameOver";
  readonly endCondition: EndCondition;
  readonly playerIndex: number;
  readonly votes: number[];
}

export interface ActionPlay {
  type: "play";
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

interface ActionPlayerTimes {
  type: "playerTimes";
  readonly playerTimes: number[];
  readonly duration: number;
}

export interface ActionStrike {
  type: "strike";
  readonly num: number; // 1 for the first strike, 2 for the second strike, etc.
  readonly order: number; // The order of the card that was misplayed
  readonly turn: number;
}

export interface ActionTurn {
  type: "turn";
  readonly num: number;
  readonly currentPlayerIndex: number;
}

// ------------
// Note actions
// ------------

interface ActionEditNote {
  type: "editNote";
  readonly order: number;
  readonly text: string;
}

interface ActionReceiveNote {
  type: "receiveNote";
  readonly order: number;
  readonly notes: SpectatorNote[];
}

interface ActionNoteListPlayer {
  type: "noteListPlayer";
  readonly texts: string[];
}

interface ActionNoteList {
  type: "noteList";
  readonly names: string[];
  readonly noteTextLists: string[][];
  readonly isSpectators: boolean[];
}

interface ActionSetEffMod {
  type: "setEffMod";
  readonly mod: number;
}

// --------------
// Replay actions
// --------------

export interface ActionReplayEnter {
  type: "replayEnter";
  segment: number;
}

export interface ActionReplayExit {
  type: "replayExit";
}

interface ActionReplaySegment {
  type: "replaySegment";
  readonly segment: number;
}

interface ActionReplaySharedSegment {
  type: "replaySharedSegment";
  readonly segment: number;
}

interface ActionReplayUseSharedSegments {
  type: "replayUseSharedSegments";
  readonly useSharedSegments: boolean;
}

interface ActionReplayLeader {
  type: "replayLeader";
  readonly name: string;
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  type: "hypoStart";
  readonly showDrawnCards: boolean;
  readonly actions: ActionIncludingHypothetical[];
}

export interface ActionHypotheticalEnd {
  type: "hypoEnd";
}

export interface ActionHypotheticalAction {
  type: "hypoAction";
  readonly action: ActionIncludingHypothetical;
}

export interface ActionHypotheticalBack {
  type: "hypoBack";
}

interface ActionHypotheticalMorph {
  type: "morph"; // This is not "hypoMorph" because it is a game action
  readonly suitIndex: number | CardIdentityType;
  readonly rank: number | CardIdentityType;
  readonly order: number;
}

interface ActionHypotheticalShowDrawnCards {
  type: "hypoShowDrawnCards";
  readonly showDrawnCards: boolean;
}
