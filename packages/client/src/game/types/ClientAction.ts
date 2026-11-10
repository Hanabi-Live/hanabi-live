import type { ClientCommandData } from "@hanabi-live/data";

/** Removes the table from each kind of action. */
type WithoutTable<Action> = Action extends unknown
  ? Omit<Action, "tableID">
  : never;

/** An in-game action that we just took: the "action" command, without its table. */
export type ClientAction = WithoutTable<ClientCommandData["action"]>;

export type ClientActionColorClue = Extract<
  ClientAction,
  { type: "colorClue" }
>;
export type ClientActionRankClue = Extract<ClientAction, { type: "rankClue" }>;
export type ClientActionClue = ClientActionColorClue | ClientActionRankClue;
