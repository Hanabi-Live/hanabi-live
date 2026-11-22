// The variant builder of Create Game. A player picks a variant's suits and rules, and the builder
// writes its recipe. Every recipe that the server accepts is a variant: the server gives a recipe
// that the catalog does not have an ID and a name the first time that a table uses it.

import type { Suit, Variant } from "@hanabi-live/game";
import {
  COLORS_MAP,
  createVariant,
  DEFAULT_VARIANT_NAME,
  getVariant,
  MAX_SUITS,
  RECIPE_CRITICAL_RANK,
  RECIPE_DECEPTIVE_RANK,
  RECIPE_MODIFIER_SEPARATOR,
  RECIPE_SCARCE_RANK,
  RECIPE_SUIT_FLAG_SEPARATOR,
  RECIPE_SUIT_SEPARATOR,
  recipeFlagSchema,
  SUIT_REVERSED_SUFFIX,
  SUITS_MAP,
  VARIANT_NAMES,
} from "@hanabi-live/game";
import { ReadonlyMap, ReadonlySet } from "complete-common";
import type { z } from "zod";

export type RecipeFlag = z.infer<typeof recipeFlagSchema>;

/** The ranks that a rank rule can name. */
export const RULE_RANKS = [1, 2, 3, 4, 5] as const;

/**
 * The normal suits that fill a deck beside its chosen suits, by how many there are. The catalog
 * fills its decks this way, so that a deck that it has gets the catalog's recipe.
 */
const NORMAL_FILLS = [
  [],
  ["r"],
  ["r", "b"],
  ["r", "g", "b"],
  ["r", "y", "g", "b"],
  ["r", "y", "g", "b", "p"],
  ["r", "y", "g", "b", "p", "t"],
] as const satisfies ReadonlyArray<readonly string[]>;

const NORMAL_SUIT_IDS = new ReadonlySet<string>(NORMAL_FILLS[MAX_SUITS]);

/** The suit that stands for a card whose suit is not known. No variant has it. */
const UNKNOWN_SUIT_ID = "uk";

/** The suits that the builder lists first, since many variants use them. */
const SPECIAL_SUIT_IDS = new ReadonlySet([
  "bk",
  "br",
  "brra",
  "nu",
  "om",
  "or",
  "pi",
  "pr",
  "ra",
  "wh",
  "whpi",
]);

const DARK_SUFFIX = `${RECIPE_SUIT_FLAG_SEPARATOR}dark`;
const REVERSED_FLAG = "rev";

/** The rules that take no rank, with their names, in the order that a recipe writes them. */
const FLAG_NAMES = {
  starved: "Clue Starved",
  cb: "Color Blind",
  nb: "Number Blind",
  cm: "Color Mute",
  nm: "Number Mute",
  alt: "Alternating Clues",
  cowpig: "Cow and Pig",
  duck: "Duck",
  oe: "Odds and Evens",
  syn: "Synesthesia",
  updown: "Up or Down",
  hole: "Throw It in a Hole",
  funnels: "Funnels",
  chimneys: "Chimneys",
  sudoku: "Sudoku",
} as const satisfies Record<RecipeFlag, string>;

/** The flags about clues. The others change how cards are played. */
const CLUE_FLAGS = new ReadonlySet<RecipeFlag>([
  "alt",
  "cb",
  "cm",
  "cowpig",
  "duck",
  "nb",
  "nm",
  "oe",
  "starved",
  "syn",
]);

/** The groups of suits that the builder shows, in order. */
export type SuitGroup = "special" | "dark" | "otherColors";

/** A suit that a player can add to a deck. */
interface SuitPart {
  /** The suit's ID in a recipe, such as "ra.dark". */
  readonly id: string;
  readonly suit: Suit;
  readonly group: SuitGroup;
}

/** A rule that makes a rank touched as a suit is, such as Pink for Pink-Ones, or Deceptive. */
interface SpecialRankRule {
  /** The suit's ID, or the code of Deceptive. */
  readonly code: string;
  readonly name: string;
}

export interface FlagPart {
  readonly flag: RecipeFlag;
  readonly name: string;
}

/** The parts that a variant can have. */
export interface Parts {
  readonly suits: readonly SuitPart[];
  readonly specialRanks: readonly SpecialRankRule[];
  readonly clueFlags: readonly FlagPart[];
  readonly playFlags: readonly FlagPart[];
}

/** What the player chose. */
export interface Choice {
  readonly numSuits: number;
  /** The suits other than the normal ones that fill the deck, by ID, in the order of `Parts`. */
  readonly suits: readonly string[];
  /** The suits of the deck that play from 5 down to 1, by ID. */
  readonly reversed: ReadonlySet<string>;
  readonly specialRank:
    | {
        readonly code: string;
        readonly rank: number;
      }
    | undefined;
  /** The rank with one copy in each suit. */
  readonly criticalRank: number | undefined;
  readonly scarceOnes: boolean;
  readonly flags: ReadonlySet<RecipeFlag>;
}

const EMPTY_CHOICE = {
  numSuits: 5,
  suits: [],
  reversed: new Set(),
  specialRank: undefined,
  criticalRank: undefined,
  scarceOnes: false,
  flags: new Set(),
} as const satisfies Choice;

let parts: Parts | undefined;

/** The suits and rules that recipes can use. */
export function getParts(): Parts {
  parts ??= readParts();
  return parts;
}

function readParts(): Parts {
  const suits: SuitPart[] = [];
  const specialRanks: SpecialRankRule[] = [];
  for (const suit of SUITS_MAP.values()) {
    const { id } = suit;
    if (id === UNKNOWN_SUIT_ID || suit.reversed || NORMAL_SUIT_IDS.has(id)) {
      continue;
    }
    suits.push({
      id,
      suit,
      group: getSuitGroup(id),
    });

    // A rank can be touched as a suit that clues touch in a special way, as the engine allows.
    const special =
      suit.allClueColors
      || suit.allClueRanks
      || suit.noClueColors
      || suit.noClueRanks;
    if (special && !suit.oneOfEach && !suit.prism && !suit.inverted) {
      specialRanks.push({
        code: id,
        name: suit.displayName,
      });
    }
  }
  specialRanks.push({
    code: RECIPE_DECEPTIVE_RANK,
    name: "Deceptive",
  });

  const flags = recipeFlagSchema.options.map((flag) => ({
    flag,
    name: FLAG_NAMES[flag],
  }));
  return {
    suits,
    specialRanks,
    clueFlags: flags.filter(({ flag }) => CLUE_FLAGS.has(flag)),
    playFlags: flags.filter(({ flag }) => !CLUE_FLAGS.has(flag)),
  };
}

function getSuitGroup(id: string): SuitGroup {
  if (id.endsWith(DARK_SUFFIX)) {
    return "dark";
  }
  return SPECIAL_SUIT_IDS.has(id) ? "special" : "otherColors";
}

/** The suit without its dark version, so that a deck has each suit once. */
function getBaseId(id: string): string {
  return id.split(RECIPE_SUIT_FLAG_SEPARATOR)[0] ?? id;
}

/** The IDs of the deck's suits: the normal suits that fill it, then the chosen ones. */
export function getDeckSuitIds(choice: Choice): readonly string[] {
  const fill = NORMAL_FILLS[choice.numSuits - choice.suits.length] ?? [];
  return [...fill, ...choice.suits];
}

/** The recipe of a choice, such as "r-y-g-b-ra_1pi". */
export function getRecipe(choice: Choice): string {
  const suits = getDeckSuitIds(choice).map((id) =>
    choice.reversed.has(id)
      ? `${id}${RECIPE_SUIT_FLAG_SEPARATOR}${REVERSED_FLAG}`
      : id,
  );
  const modifiers: string[] = [];
  if (choice.specialRank !== undefined) {
    modifiers.push(`${choice.specialRank.rank}${choice.specialRank.code}`);
  }
  if (choice.criticalRank !== undefined) {
    modifiers.push(`${choice.criticalRank}${RECIPE_CRITICAL_RANK}`);
  }
  if (choice.scarceOnes) {
    modifiers.push(`1${RECIPE_SCARCE_RANK}`);
  }
  for (const flag of recipeFlagSchema.options) {
    if (choice.flags.has(flag)) {
      modifiers.push(flag);
    }
  }
  return [suits.join(RECIPE_SUIT_SEPARATOR), ...modifiers].join(
    RECIPE_MODIFIER_SEPARATOR,
  );
}

/**
 * The choice that a recipe makes. A recipe whose normal suits are not the usual ones, such as one
 * of the catalog's mixes, keeps them only as the number of suits.
 */
export function getChoice(recipe: string): Choice {
  const [suitsText = "", ...modifiers] = recipe.split(
    RECIPE_MODIFIER_SEPARATOR,
  );
  const known = new Set(getParts().suits.map(({ id }) => id));
  const suitTokens = suitsText.split(RECIPE_SUIT_SEPARATOR);
  const suits: string[] = [];
  const reversed = new Set<string>();
  for (const token of suitTokens) {
    const isReversed = token.endsWith(
      `${RECIPE_SUIT_FLAG_SEPARATOR}${REVERSED_FLAG}`,
    );
    const id = isReversed
      ? token.slice(
          0,
          -REVERSED_FLAG.length - RECIPE_SUIT_FLAG_SEPARATOR.length,
        )
      : token;
    if (known.has(id)) {
      suits.push(id);
    }
    if (isReversed) {
      reversed.add(id);
    }
  }

  let choice: Choice = {
    ...EMPTY_CHOICE,
    numSuits: suitTokens.length,
    suits: sortSuits(suits),
    reversed,
  };
  const flags = new Set<RecipeFlag>();
  for (const modifier of modifiers) {
    // A rank modifier starts with its rank, such as "1pi". A flag has no digits.
    const digits = /^\d+/u.exec(modifier)?.[0];
    if (digits === undefined) {
      const flag = recipeFlagSchema.safeParse(modifier);
      if (flag.success) {
        flags.add(flag.data);
      }
      continue;
    }
    const rank = Number(digits);
    const code = modifier.slice(digits.length);
    if (code === RECIPE_CRITICAL_RANK) {
      choice = {
        ...choice,
        criticalRank: rank,
      };
    } else if (code === RECIPE_SCARCE_RANK) {
      choice = {
        ...choice,
        scarceOnes: true,
      };
    } else {
      choice = {
        ...choice,
        specialRank: {
          code,
          rank,
        },
      };
    }
  }
  return {
    ...choice,
    flags,
  };
}

/**
 * Suits in the order of their recipes, as the catalog writes them: other colors first, such as the
 * colors of a themed set, then the special and dark suits. Each group keeps the order of `Parts`.
 */
function sortSuits(ids: readonly string[]): readonly string[] {
  const order = getParts().suits.map(({ id }) => id);
  function getKey(id: string): number {
    const groupStart = getSuitGroup(id) === "otherColors" ? 0 : order.length;
    return groupStart + order.indexOf(id);
  }
  return ids.toSorted((a, b) => getKey(a) - getKey(b));
}

/**
 * Whether the deck can take this suit: it has room, or the suit takes the place of its other
 * version.
 */
export function canAddSuit(choice: Choice, id: string): boolean {
  const base = getBaseId(id);
  return (
    choice.suits.length < MAX_SUITS
    || choice.suits.some((other) => getBaseId(other) === base)
  );
}

/**
 * Adds a suit, or removes it. A suit takes the place of its other version, such as Dark Rainbow of
 * Rainbow. A full deck grows by one suit, up to the most that a deck has.
 */
export function toggleSuit(choice: Choice, id: string): Choice {
  if (choice.suits.includes(id)) {
    return {
      ...choice,
      suits: choice.suits.filter((other) => other !== id),
      reversed: without(choice.reversed, id),
    };
  }
  const base = getBaseId(id);
  const kept = choice.suits.filter((other) => getBaseId(other) !== base);
  const suits = sortSuits([...kept, id]);
  return withSuits(
    {
      ...choice,
      numSuits: Math.max(choice.numSuits, suits.length),
      suits,
    },
    choice,
  );
}

/** Changes the number of suits. It cannot be fewer than the chosen suits. */
export function setNumSuits(choice: Choice, numSuits: number): Choice {
  return withSuits(
    {
      ...choice,
      numSuits: Math.max(numSuits, choice.suits.length),
    },
    choice,
  );
}

/** Keeps a suit reversed only while it is in the deck. */
function withSuits(next: Choice, previous: Choice): Choice {
  const deck = new Set(getDeckSuitIds(next));
  const reversed = new Set([...previous.reversed].filter((id) => deck.has(id)));
  return {
    ...next,
    reversed,
  };
}

export function toggleReversed(choice: Choice, id: string): Choice {
  return {
    ...choice,
    reversed: choice.reversed.has(id)
      ? without(choice.reversed, id)
      : new Set(choice.reversed).add(id),
  };
}

/** Chooses the rule of the special rank, or removes it. A new rule starts on rank 1. */
export function toggleSpecialRule(choice: Choice, code: string): Choice {
  return {
    ...choice,
    specialRank:
      choice.specialRank?.code === code
        ? undefined
        : {
            code,
            rank: choice.specialRank?.rank ?? 1,
          },
  };
}

export function setSpecialRank(choice: Choice, rank: number): Choice {
  return choice.specialRank === undefined
    ? choice
    : {
        ...choice,
        specialRank: {
          ...choice.specialRank,
          rank,
        },
      };
}

export function toggleCriticalRank(choice: Choice, rank: number): Choice {
  return {
    ...choice,
    criticalRank: choice.criticalRank === rank ? undefined : rank,
  };
}

export function toggleScarceOnes(choice: Choice): Choice {
  return {
    ...choice,
    scarceOnes: !choice.scarceOnes,
  };
}

export function toggleFlag(choice: Choice, flag: RecipeFlag): Choice {
  return {
    ...choice,
    flags: choice.flags.has(flag)
      ? without(choice.flags, flag)
      : new Set(choice.flags).add(flag),
  };
}

function without<T>(set: ReadonlySet<T>, item: T): ReadonlySet<T> {
  const next = new Set(set);
  next.delete(item);
  return next;
}

let catalogByRecipe: ReadonlyMap<string, string> | undefined;

/** The name of the catalog's variant with this recipe, if it has one. */
export function getCatalogName(recipe: string): string | undefined {
  catalogByRecipe ??= new ReadonlyMap(
    VARIANT_NAMES.map((name) => [getVariant(name).recipe, name]),
  );
  return catalogByRecipe.get(recipe);
}

/**
 * A variant that has the deck of a choice, for drawing its cards. It leaves out the choice's rules,
 * since the server decides them.
 */
export function getDeckVariant(choice: Choice, name: string): Variant {
  const suitNames = getDeckSuitIds(choice).map((id) => {
    const suit = getSuitsById().get(id);
    const suitName = suit?.name ?? id;
    return choice.reversed.has(id)
      ? `${suitName}${SUIT_REVERSED_SUFFIX}`
      : suitName;
  });
  return createVariant(
    COLORS_MAP,
    SUITS_MAP,
    {
      name,
      suits: suitNames,
    },
    // The variant has no ID until the server creates it. Nothing reads the ID of this one.
    getVariant(DEFAULT_VARIANT_NAME).id,
    getRecipe(choice),
  );
}

let suitsById: ReadonlyMap<string, Suit> | undefined;

/** The suits that are not reversed, by ID. */
function getSuitsById(): ReadonlyMap<string, Suit> {
  suitsById ??= new ReadonlyMap(
    [...SUITS_MAP.values()]
      .filter((suit) => !suit.reversed)
      .map((suit) => [suit.id, suit]),
  );
  return suitsById;
}
