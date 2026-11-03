import { CHAT_EMOTES } from "@hanabi-live/data";

export const emoteImages: ReadonlyMap<string, string> = new Map(
  Object.entries(CHAT_EMOTES).flatMap(([category, names]) =>
    names.map<[string, string]>((name) => [
      name,
      `/public/img/emotes/${category}/${encodeURIComponent(name)}.png`,
    ]),
  ),
);
