import CardIdentity from './CardIdentity';
import ClientAction from './ClientAction';
import MsgClue from './MsgClue';

export type Action =
  | GameAction
  | ReplayAction
  | PremoveAction
  | ActionListReceived
  | ActionCardIdentities;

export type GameAction =
  | ActionClue
  | ActionDiscard
  | ActionDraw
  | ActionGameOver
  | ActionPlay
  | ActionReorder
  | ActionStackDirections
  | ActionStatus
  | ActionStrike
  | ActionText
  | ActionTurn;

export type ActionIncludingHypothetical = GameAction | ActionHypotheticalMorph;

export type ReplayAction =
  | ActionStartReplay
  | ActionEndReplay
  | ActionGoToTurn
  | ActionHypotheticalStart
  | ActionHypotheticalEnd
  | ActionHypotheticalBack
  | ActionHypothetical
  | ActionHypotheticalShowDrawnCards;

export type PremoveAction =
  | ActionPremove
  | ActionPremoveCluedCardOrder;

// ----------------------
// Initialization actions
// ----------------------

export interface ActionListReceived {
  type: 'gameActionList';
  readonly actions: GameAction[];
}

export interface ActionCardIdentities {
  type: 'cardIdentities';
  readonly cardIdentities: CardIdentity[];
}

// ------------
// Game actions
// ------------

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
  readonly which: Which;
}

export interface ActionDraw {
  type: 'draw';
  readonly who: number;
  readonly rank: number;
  readonly suitIndex: number;
  readonly order: number;
}

export interface ActionGameOver {
  type: 'gameOver';
  readonly endCondition: number;
  readonly playerIndex: number;
}

export interface ActionPlay {
  type: 'play';
  readonly which: Which;
}

export interface ActionReorder {
  type: 'reorder';
  readonly target: number;
  readonly handOrder: number[];
}

export interface ActionStackDirections {
  type: 'stackDirections';
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

export interface ActionText {
  type: 'text';
  readonly text: string;
}

export interface ActionTurn {
  type: 'turn';
  readonly num: number;
  readonly who: number;
}

export interface Which {
  readonly index: number;
  readonly suitIndex: number;
  readonly rank: number;
  readonly order: number;
}

// --------------
// Replay actions
// --------------

export interface ActionStartReplay {
  type: 'startReplay';
  readonly turn: number;
}

export interface ActionEndReplay {
  type: 'endReplay';
}

export interface ActionGoToTurn {
  type: 'goToTurn';
  readonly turn: number;
}

// --------------------
// Hypothetical actions
// --------------------

export interface ActionHypotheticalStart {
  type: 'hypoStart';
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

// ---------------
// Premove actions
// ---------------

export interface ActionPremove {
  type: 'premove';
  readonly action: ClientAction | null;
}

export interface ActionPremoveCluedCardOrder {
  type: 'premoveCluedCardOrder';
  readonly order: number | null;
}
