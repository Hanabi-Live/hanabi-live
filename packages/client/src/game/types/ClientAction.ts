import type { ClientRequestData } from "@hanabi-live/data";

/** An in-game action that we just took: the "playerAction" command's action. */
export type ClientAction = ClientRequestData["playerAction"]["action"];

export type ClientActionClue = Extract<ClientAction, { type: "clue" }>;

/** A clue's type and value, as a clue action gives it. */
export type ClientClue = ClientActionClue["clue"];
