/** The valid amount of players that can be in a game. */
export const VALID_NUM_PLAYERS = [2, 3, 4, 5, 6] as const;
export type NumPlayers = (typeof VALID_NUM_PLAYERS)[number];
