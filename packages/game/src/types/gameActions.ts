import type { z } from "zod";
import type {
  gameEventSchema,
  hypotheticalActionSchema,
} from "../generated/protocol";
import type { PlayerNotes } from "../interfaces/PlayerNotes";
import type { SpectatorNote } from "../interfaces/SpectatorNote";
import type { CardOrder } from "./CardOrder";
import type { HiddenClue } from "./HiddenClue";
import type { MsgClue } from "./MsgClue";

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
  | ActionTurn
  | NoteAction;

export type NoteAction =
  | ActionEditNote
  | ActionNoteList
  | ActionNoteListPlayer
  | ActionReceiveNote
  | ActionSetEfficiencyModifier;

// ------------
// Game actions
// ------------

// The server sends these events, so their types come from its wire contracts. Unknown suits and
// ranks are -1: the card is hidden from the recipient, or the variant does not reveal it.

type GameEvent = z.output<typeof gameEventSchema>;

/** A move in a hypothetical, as the server relays it. */
export type HypotheticalWireAction = z.output<typeof hypotheticalActionSchema>;

type Event<Type extends GameEvent["type"]> = Readonly<
  Extract<GameEvent, { type: Type }>
>;

/** Used to implement the "Slow-Witted" detrimental character. */
export type ActionCardIdentity = Event<"cardIdentity">;
export type ActionDiscard = Event<"discard">;
export type ActionDraw = Event<"draw">;

/**
 * `playerIndex` is undefined when no player caused the end of the game. `votes` holds the players
 * who voted to terminate the game. It is undefined when no vote ended the game, and in a replay,
 * because the server does not store who voted to kill the game in the database.
 */
export type ActionGameOver = Event<"gameOver">;

export type ActionPlay = Event<"play">;

/** One time per player, in seat order. */
export type ActionPlayerTimes = Event<"playerTimes">;

/** `currentPlayerIndex` is absent once the game has ended. */
export type ActionTurn = Event<"turn">;

/**
 * A clue's giver, target, and the card orders that it touched. The game state needs the clue's type
 * and value narrowed, which the server's events leave as plain integers.
 */
export type ActionClue = Readonly<
  Omit<Extract<HypotheticalWireAction, { type: "clue" }>, "clue">
> & {
  readonly clue: MsgClue | HiddenClue;
};

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
  readonly notes: readonly PlayerNotes[];
}

export interface ActionSetEfficiencyModifier {
  readonly type: "setEfficiencyModifier";
  readonly efficiencyModifier: number;
}
