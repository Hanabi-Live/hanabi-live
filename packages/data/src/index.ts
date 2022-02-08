import emojisJSON from "./json/emojis.json";
import emotesJSON from "./json/emotes.json";

const emojis = emojisJSON;
const emotes = emotesJSON;

export * from "./abbreviations";
export * from "./constants";
export * from "./gameData";
export * from "./hypoPlayerNames";
export * from "./types/Character";
export * from "./types/Color";
export * from "./types/Suit";
export * from "./types/Variant";
export * from "./utils";
export * from "./variants";
export * from "./version";
export { emojis, emotes };
