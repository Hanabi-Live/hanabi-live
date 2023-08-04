import {
  getVariant,
  getVariantByID,
  HYPO_PLAYER_NAMES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  parseIntSafe,
} from "@hanabi/data";
import { isEqual } from "lodash";

interface DeckCard {
  suitIndex: number;
  rank: number;
}

interface Action {
  type: number;
  target: number;
  value?: number;
}

interface Options {
  variant: string | undefined;
}

interface MinMax {
  min: number;
  max: number;
}

export interface GameJSON {
  players: string[];
  deck: DeckCard[];
  actions: Action[];
  options: Options;
  characters: string[];
  id: number;
  notes: [];
  seed: string;
}

const BASE62 = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Compresses a string representing a GameJSON object. Returns null if the compression fails.
 *
 * The resulting string is composed of three substrings separated by commas:
 * - The first substring represents the number of players and the deck.
 * - The second substring represents the actions.
 * - The third substring is the ID of the variant.
 *
 * Finally hyphens are added to the string to make URL text wrap when posting.
 *
 * @param JSONString A string representing a hypothetical JSON.
 */
export function shrink(JSONString: string): string | null {
  let gameDataJSON: GameJSON;
  try {
    gameDataJSON = JSON.parse(JSONString) as GameJSON;
  } catch {
    return null;
  }

  const compressed = gameJSONCompress(gameDataJSON);
  if (compressed === null) {
    return null;
  }

  // Check if compression succeeded.
  const decompressed = expand(compressed);
  if (decompressed === null) {
    return null;
  }
  try {
    const decompressedJSON = JSON.parse(decompressed) as GameJSON;
    if (!isEqual(gameDataJSON, decompressedJSON)) {
      return null;
    }
  } catch {
    return null;
  }

  return compressed;
}

/**
 * Decompresses a string into a GameJSON object. Returns null if decompression fails.
 *
 * @param data The compressed string.
 */
export function expand(data: string): string | null {
  // Remove all hyphens from URL.
  const normal = data.replaceAll("-", "");

  // The compressed string is composed of 3 substrings separated by commas.
  const [playersAndDeck, actionsString, variantIDString] = normal.split(",", 3);
  const numberPlayersString = playersAndDeck!.charAt(0);
  const numPlayers = parseIntSafe(numberPlayersString);

  const players = getPlayers(numPlayers);
  if (players.length === 0) {
    return null;
  }

  const deckString = playersAndDeck!.slice(1);
  const deck = decompressDeck(deckString);
  if (deck === null) {
    return null;
  }

  const actions = decompressActions(actionsString!);

  const variantID = parseIntSafe(variantIDString!);
  if (Number.isNaN(variantID)) {
    return null;
  }
  const variant = getVariantByID(variantID);

  const original: GameJSON = {
    players,
    deck,
    actions,
    options: {
      variant: variant.name,
    },
    characters: [],
    id: 0,
    notes: [],
    seed: "",
  };

  return JSON.stringify(original);
}

/**
 * Compresses a GameJSON object into a string. Returns null if decompression fails.
 *
 * @param data The GameJSON object.
 */
function gameJSONCompress(data: GameJSON): string | null {
  let out = "";

  // Number of players
  const numberOfPlayers = data.players.length;
  if (numberOfPlayers < MIN_PLAYERS || numberOfPlayers > MAX_PLAYERS) {
    return null;
  }
  out += `${data.players.length}`;

  // Deck
  const deck = compressDeck(data.deck);
  if (deck === null) {
    return null;
  }
  out += `${deck},`;

  // Actions
  const actions = compressActions(data.actions);
  out += `${actions},`;

  // Variant ID
  if (data.options.variant === undefined) {
    return null;
  }

  try {
    const variant = getVariant(data.options.variant);
    out += `${variant.id}`;
  } catch {
    return null;
  }

  // Add hyphens every 20 characters for URL posting (hyphens make the text wrap).
  out = out.match(/.{1,20}/g)!.join("-");

  return out;
}

/**
 * Compresses an array of DeckCard into a string. The first two characters of the string are numbers
 * containing the min and max values of DeckCard.rank. The rest of the string contains series of
 * strings one characters long, each representing a DeckCard.
 *
 * @param deck The array of DeckCard.
 */
function compressDeck(deck: DeckCard[]): string | null {
  const rankRange = getRankMinMax(deck);
  if (isMinMaxInvalid(rankRange)) {
    return null;
  }

  let out = `${rankRange.min}${rankRange.max}`;
  for (const card of deck) {
    out += deckCardToString(card, rankRange);
  }

  return out;
}

/**
 * Decompresses a string into an array of DeckCard. The first two characters of the string must be
 * numbers containing the min and max values of DeckCard.rank. The rest of the string must be
 * composed of series of strings one character long, each representing a DeckCard.
 *
 * @param src The compressed string.
 */
function decompressDeck(src: string): DeckCard[] | null {
  const deck: DeckCard[] = [];
  const minVal = src.charAt(0);
  const maxVal = src.charAt(1);
  const rankRange: MinMax = {
    min: parseIntSafe(minVal),
    max: parseIntSafe(maxVal),
  };
  if (isMinMaxInvalid(rankRange)) {
    return null;
  }

  let s = 2;
  while (s < src.length) {
    const compressedDeckCard = src.charAt(s);
    const deckCard = stringToDeckCard(compressedDeckCard, rankRange);
    deck.push(deckCard);
    s++;
  }
  return deck;
}

/**
 * Converts a DeckCard into a string. The returned string is one characters long, representing
 * DeckCard.suitIndex and DeckCard.rank.
 *
 * @param card The DeckCard object.
 * @param rankRange The validated min and max values of DeckCard.rank.
 */
function deckCardToString(card: DeckCard, rankRange: MinMax): string {
  const r = rankRange.max - rankRange.min + 1;
  const index = card.suitIndex * r + (card.rank - rankRange.min);
  return BASE62.charAt(index);
}

/**
 * Converts a compressed string into a DeckCard. The string must be one character long, representing
 * DeckCard.suitIndex and DeckCard.rank.
 *
 * @param src A compressed single character string representing a DeckCard.
 * @param rankRange The validated min and max values of DeckCard.rank.
 */
function stringToDeckCard(src: string, rankRange: MinMax): DeckCard {
  const r = rankRange.max - rankRange.min + 1;
  const index = BASE62.indexOf(src);
  const rank = (index % r) + 1;
  const suitIndex = Math.floor((index - rank + 1) / r);
  return { suitIndex, rank };
}

/**
 * Compresses an array of Action into a string. The first two characters of the string are numbers
 * containing the min and max values of Action.type. The rest of the string contains series of
 * strings two characters long, each representing an Action.
 *
 * @param actions The array of Action.
 */
function compressActions(actions: Action[]): string {
  // Find min/max values of Action.type.
  const typeRange = getTypeMinMax(actions);
  if (isMinMaxInvalid(typeRange)) {
    // Empty actions still require min/max values.
    return "00";
  }

  const actionStrings = actions.map((action) =>
    actionToString(action, typeRange),
  );
  return `${typeRange.min}${typeRange.max}${actionStrings.join("")}`;
}

/**
 * Decompresses a string into an array of action. The first two characters of the string must be
 * numbers containing the min and max values of Action.type. The rest of the string must be composed
 * of series of strings two characters long, each representing an Action.
 *
 * @param src The compressed string.
 */
function decompressActions(src: string): Action[] {
  const actions: Action[] = [];
  const minVal = src.charAt(0);
  const maxVal = src.charAt(1);
  const typeRange: MinMax = {
    min: parseIntSafe(minVal),
    max: parseIntSafe(maxVal),
  };
  if (isMinMaxInvalid(typeRange)) {
    return [];
  }

  let s = 2;
  while (s < src.length) {
    const compressedAction = src.slice(s, s + 2);
    const action = stringToAction(compressedAction, typeRange);
    actions.push(action);
    s += 2;
  }

  return actions;
}

/**
 * Converts an Action into a string. The returned string is two characters long, the first one
 * representing Action.type and Action.value and the second representing the Action.target.
 *
 * @param action The Action object.
 * @param typeRange The validated min and max values of Action.type.
 */
function actionToString(action: Action, typeRange: MinMax): string {
  const r = typeRange.max - typeRange.min + 1;
  const val = action.value === undefined ? 0 : action.value + 1;
  const index = val * r + action.type - typeRange.min;
  const char = BASE62.charAt(index);
  return char + BASE62.charAt(action.target);
}

/**
 * Converts a compressed string into an Action. The string must be two characters long, the first
 * one representing Action.type and Action.value and the second representing the Action.target.
 *
 * @param src A compressed two-characters string representing an Action.
 * @param typeRange The validated min and max values of Action.type.
 */
function stringToAction(src: string, typeRange: MinMax): Action {
  const r = typeRange.max - typeRange.min + 1;
  const index = BASE62.indexOf(src.charAt(0));
  let type = index % r;
  const val = Math.floor((index - type) / r);
  type += typeRange.min;
  const target = BASE62.indexOf(src.charAt(1));

  return {
    type,
    target,
    value: val === 0 ? undefined : val - 1,
  };
}

/**
 * Returns a string array of hypothetical players (Alice, Bob, etc).
 *
 * @param size The number of players.
 */
function getPlayers(size: number): string[] {
  if (size < MIN_PLAYERS || size > MAX_PLAYERS) {
    return [];
  }
  return HYPO_PLAYER_NAMES.slice(0, size);
}

/**
 * Creates a MinMax object, containing the min and max values of DeckCard.rank found in an array of
 * DeckCard.
 */
function getRankMinMax(deck: DeckCard[]): MinMax {
  const range: MinMax = {
    min: -1,
    max: -1,
  };
  for (const card of deck) {
    range.min = range.min === -1 ? card.rank : Math.min(range.min, card.rank);
    range.max = range.max === -1 ? card.rank : Math.max(range.max, card.rank);
  }

  return range;
}

/**
 * Creates a MinMax object, containing the min and max values of Action.type found in an array of
 * Action.
 */
function getTypeMinMax(actions: Action[]): MinMax {
  const range: MinMax = {
    min: -1,
    max: -1,
  };
  for (const action of actions) {
    range.min =
      range.min === -1 ? action.type : Math.min(range.min, action.type);
    range.max =
      range.max === -1 ? action.type : Math.max(range.max, action.type);
  }

  return range;
}

/** Ensures that Minmax.min is non negative and smaller or equal to Minmax.max. */
function isMinMaxInvalid(range: MinMax): boolean {
  return range.min < 0 || range.min > range.max;
}
