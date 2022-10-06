export const STACK_BASE_RANK = 0;
export const UNKNOWN_CARD_RANK = 6;
export const START_CARD_RANK = 7;
export const MAX_RANK = 7;
export const MAX_CLUE_NUM = 8;
export const MAX_STRIKES = 3;
export const DEFAULT_VARIANT_NAME = "No Variant";
export const DEFAULT_CARD_RANKS: readonly number[] = [1, 2, 3, 4, 5];
export const DEFAULT_CLUE_RANKS: readonly number[] = [1, 2, 3, 4, 5];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;

const MAX_CARDS_IN_A_SUIT = 10;
const MAX_SUITS_IN_A_VARIANT = 6;
export const MAX_CARDS_IN_A_DECK = MAX_CARDS_IN_A_SUIT * MAX_SUITS_IN_A_VARIANT;

export const HYPO_PLAYER_NAMES = [
  "Alice",
  "Bob",
  "Cathy",
  "Donald",
  "Emily",
  "Frank",
];

export const PROJECT_NAME = "Hanab Live";
export const DOMAIN = "hanab.live";
export const OLD_DOMAIN = "hanabi.live";
const PROTOCOL = "https";
export const SITE_URL = `${PROTOCOL}://${DOMAIN}`;
