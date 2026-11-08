import { RecordedActionType, replayGameSchema } from "@hanabi-live/data";
import {
  DEFAULT_PLAYER_NAMES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  getVariant,
  getVariantByID,
} from "@hanabi-live/game";
import { assertDefined, parseIntSafe } from "complete-common";
import { isEqual } from "lodash";
import * as z from "zod";

/** A game in the replay format, generated from the server's contract. */
export type GameJSON = z.input<typeof replayGameSchema>;
type DeckCard = GameJSON["deck"][number];
type Action = GameJSON["actions"][number];

interface MinMax {
  min: number;
  max: number;
}

/**
 * The number of comma-separated parts of a compressed game: the players and deck, the actions, and
 * the variant ID. An optional seed follows them.
 */
const COMPRESSED_PARTS = 3;

/** How often a hyphen is inserted so that a long compressed game wraps when it is posted. */
const HYPHEN_INTERVAL = 20;

const BASE62 = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Compresses a string representing a `GameJSON` object. Returns undefined if the compression fails.
 *
 * The resulting string is composed of four substrings separated by commas:
 * - The first substring represents the number of players and the deck.
 * - The second substring represents the actions.
 * - The third substring is the ID of the variant.
 * - The fourth substring is the seed (empty for an unspecified seed).
 *
 * Hyphens are added to the first three substrings to make URL text wrap when posting. The seed is
 * appended verbatim so that meaningful seed hyphens are preserved.
 */
export function shrink(JSONString: string): string | undefined {
  const gameDataJSON = parseGameJSON(JSONString);
  if (gameDataJSON === undefined) {
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
  if (!isEqual(gameDataJSON, parseGameJSON(decompressed))) {
    return undefined;
  }

  return compressed;
}

function parseGameJSON(JSONString: string) {
  try {
    const result = replayGameSchema.safeParse(JSON.parse(JSONString));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** Decompresses a string into a `GameJSON` object. Returns undefined if decompression fails. */
export function expand(data: string): string | undefined {
  const parts = data.split(",");
  const seed = parts[COMPRESSED_PARTS] ?? "";
  if (
    parts.length < COMPRESSED_PARTS
    || parts.length > COMPRESSED_PARTS + 1
    || !/^[\d\-A-Za-z]*$/u.test(seed)
  ) {
    return undefined;
  }
  // Remove wrapping hyphens from the compressed data, never from the seed.
  const normal = parts.slice(0, COMPRESSED_PARTS).join(",").replaceAll("-", "");

  const [playersAndDeck, actionsString, variantIDString] = normal.split(
    ",",
    COMPRESSED_PARTS,
  );
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
    players: [...players],
    deck: [...deck],
    actions: [...actions],
    options: {
      variant: variant.name,
    },
    characters: [],
    id: 0,
    notes: [],
    seed,
  };

  return JSON.stringify(original);
}

/** Compresses a `GameJSON` object into a string. Returns undefined if decompression fails. */
function gameJSONCompress(data: GameJSON): string | undefined {
  const { seed } = data;
  if (!/^[\d\-A-Za-z]*$/u.test(seed)) {
    return undefined;
  }
  let out = "";

  // Number of players
  const numberOfPlayers = data.players.length;
  if (numberOfPlayers < MIN_PLAYERS || numberOfPlayers > MAX_PLAYERS) {
    return undefined;
  }
  out += data.players.length.toString();

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
  const variantName = data.options?.variant;
  if (variantName === undefined) {
    return undefined;
  }

  try {
    const variant = getVariant(variantName);
    out += variant.id.toString();
  } catch {
    return undefined;
  }

  // Add hyphens for URL posting (hyphens make the text wrap).
  out = out.match(new RegExp(`.{1,${HYPHEN_INTERVAL}}`, "gu"))!.join("-");

  return `${out},${seed}`;
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
    suitIndex,
    rank,
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
    if (action === undefined) {
      return undefined;
    }
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
function stringToAction(src: string, typeRange: MinMax): Action | undefined {
  const r = typeRange.max - typeRange.min + 1;
  const index = BASE62.indexOf(src.charAt(0));
  let type = index % r;
  const val = Math.floor((index - type) / r);
  type += typeRange.min;
  const target = BASE62.indexOf(src.charAt(1));
  const recordedType = z.enum(RecordedActionType).safeParse(type);
  if (!recordedType.success) {
    return undefined;
  }

  return {
    type: recordedType.data,
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
