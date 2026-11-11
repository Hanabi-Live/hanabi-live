import { VALID_NUM_PLAYERS } from "../constants.js";

export type NumPlayers = (typeof VALID_NUM_PLAYERS)[number];

export function isValidNumPlayers(value: unknown): value is NumPlayers {
  return VALID_NUM_PLAYERS.includes(value as NumPlayers);
}
