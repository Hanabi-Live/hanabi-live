import emojisJSON from "./json/emojis.json";
import emotesJSON from "./json/emotes.json";

const emojis = emojisJSON;
const emotes = emotesJSON;
export { emojis, emotes };

export * from "./abbreviations";
export * from "./constants";
export * from "./gameData";
export * from "./interfaces/Character";
export * from "./interfaces/Color";
export * from "./interfaces/Suit";
export * from "./interfaces/Variant";
export * from "./types/Rank";
export * from "./version";
