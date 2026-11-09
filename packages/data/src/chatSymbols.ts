export { default as CHAT_EMOJIS } from "./json/emojis.json";
export { default as CHAT_EMOTES } from "./json/emotes.json";

/**
 * BetterTTV emotes whose codes contain a colon, mapped to their file names in the "betterttv" emote
 * directory. Chat matches these separately, so they are not in "emotes.json".
 */
export const CHAT_COLON_EMOTES = {
  ":tf:": "tf",
  "D:": "D",
} as const;
