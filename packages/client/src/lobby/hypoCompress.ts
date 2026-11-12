import { replayGameSchema } from "@hanabi-live/data";
import type { EndCondition } from "@hanabi-live/game";
import {
  DEFAULT_PLAYER_NAMES,
  endConditionSchema,
  getVariant,
  getVariantById,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "@hanabi-live/game";
import { assertDefined, parseIntSafe } from "complete-common";
import { isEqual } from "lodash";
import * as z from "zod";

/** A game in the replay format, generated from the server's contract. */
export type GameJson = z.input<typeof replayGameSchema>;
/** A deck card as parsing gives it, with the suit that a missing one defaults to. */
type DeckCard = NonNullable<z.output<typeof replayGameSchema>["deck"]>[number];
type Action = NonNullable<GameJson["actions"]>[number];

/** The type of an action in a compressed game. */
enum CompactType {
  Play,
  Discard,
  ColorClue,
  RankClue,
  GameOver,
}

/**
 * An action with numbers for its type and value, which is the form that a compressed game holds.
 */
interface CompactAction {
  readonly type: CompactType;
  readonly target: number | undefined;
  readonly value: number | undefined;
}

const actionSchema = replayGameSchema
  .unwrap()
  .shape.actions.unwrap()
  .unwrap().element;
const deckCardSchema = replayGameSchema
  .unwrap()
  .shape.deck.unwrap()
  .unwrap().element;

interface MinMax {
  min: number;
  max: number;
}

/**
 * The number of comma-separated parts of a compressed game: the players and deck, the actions, the
 * variant ID, and the seed.
 */
const COMPRESSED_PARTS = 4;

/** The seed is the last part. */
const SEED_PART = COMPRESSED_PARTS - 1;

/** How often a hyphen is inserted so that a long compressed game wraps when it is posted. */
const HYPHEN_INTERVAL = 20;

/** The length of the min and max digits that start a compressed deck or list of actions. */
const RANGE_HEADER_LENGTH = 2;

/** The length of a compressed action: one character for its type and value, one for its target. */
const COMPRESSED_ACTION_LENGTH = 2;

const BASE62 = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** A compressed game over stores its end condition as its position in this list. */
const END_CONDITIONS: readonly EndCondition[] = endConditionSchema.options;

/** The end condition that a compressed action names, or undefined when it names none. */
function endCondition(index: number | undefined): EndCondition | undefined {
  return index === undefined ? undefined : END_CONDITIONS[index];
}

/**
 * Compresses a string representing a `GameJson` object. Returns undefined if the compression fails.
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
export function shrink(jsonString: string): string | undefined {
  const gameDataJson = parseGameJson(jsonString);
  if (gameDataJson === undefined) {
    return undefined;
  }

  const compressed = gameJsonCompress(gameDataJson);
  if (compressed === undefined) {
    return undefined;
  }

  // Check if compression succeeded.
  const decompressed = expand(compressed);
  if (
    decompressed === undefined
    || !isEqual(gameDataJson, parseGameJson(decompressed))
  ) {
    return undefined;
  }

  return compressed;
}

function parseGameJson(jsonString: string) {
  try {
    const result = replayGameSchema.safeParse(JSON.parse(jsonString));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

/** Decompresses a string into a `GameJson` object. Returns undefined if decompression fails. */
export function expand(data: string): string | undefined {
  const parts = data.split(",");
  const seed = parts[SEED_PART];
  if (
    parts.length !== COMPRESSED_PARTS
    || seed === undefined
    || !/^[\d\-A-Za-z]*$/u.test(seed)
  ) {
    return undefined;
  }
  // Remove wrapping hyphens from the compressed data, never from the seed.
  const normal = parts.slice(0, SEED_PART).join(",").replaceAll("-", "");

  const [playersAndDeck, actionsString, variantIdString] = normal.split(
    ",",
    SEED_PART,
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
    variantIdString,
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

  const variantId = parseIntSafe(variantIdString);
  if (variantId === undefined) {
    return undefined;
  }
  const variant = getVariantById(variantId);

  const original: GameJson = {
    playerNames: [...players],
    deck: [...deck],
    actions: [...actions],
    options: {
      variantName: variant.name,
    },
    characters: [],
    notes: [],
    ...(seed !== "" && { seed }),
  };

  return JSON.stringify(original);
}

/** Compresses a `GameJson` object into a string. Returns undefined if decompression fails. */
function gameJsonCompress(
  data: z.output<typeof replayGameSchema>,
): string | undefined {
  // An empty last part is a game without a seed.
  const seed = data.seed ?? "";
  if (!/^[\d\-A-Za-z]*$/u.test(seed)) {
    return undefined;
  }
  let out = "";

  // Number of players
  const numberOfPlayers = data.playerNames?.length ?? 0;
  if (numberOfPlayers < MIN_PLAYERS || numberOfPlayers > MAX_PLAYERS) {
    return undefined;
  }
  out += numberOfPlayers.toString();

  // Deck
  const deck = compressDeck(data.deck ?? []);
  if (deck === undefined) {
    return undefined;
  }
  out += `${deck},`;

  // Actions
  const actions = compressActions(data.actions ?? []);
  out += `${actions},`;

  // Variant ID
  const variantName = data.options?.variantName;
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
  const rankRange = getMinMax(deck.map((card) => card.rank));
  if (rankRange === undefined || !isMinMaxValid(rankRange)) {
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

  let s = RANGE_HEADER_LENGTH;
  while (s < src.length) {
    const compressedDeckCard = src.charAt(s);
    const deckCard = stringToDeckCard(compressedDeckCard, rankRange);
    if (deckCard === undefined) {
      return undefined;
    }
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
function stringToDeckCard(
  src: string,
  rankRange: MinMax,
): DeckCard | undefined {
  const r = rankRange.max - rankRange.min + 1;
  const index = BASE62.indexOf(src);
  const rank = (index % r) + 1;
  const suitIndex = Math.floor((index - rank + 1) / r);

  const result = deckCardSchema.safeParse({ suitIndex, rank });
  return result.success ? result.data : undefined;
}

/**
 * Compresses an array of `Action` into a string. The first two characters of the string are numbers
 * containing the min and max values of `Action.type`. The rest of the string contains series of
 * strings two characters long, each representing an `Action`.
 */
function compressActions(actions: readonly Action[]): string {
  const compactActions = actions.map(toCompactAction);

  // Find min/max values of Action.type.
  const typeRange = getMinMax(compactActions.map((action) => action.type));
  if (typeRange === undefined || !isMinMaxValid(typeRange)) {
    // Empty actions still require min/max values.
    return "00";
  }

  const actionStrings = compactActions.map((action) =>
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

  let s = RANGE_HEADER_LENGTH;
  while (s < src.length) {
    const compressedAction = src.slice(s, s + COMPRESSED_ACTION_LENGTH);
    const action = stringToAction(compressedAction, typeRange);
    if (action === undefined) {
      return undefined;
    }
    actions.push(action);
    s += COMPRESSED_ACTION_LENGTH;
  }

  return actions;
}

/**
 * Converts an `Action` into a string. The returned string is two characters long, the first one
 * representing `Action.type` and `Action.value` and the second representing the `Action.target`.
 */
function actionToString(action: CompactAction, typeRange: MinMax): string {
  const r = typeRange.max - typeRange.min + 1;
  const index = encodeOptional(action.value) * r + action.type - typeRange.min;
  return BASE62.charAt(index) + BASE62.charAt(encodeOptional(action.target));
}

/** A compressed action stores a number that may be absent as 0 when absent, or as one more. */
function encodeOptional(value: number | undefined): number {
  return value === undefined ? 0 : value + 1;
}

function decodeOptional(encoded: number): number | undefined {
  return encoded === 0 ? undefined : encoded - 1;
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
  if (target === -1) {
    return undefined;
  }
  const recordedType = z.enum(CompactType).safeParse(type);
  if (!recordedType.success) {
    return undefined;
  }

  return fromCompactAction({
    type: recordedType.data,
    target: decodeOptional(target),
    value: decodeOptional(val),
  });
}

/** The compact form of an action. */
function toCompactAction(action: Action): CompactAction {
  switch (action.type) {
    case "play": {
      return {
        type: CompactType.Play,
        target: action.order,
        value: undefined,
      };
    }

    case "discard": {
      return {
        type: CompactType.Discard,
        target: action.order,
        value: undefined,
      };
    }

    case "clue": {
      return {
        type:
          action.clue.type === "color"
            ? CompactType.ColorClue
            : CompactType.RankClue,
        target: action.receiverIndex,
        value: action.clue.value,
      };
    }

    case "gameOver": {
      return {
        type: CompactType.GameOver,
        target: action.playerIndex,
        value: END_CONDITIONS.indexOf(action.endCondition),
      };
    }
  }
}

function fromCompactAction(action: CompactAction): Action | undefined {
  const { target, value } = action;
  let named: unknown;
  switch (action.type) {
    case CompactType.Play: {
      named = { type: "play", order: target };
      break;
    }

    case CompactType.Discard: {
      named = { type: "discard", order: target };
      break;
    }

    case CompactType.ColorClue: {
      named = {
        type: "clue",
        receiverIndex: target,
        clue: { type: "color", value },
      };
      break;
    }

    case CompactType.RankClue: {
      named = {
        type: "clue",
        receiverIndex: target,
        clue: { type: "rank", value },
      };
      break;
    }

    case CompactType.GameOver: {
      named = {
        type: "gameOver",
        endCondition: endCondition(value),
        ...(target !== undefined && { playerIndex: target }),
      };
      break;
    }
  }
  const result = actionSchema.safeParse(named);
  return result.success ? result.data : undefined;
}

/** Returns a string array of hypothetical players (Alice, Bob, etc). */
function getPlayers(size: number): readonly string[] {
  if (size < MIN_PLAYERS || size > MAX_PLAYERS) {
    return [];
  }
  return DEFAULT_PLAYER_NAMES.slice(0, size);
}

/** Returns the minimum and maximum of the values, or undefined if there are none. */
function getMinMax(values: readonly number[]): MinMax | undefined {
  const [first, ...rest] = values;
  if (first === undefined) {
    return undefined;
  }

  const range: MinMax = { min: first, max: first };
  for (const value of rest) {
    range.min = Math.min(range.min, value);
    range.max = Math.max(range.max, value);
  }

  return range;
}

function isMinMaxValid(range: MinMax): boolean {
  return range.min >= 0 && range.min <= range.max;
}
