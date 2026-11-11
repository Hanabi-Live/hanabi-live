import type { ClientCommandData } from "@hanabi-live/data";

/** An in-game action that we just took: the "playerAction" command's action. */
export type ClientAction = ClientCommandData["playerAction"]["action"];

export type ClientActionColorClue = Extract<
  ClientAction,
  { type: "colorClue" }
>;
export type ClientActionRankClue = Extract<ClientAction, { type: "rankClue" }>;
export type ClientActionClue = ClientActionColorClue | ClientActionRankClue;
