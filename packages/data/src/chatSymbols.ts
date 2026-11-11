import CHAT_EMOJI_GROUPS from "./json/emojis.json";

export { default as CHAT_EMOJI_GROUPS } from "./json/emojis.json";
export { default as CHAT_EMOTES } from "./json/emotes.json";

/** Maps the name of each emoji, from every group, to the emoji. */
export const CHAT_EMOJIS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.values(CHAT_EMOJI_GROUPS).flatMap((group) => Object.entries(group)),
);

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
