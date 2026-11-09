export { default as CHAT_EMOJIS } from "./json/emojis.json";
export { default as CHAT_EMOTES } from "./json/emotes.json";

/**
 * Emotes that chat matches separately, since "\b" cannot match next to the symbols in their codes,
 * mapped to their image paths in the emote directory (without the extension). They are not in
 * "emotes.json".
 */
export const CHAT_SPECIAL_EMOTES = {
  "<3": "twitch/3",
  ":tf:": "betterttv/tf",
  "D:": "betterttv/D",
} as const;
