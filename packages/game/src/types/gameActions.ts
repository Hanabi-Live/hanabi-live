import type { z } from "zod";
import type {
  gameEventSchema,
  hypotheticalEventSchema,
} from "../generated/protocol.ts";
import type { AuthorNote } from "../interfaces/AuthorNote.ts";
import type { AuthorNotes } from "../interfaces/AuthorNotes.ts";
import type { CardOrder } from "./CardOrder.ts";
import type { HiddenClue } from "./HiddenClue.ts";
import type { MsgClue } from "./MsgClue.ts";

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
  | ActionMisplay
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
// ranks are absent: the card is hidden from the recipient, or the variant does not reveal it.

type GameEvent = z.output<typeof gameEventSchema>;

/** A move in a hypothetical, as the server relays it. */
export type HypotheticalWireEvent = z.output<typeof hypotheticalEventSchema>;

type Event<Type extends GameEvent["type"]> = Readonly<
  Extract<GameEvent, { type: Type }>
>;

/** Used to implement the "Slow-Witted" detrimental character. */
export type ActionCardIdentity = Event<"cardIdentity">;
export type ActionDiscard = Event<"discard">;
export type ActionDraw = Event<"draw">;

/**
 * `playerIndex` is undefined when no player caused the end of the game. `votes` holds the players
 * who voted to terminate the game. It is empty when no vote ended the game, and in a replay,
 * because the server does not store who voted to kill the game in the database.
 */
export type ActionGameOver = Event<"gameOver">;

export type ActionPlay = Event<"play">;

/** A play that fails, which discards the card and adds a strike. */
export type ActionMisplay = Event<"misplay">;

/** One time per player, in seat order. */
export type ActionPlayerTimes = Event<"playerTimes">;

/** `currentPlayerIndex` is absent once the game has ended. */
export type ActionTurn = Event<"turn">;

/**
 * A clue's giver, receiver, and the card orders that it touched. Where the server omits a clue that
 * the recipient may not see, the game state keeps a `HiddenClue`.
 */
export type ActionClue = Readonly<
  Omit<Extract<HypotheticalWireEvent, { type: "clue" }>, "clue">
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
  readonly notes: readonly AuthorNote[];
}

export interface ActionNoteListPlayer {
  readonly type: "noteListPlayer";
  readonly texts: readonly string[];
}

export interface ActionNoteList {
  readonly type: "noteList";
  readonly notes: readonly AuthorNotes[];
}

export interface ActionSetEfficiencyModifier {
  readonly type: "setEfficiencyModifier";
  readonly efficiencyModifier: number;
}
