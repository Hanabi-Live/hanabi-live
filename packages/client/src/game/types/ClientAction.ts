import type { ClientCommandData } from "@hanabi-live/data";

/** An in-game action that we just took: the "action" command's turn. */
export type ClientAction = ClientCommandData["action"]["action"];

export type ClientActionColorClue = Extract<
  ClientAction,
  { type: "colorClue" }
>;
export type ClientActionRankClue = Extract<ClientAction, { type: "rankClue" }>;
export type ClientActionClue = ClientActionColorClue | ClientActionRankClue;
