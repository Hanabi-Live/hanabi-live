import CardIdentity from './CardIdentity';
import ClientAction from './ClientAction';
import EndCondition from './EndCondition';
import MsgClue from './MsgClue';
import Spectator from './Spectator';

export type Action =
  | GameAction
  | ReplayAction
  | ActionListReceived
  | ActionCardIdentities
  | ActionPremove
  | ActionPause
  | ActionPauseQueue
  | ActionSpectating
  | ActionSpectators
  | ActionFinishOngoingGame
  | ActionReplayEnterDedicated;

export type GameAction =
  | ActionCardIdentity
  | ActionClue
  | ActionDiscard
  | ActionDraw
  | ActionGameDuration
  | ActionGameOver
  | ActionPlay
  | ActionPlayerTimes
  | ActionPlayStackDirections
  | ActionStatus
  | ActionStrike
  | ActionTurn;

export type ActionIncludingHypothetical = GameAction | ActionHypotheticalMorph;

export type ReplayAction =
  | ActionReplayEnter
  | ActionReplayExit
  | ActionReplaySegment
  | ActionReplaySharedSegment
  | ActionReplayUseSharedSegments
  | ActionReplayLeader
  | HypotheticalAction;

export type HypotheticalAction =
  | ActionHypotheticalStart
  | ActionHypotheticalEnd
  | ActionHypotheticalBack
  | ActionHypothetical
  | ActionHypotheticalShowDrawnCards;

// ----------------------
// Initialization actions
// ----------------------

export interface ActionListReceived {
  type: 'gameActionList';
  readonly actions: GameAction[];
}

// ---------------------
// Miscellaneous actions
// ---------------------

export interface ActionCardIdentities {
  type: 'cardIdentities';
  readonly cardIdentities: CardIdentity[];
}

export interface ActionPremove {
  type: 'premove';
  readonly premove: ClientAction | null;
}

export interface ActionPause {
  type: 'pause';
  active: boolean;
  playerIndex: number;
}

export interface ActionPauseQueue {
  type: 'pauseQueue';
  queued: boolean;
}

export interface ActionSpectating {
  type: 'spectating';
}

export interface ActionSpectators {
  type: 'spectators';
  spectators: Spectator[];
}

export interface ActionFinishOngoingGame {
  type: 'finishOngoingGame';
  databaseID: number;
  sharedReplayLeader: string;
}

export interface ActionReplayEnterDedicated {
  type: 'replayEnterDedicated';
  shared: boolean;
  databaseID: number;
  sharedReplayLeader: string;
  sharedReplaySegment: number;
}

// ------------
// Game actions
// ------------

// Used to implement the "Slow-Witted" detrimental character
export interface ActionCardIdentity {
  type: 'cardIdentity';
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionClue {
  type: 'clue';
  readonly clue: MsgClue;
  readonly giver: number;
  readonly list: number[];
  readonly target: number;
  readonly turn: number;
}

export interface ActionDiscard {
  type: 'discard';
  readonly failed: boolean;
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionDraw {
  type: 'draw';
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionGameDuration {
  type: 'gameDuration';
  duration: number;
}

export interface ActionGameOver {
  type: 'gameOver';
  readonly endCondition: EndCondition;
  readonly playerIndex: number;
}

export interface ActionPlay {
  type: 'play';
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export interface ActionPlayerTimes {
  type: 'playerTimes';
  readonly playerTimes: number[];
}

export interface ActionPlayStackDirections {
  type: 'playStackDirections';
  readonly directions: number[];
}

export interface ActionStatus {
  type: 'status';
  readonly clues: number;
  readonly score: number;
  readonly maxScore: number;
  readonly doubleDiscard: boolean;
}

export interface ActionStrike {
  type: 'strike';
  readonly num: number; // 1 for the first strike, 2 for the second strike, etc.
  readonly order: number; // The order of the card that was misplayed
  readonly turn: number;
}

export interface ActionTurn {
  type: 'turn';
  readonly num: number;
  readonly currentPlayerIndex: number;
}

// --------------
// Replay actions
// --------------

export interface ActionReplayEnter {
  type: 'replayEnter';
  segment: number;
}

export interface ActionReplayExit {
  type: 'replayExit';
}

export interface ActionReplaySegment {
  type: 'replaySegment';
  readonly segment: number;
}

export interface ActionReplaySharedSegment {
  type: 'replaySharedSegment';
  readonly segment: number;
}

export interface ActionReplayUseSharedSegments {
  type: 'replayUseSharedSegments';
  readonly useSharedSegments: boolean;
}

export interface ActionReplayLeader {
  type: 'replayLeader';
  readonly name: string;
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  type: 'hypoStart';
  drawnCardsShown: boolean;
}

export interface ActionHypotheticalEnd {
  type: 'hypoEnd';
}

export interface ActionHypotheticalBack {
  type: 'hypoBack';
}

export interface ActionHypothetical {
  type: 'hypoAction';
  readonly action: ActionIncludingHypothetical;
}

export interface ActionHypotheticalMorph {
  type: 'morph';
  readonly suitIndex: number;
  readonly rank: number;
  readonly order: number;
}

export interface ActionHypotheticalShowDrawnCards {
  type: 'hypoRevealed';
  readonly showDrawnCards: boolean;
}
