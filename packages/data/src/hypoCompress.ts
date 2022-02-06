import { isEqual } from "lodash";
import { HYPO_PLAYER_NAMES } from "./hypoPlayerNames";
import variantsJSON from "./json/variants.json";
import { VariantJSON } from "./types/VariantJSON";

type DeckCard = {
  suitIndex: number;
  rank: number;
};
type Action = {
  type: number;
  target: number;
  value?: number;
};
type Options = {
  variant: string | undefined;
};

export type GameJSON = {
  players: string[];
  deck: DeckCard[];
  actions: Action[];
  options: Options;
  characters: string[];
  id: number;
  notes: [];
  seed: string;
};
type MinMax = {
  min: number;
  max: number;
};

const BASE62 = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const variantsJSONArray = Array.from(variantsJSON) as VariantJSON[];

/**
 * Compresses a string representing a GameJSON object.
 * Returns empty string if the compression fails.
 *
 * The resulting string is composed of three substrings separated by comma.
 * The first substring represents the number of players and the deck.
 * The second substring represents the actions.
 * The third substring is the ID of the variant.
 *
 * Finally hyphens are added to the string to make URL text wrap when posting.
 *
 * @param JSONString A string representing a hypo JSON
 */
export function shrink(JSONString: string): string {
  const gameDataJSON = JSON.parse(JSONString) as GameJSON;
  const compressed = gameJSONCompress(gameDataJSON);

  // Check if compression succeeded
  const decompressed = gameJSONDecompress(compressed);
  const decompressedJSON = JSON.parse(decompressed) as GameJSON;

  if (!isEqual(gameDataJSON, decompressedJSON)) {
    return "";
  }

  return compressed;
}

/**
 * Decompresses a string into a JSON string, representing a hypo.
 * Returns empty string if the decompression fails.
 *
 * @param compressedJSON A string representing a compressed hypo JSON
 */
export function expand(compressedJSON: string): string {
  return gameJSONDecompress(compressedJSON);
}

/**
 * Compresses a GameJSON object into a string.
 * Returns empty string if decompression fails.
 *
 * @param data The GameJSON object
 */
function gameJSONCompress(data: GameJSON): string {
  let out = "";

  // number of players
  const numberOfPlayers = data.players.length;
  if (numberOfPlayers < 2 || numberOfPlayers > 6) {
    return "";
  }
  out += `${data.players.length}`;

  // deck
  const [deck, okDeck] = compressDeck(data.deck);
  if (!okDeck) {
    return "";
  }
  out += `${deck},`;

  // actions
  const [actions, okActions] = compressActions(data.actions);
  if (!okActions) {
    return "";
  }
  out += `${actions},`;

  // variant id
  const variant = variantsJSONArray.find(
    (v) => v.name === data.options.variant,
  );
  if (variant === undefined) {
    return "";
  }
  out += `${variant.id}`;

  // add hyphens every 20 characters for URL posting (hyphens make the text wrap)
  out = out.match(/.{1,20}/g)!.join("-");

  return out;
}

/**
 * Decompresses a string into a GameJSON object.
 * Returns empty string if decompression fails.
 *
 * @param data The compressed string
 */
function gameJSONDecompress(data: string): string {
  // remove all hyphens from URL
  const normal = data.replace(/-/g, "");

  // The compressed string is composed of 3 substrings, separated by comma.
  const [deckString, actionsString, variantString] = [...normal.split(",", 3)];
  const numPlayers = parseInt(deckString.charAt(0), 10);

  const players = getPlayers(numPlayers);
  if (players.length === 0) {
    return "";
  }

  const [deck, okDeck] = decompressDeck(deckString.substring(1));
  if (!okDeck) {
    return "";
  }

  const [actions, okActions] = decompressActions(actionsString);
  if (!okActions) {
    return "";
  }

  const variant = variantsJSONArray.find(
    (v) => v.id.toString() === variantString,
  )?.name;
  if (variant === undefined) {
    return "";
  }

  const original: GameJSON = {
    players,
    deck,
    actions,
    options: {
      variant,
    },
    characters: [],
    id: 0,
    notes: [],
    seed: "",
  };

  return JSON.stringify(original);
}

/**
 * Compresses an array of DeckCard into a string.
 * The first two characters of the string are numbers containing the min and max values of DeckCard.rank.
 * The rest of the string contains series of strings one characters long, each representing a DeckCard.
 *
 * @param deck The array of DeckCard
 */
function compressDeck(deck: DeckCard[]): [string, boolean] {
  const range = getRankMinMax(deck);
  if (isMinMaxInvalid(range)) {
    return ["", false];
  }

  let out = `${range.min}${range.max}`;
  deck.forEach((card) => {
    out += deckCardToString(card, range);
  });

  return [out, true];
}

/**
 * Decompresses a string into an array of DeckCard.
 * The first two characters of the string must be numbers containing the min and max values of DeckCard.rank.
 * The rest of the string must be composed of series of strings one character long, each representing a DeckCard.
 *
 * @param src The compressed string
 */
function decompressDeck(src: string): [DeckCard[], boolean] {
  const deck: DeckCard[] = [];
  const range: MinMax = {
    min: parseInt(src.charAt(0), 10),
    max: parseInt(src.charAt(1), 10),
  };
  if (isMinMaxInvalid(range)) {
    return [[], false];
  }

  let s = 2;
  while (s < src.length) {
    const compressedDeck = src.charAt(s);
    const deckCard = stringToDeckCard(compressedDeck, range);
    deck.push(deckCard);
    s += 1;
  }
  return [deck, true];
}

/**
 * Converts a DeckCard into a string.
 * The returned string is one characters long,
 * representing DeckCard.suitIndex and DeckCard.rank.
 *
 * @param card The DeckCard object
 * @param range The validated min and max values of DeckCard.rank
 */
function deckCardToString(card: DeckCard, range: MinMax): string {
  const r = range.max - range.min + 1;
  const index = card.suitIndex * r + (card.rank - range.min);
  return BASE62.charAt(index);
}

/**
 * Converts a compressed string into a DeckCard.
 * The string must be one character long,
 * representing DeckCard.suitIndex and DeckCard.rank.
 *
 * @param src A compressed single character string representing a DeckCard
 * @param range The validated min and max values of DeckCard.rank
 */
function stringToDeckCard(src: string, range: MinMax): DeckCard {
  const r = range.max - range.min + 1;
  const index = BASE62.indexOf(src);
  const rank = (index % r) + 1;
  const suitIndex = Math.floor((index - rank + 1) / r);
  return <DeckCard>{ suitIndex, rank };
}

/**
 * Compresses an array of Action into a string.
 * The first two characters of the string are numbers containing the min and max values of Action.type.
 * The rest of the string contains series of strings two characters long, each representing an Action.
 *
 * @param actions The array of Action
 */
function compressActions(actions: Action[]): [string, boolean] {
  // Find min/max values of Action.type
  const range = getTypeMinMax(actions);
  if (isMinMaxInvalid(range)) {
    return ["", false];
  }

  let out = `${range.min}${range.max}`;
  actions.forEach((action) => {
    out += actionToString(action, range);
  });

  return [out, true];
}

/**
 * Decompresses a string into an array of action.
 * The first two characters of the string must be numbers containing the min and max values of Action.type.
 * The rest of the string must be composed of series of strings two characters long, each representing an Action.
 *
 * @param src The compressed string
 */
function decompressActions(src: string): [Action[], boolean] {
  const actions: Action[] = [];
  const range: MinMax = {
    min: parseInt(src.charAt(0), 10),
    max: parseInt(src.charAt(1), 10),
  };
  if (isMinMaxInvalid(range)) {
    return [[], false];
  }

  let s = 2;
  while (s < src.length) {
    const compressedAction = src.substring(s, s + 2);
    const action = stringToAction(compressedAction, range);
    actions.push(action);
    s += 2;
  }

  return [actions, true];
}

/**
 * Converts an Action into a string.
 * The returned string is two characters long,
 * the first one representing Action.type and Action.value
 * and the second representing the Action.target.
 *
 * @param action The Action object
 * @param range The validated min and max values of Action.type
 */
function actionToString(action: Action, range: MinMax): string {
  const r = range.max - range.min + 1;
  const val = action.value === undefined ? 0 : action.value + 1;
  const index = val * r + (action.type - range.min);
  const char = BASE62.charAt(index);
  return char + BASE62.charAt(action.target);
}

/**
 * Converts a compressed string into an Action.
 * The string must be two characters long,
 * the first one representing Action.type and Action.value
 * and the second representing the Action.target.
 *
 * @param src A compressed two-characters string representing an Action
 * @param range The validated min and max values of Action.type
 */
function stringToAction(src: string, range: MinMax): Action {
  const r = range.max - range.min + 1;
  const index = BASE62.indexOf(src.charAt(0));
  const type = index % r;
  const val = Math.floor((index - type + 1) / r);
  const target = BASE62.indexOf(src.charAt(1));

  return <Action>{
    type,
    target,
    value: val === 0 ? undefined : val - 1,
  };
}

/**
 * Returns a string array of hypo players (Alice, Bob, etc).
 *
 * @param size The number of players
 */
function getPlayers(size: number): string[] {
  if (size < 2 || size > HYPO_PLAYER_NAMES.length) {
    return [];
  }
  return HYPO_PLAYER_NAMES.slice(0, size);
}

/**
 * Creates a MinMax object, containing the min and max values
 * of DeckCard.rank found in an array of DeckCard
 *
 * @param deck The array of DeckCard[] to search
 */
function getRankMinMax(deck: DeckCard[]): MinMax {
  const range: MinMax = {
    min: -1,
    max: -1,
  };
  deck.forEach((card) => {
    range.min = range.min === -1 ? card.rank : Math.min(range.min, card.rank);
    range.max = range.max === -1 ? card.rank : Math.max(range.max, card.rank);
  });

  return range;
}

/**
 * Creates a MinMax object, containing the min and max values
 * of Action.type found in an array of Action
 *
 * @param actions The array of Action[] to search
 */
function getTypeMinMax(actions: Action[]): MinMax {
  const range: MinMax = {
    min: -1,
    max: -1,
  };
  actions.forEach((action) => {
    range.min =
      range.min === -1 ? action.type : Math.min(range.min, action.type);
    range.max =
      range.max === -1 ? action.type : Math.max(range.max, action.type);
  });

  return range;
}

/**
 * Ensures that Minmax.min is non negative and smaller or equal to Minmax.max
 *
 * @param range The MinMax object
 */
function isMinMaxInvalid(range: MinMax): boolean {
  return range.min < 0 || range.min > range.max;
}
