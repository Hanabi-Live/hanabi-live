// Time constants

/** How long an element takes to fade, grow, or shrink in or out, in milliseconds. */
export const FADE_TIME_MS = 350;

/** The opacity of a lobby element that is disabled or inactive. */
export const DIMMED_OPACITY = 0.3;

export const TYPED_HISTORY_MAX_LENGTH = 250;

/** Where each level of the H-Group convention guide is, followed by the level number. */
export const H_GROUP_LEVEL_URL_PREFIX = "https://hanabi.github.io/level-";

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

/** The `localStorage` keys that remember lobby and chat inputs between visits. */
export const LOCAL_STORAGE_KEY = {
  CHAT_WINDOW_WIDTH: "chatWindowWidth",
  CHAT_WINDOW_HEIGHT: "chatWindowHeight",
  CHAT_WINDOW_RIGHT: "chatWindowRight",
  CHAT_WINDOW_TOP: "chatWindowTop",
  CREATE_TABLE_NAME: "createTableName",
  CREATE_TABLE_PASSWORD: "createTablePassword",
  JOIN_TABLE_PASSWORD: "joinTablePassword",
  TYPED_CHAT_HISTORY: "typedChatHistory",
  WATCH_REPLAY_ID: "watchReplayId",
  WATCH_REPLAY_JSON: "watchReplayJson",
  WATCH_REPLAY_SOURCE: "watchReplaySource",
  WATCH_REPLAY_SPOILER_FREE: "watchReplaySpoilerFree",
  WATCH_REPLAY_VISIBILITY: "watchReplayVisibility",
} as const;

/** The site paths that the client navigates to, links to, or reads from the address bar. */
export const PATH = {
  LOBBY: "/lobby",
  CREATE_TABLE: "/create-table",
  PRE_GAME: "/pre-game",
  GAME: "/game",
  REPLAY: "/replay",
  SHARED_REPLAY: "/shared-replay",
  HISTORY: "/history",
  SEED: "/seed",
} as const;

/** The lobby address hash of the history screen. */
export const HISTORY_HASH = "#history";
