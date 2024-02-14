import type { Tuple } from "isaacscript-common-ts";
import type { EndCondition } from "../enums/EndCondition";
import type { SpectatorNote } from "../interfaces/SpectatorNote";
import type { CardOrder } from "./CardOrder";
import type { MsgClue } from "./MsgClue";
import type { NumPlayers } from "./NumPlayers";
import type { PlayerIndex } from "./PlayerIndex";
import type { Rank } from "./Rank";
import type { SuitIndex } from "./SuitIndex";

/**
 * An in-game action that can mutate a game state. This includes the 3 in-game actions of cluing,
 * playing, and discarding, but also includes things like drawing cards. (An action of e.g. playing
 * a card will not automatically draw a card for the player.)
 */
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

export interface ActionGameOver {
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

export interface ActionPlayerTimes {
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

export interface ActionTurn {
  readonly type: "turn";
  readonly num: number;
  readonly currentPlayerIndex: PlayerIndex;
}

// ------------
// Note actions
// ------------

export interface ActionEditNote {
  readonly type: "editNote";
  readonly order: CardOrder;
  readonly text: string;
}

export interface ActionReceiveNote {
  readonly type: "receiveNote";
  readonly order: CardOrder;
  readonly notes: readonly SpectatorNote[];
}

export interface ActionNoteListPlayer {
  readonly type: "noteListPlayer";
  readonly texts: readonly string[];
}

export interface ActionNoteList {
  readonly type: "noteList";
  readonly names: readonly string[];
  readonly noteTextLists: ReadonlyArray<readonly string[]>;
  readonly isSpectators: readonly boolean[];
}

export interface ActionSetEffMod {
  readonly type: "setEffMod";
  readonly mod: number;
}
