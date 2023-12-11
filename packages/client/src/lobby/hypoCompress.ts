import type { Rank, SuitIndex } from "@hanabi/data";
import {
  DEFAULT_PLAYER_NAMES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  getVariant,
  getVariantByID,
} from "@hanabi/data";
import { assertDefined, parseIntSafe } from "@hanabi/utils";
import { isEqual } from "lodash";

interface DeckCard {
  suitIndex: SuitIndex;
  rank: Rank;
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
  players: readonly string[];
  deck: readonly DeckCard[];
  actions: readonly Action[];
  options: Options;
  characters: readonly string[];
  id: number;
  notes: readonly string[];
  seed: string;
}

const BASE62 = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Compresses a string representing a `GameJSON` object. Returns undefined if the compression fails.
 *
 * The resulting string is composed of three substrings separated by commas:
 * - The first substring represents the number of players and the deck.
 * - The second substring represents the actions.
 * - The third substring is the ID of the variant.
 *
 * Finally, hyphens are added to the string to make URL text wrap when posting.
 */
export function shrink(JSONString: string): string | undefined {
  let gameDataJSON: GameJSON;
  try {
    gameDataJSON = JSON.parse(JSONString) as GameJSON;
  } catch {
    return undefined;
  }

  const compressed = gameJSONCompress(gameDataJSON);
  if (compressed === undefined) {
    return undefined;
  }

  // Check if compression succeeded.
  const decompressed = expand(compressed);
  if (decompressed === undefined) {
    return undefined;
  }
  try {
    const decompressedJSON = JSON.parse(decompressed) as GameJSON;
    if (!isEqual(gameDataJSON, decompressedJSON)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  return compressed;
}

/** Decompresses a string into a `GameJSON` object. Returns undefined if decompression fails. */
export function expand(data: string): string | undefined {
  // Remove all hyphens from URL.
  const normal = data.replaceAll("-", "");

  // The compressed string is composed of 3 substrings separated by commas.
  const [playersAndDeck, actionsString, variantIDString] = normal.split(",", 3);
  assertDefined(
    playersAndDeck,
    "Failed to parse the players and deck from the compress hypothetical string.",
  );
  assertDefined(
    actionsString,
    "Failed to parse the actions from the compress hypothetical string.",
  );
  assertDefined(
    variantIDString,
    "Failed to parse the variant ID from the compress hypothetical string.",
  );

  const numberPlayersString = playersAndDeck.charAt(0);
  const numPlayers = parseIntSafe(numberPlayersString);
  if (numPlayers === undefined) {
    return undefined;
  }

  const players = getPlayers(numPlayers);
  if (players.length === 0) {
    return undefined;
  }

  const deckString = playersAndDeck.slice(1);
  const deck = decompressDeck(deckString);
  if (deck === undefined) {
    return undefined;
  }

  const actions = decompressActions(actionsString);
  if (actions === undefined) {
    return undefined;
  }

  const variantID = parseIntSafe(variantIDString);
  if (variantID === undefined) {
    return undefined;
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

/** Compresses a `GameJSON` object into a string. Returns undefined if decompression fails. */
function gameJSONCompress(data: GameJSON): string | undefined {
  let out = "";

  // Number of players
  const numberOfPlayers = data.players.length;
  if (numberOfPlayers < MIN_PLAYERS || numberOfPlayers > MAX_PLAYERS) {
    return undefined;
  }
  out += `${data.players.length}`;

  // Deck
  const deck = compressDeck(data.deck);
  if (deck === undefined) {
    return undefined;
  }
  out += `${deck},`;

  // Actions
  const actions = compressActions(data.actions);
  out += `${actions},`;

  // Variant ID
  if (data.options.variant === undefined) {
    return undefined;
  }

  try {
    const variant = getVariant(data.options.variant);
    out += `${variant.id}`;
  } catch {
    return undefined;
  }

  // Add hyphens every 20 characters for URL posting (hyphens make the text wrap).
  out = out.match(/.{1,20}/g)!.join("-");

  return out;
}

/**
 * Compresses an array of `DeckCard` into a string. The first two characters of the string are
 * numbers containing the min and max values of `DeckCard.rank`. The rest of the string contains
 * series of strings one characters long, each representing a `DeckCard`.
 */
function compressDeck(deck: readonly DeckCard[]): string | undefined {
  const rankRange = getRankMinMax(deck);
  if (!isMinMaxValid(rankRange)) {
    return undefined;
  }

  let out = `${rankRange.min}${rankRange.max}`;
  for (const card of deck) {
    out += deckCardToString(card, rankRange);
  }

  return out;
}

/**
 * Decompresses a string into an array of `DeckCard`. The first two characters of the string must be
 * numbers containing the min and max values of `DeckCard.rank`. The rest of the string must be
 * composed of series of strings one character long, each representing a `DeckCard`.
 */
function decompressDeck(src: string): readonly DeckCard[] | undefined {
  const deck: DeckCard[] = [];

  const minVal = src.charAt(0);
  const min = parseIntSafe(minVal);
  if (min === undefined) {
    return undefined;
  }

  const maxVal = src.charAt(1);
  const max = parseIntSafe(maxVal);
  if (max === undefined) {
    return undefined;
  }

  const rankRange: MinMax = {
    min,
    max,
  };
  if (!isMinMaxValid(rankRange)) {
    return undefined;
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
 * Converts a `DeckCard` into a string. The returned string is one characters long, representing
 * `DeckCard.suitIndex` and `DeckCard.rank`.
 */
function deckCardToString(card: DeckCard, rankRange: MinMax): string {
  const r = rankRange.max - rankRange.min + 1;
  const index = card.suitIndex * r + (card.rank - rankRange.min);
  return BASE62.charAt(index);
}

/**
 * Converts a compressed string into a `DeckCard`. The string must be one character long,
 * representing `DeckCard.suitIndex` and `DeckCard.rank`.
 */
function stringToDeckCard(src: string, rankRange: MinMax): DeckCard {
  const r = rankRange.max - rankRange.min + 1;
  const index = BASE62.indexOf(src);
  const rank = (index % r) + 1;
  const suitIndex = Math.floor((index - rank + 1) / r);

  return {
    suitIndex: suitIndex as SuitIndex,
    rank: rank as Rank,
  };
}

/**
 * Compresses an array of `Action` into a string. The first two characters of the string are numbers
 * containing the min and max values of `Action.type`. The rest of the string contains series of
 * strings two characters long, each representing an `Action`.
 */
function compressActions(actions: readonly Action[]): string {
  // Find min/max values of Action.type.
  const typeRange = getTypeMinMax(actions);
  if (!isMinMaxValid(typeRange)) {
    // Empty actions still require min/max values.
    return "00";
  }

  const actionStrings = actions.map((action) =>
    actionToString(action, typeRange),
  );
  return `${typeRange.min}${typeRange.max}${actionStrings.join("")}`;
}

/**
 * Decompresses a string into an array of `Action`. The first two characters of the string must be
 * numbers containing the min and max values of `Action.type`. The rest of the string must be
 * composed of series of strings two characters long, each representing an `Action`.
 */
function decompressActions(src: string): readonly Action[] | undefined {
  const actions: Action[] = [];

  const minVal = src.charAt(0);
  const min = parseIntSafe(minVal);
  if (min === undefined) {
    return undefined;
  }

  const maxVal = src.charAt(1);
  const max = parseIntSafe(maxVal);
  if (max === undefined) {
    return undefined;
  }

  const typeRange: MinMax = {
    min,
    max,
  };
  if (!isMinMaxValid(typeRange)) {
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
 * Converts an `Action` into a string. The returned string is two characters long, the first one
 * representing `Action.type` and `Action.value` and the second representing the `Action.target`.
 */
function actionToString(action: Action, typeRange: MinMax): string {
  const r = typeRange.max - typeRange.min + 1;
  const val = action.value === undefined ? 0 : action.value + 1;
  const index = val * r + action.type - typeRange.min;
  const char = BASE62.charAt(index);
  return char + BASE62.charAt(action.target);
}

/**
 * Converts a compressed string into an `Action`. The string must be two characters long, the first
 * one representing `Action.type` and `Action.value` and the second representing the
 * `Action.target`.
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

/** Returns a string array of hypothetical players (Alice, Bob, etc). */
function getPlayers(size: number): readonly string[] {
  if (size < MIN_PLAYERS || size > MAX_PLAYERS) {
    return [];
  }
  return DEFAULT_PLAYER_NAMES.slice(0, size);
}

/**
 * Creates a `MinMax` object, containing the minimum and maximum values of `DeckCard.rank` found in
 * an array of `DeckCard`.
 */
function getRankMinMax(deck: readonly DeckCard[]): MinMax {
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
 * Creates a `MinMax` object, containing the minimum and maximum values of `Action.type` found in an
 * array of `Action`.
 */
function getTypeMinMax(actions: readonly Action[]): MinMax {
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

function isMinMaxValid(range: MinMax): boolean {
  return range.min >= 0 && range.min <= range.max;
}
