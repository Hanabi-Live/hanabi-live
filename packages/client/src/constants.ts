// Time constants

/** In milliseconds. */
export const FADE_TIME_MS = 350;

/** The opacity of a lobby element that is disabled or inactive. */
export const DIMMED_OPACITY = 0.3;

export const TYPED_HISTORY_MAX_LENGTH = 250;

/** The value of `globals.tableID` when we are not joined to a table. */
export const NO_TABLE_ID = -1;

/** The HTTP status codes that the client handles specially. */
export const HTTP_STATUS = {
  OK: 200,

  /** Sent when there is no valid session cookie. */
  NO_CONTENT: 204,

  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  TOO_MANY_REQUESTS: 429,

  /** Statuses at or above this one are server errors. */
  INTERNAL_SERVER_ERROR: 500,
} as const;

/** How the start card's rank is written on cards, in notes, and in the morph dialog. */
export const START_CARD_RANK_LABEL = "S";
