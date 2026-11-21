// The variant builder of Create Game. A player picks the parts of a variant, such as its special
// suits and its clue rules, and the builder finds the variants of the catalog that have them. The
// server plays only the variants of the catalog, so the builder cannot make a new one.

import type { Suit, Variant } from "@hanabi-live/game";
import {
  RECIPE_CRITICAL_RANK,
  RECIPE_DECEPTIVE_RANK,
  RECIPE_MODIFIER_SEPARATOR,
  RECIPE_SCARCE_RANK,
  RECIPE_SUIT_FLAG_SEPARATOR,
  RECIPE_SUIT_SEPARATOR,
  SUIT_REVERSED_SUFFIX,
  VARIANT_NAMES,
  getVariant,
} from "@hanabi-live/game";
import { ReadonlySet } from "complete-common";

/** The suits that fill a variant beside its special suits. A choice does not name them. */
const NORMAL_SUIT_IDS = new ReadonlySet(["b", "g", "p", "r", "t", "y"]);

/** The special suits that the catalog combines with each other, such as Black and Rainbow. */
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

/** The rules that take no rank, by their code in a recipe, with their names. */
const CLUE_RULES = {
  starved: "Clue Starved",
  cb: "Color Blind",
  nb: "Number Blind",
  cm: "Color Mute",
  nm: "Number Mute",
  alt: "Alternating Clues",
  cowpig: "Cow & Pig",
  duck: "Duck",
  oe: "Odds and Evens",
  syn: "Synesthesia",
} as const;

const PLAY_RULES = {
  updown: "Up or Down",
  hole: "Throw It in a Hole",
  funnels: "Funnels",
  chimneys: "Chimneys",
  sudoku: "Sudoku",
} as const;

/** The groups of parts, in the order that the builder shows them. */
export type PartGroup =
  "special" | "dark" | "reversed" | "otherColors" | "ranks" | "clues" | "play";

/** A part that a variant can have: a suit other than the normal ones, or a rule. */
interface Part {
  /** The code of the part in a recipe, such as "ra.dark" or "1pi". */
  readonly code: string;
  /** The name that the part's button shows. Its row tells a reversed suit apart. */
  readonly label: string;
  /** The full name, such as "Rainbow Reversed". */
  readonly name: string;
  readonly group: PartGroup;
  /** The suit, for a part that is a suit. */
  readonly suit: Suit | undefined;
}

/** A variant of the catalog, split into the parts that the builder chooses. */
export interface BuilderVariant {
  readonly variant: Variant;
  readonly numSuits: number;
  /** The codes of its special suits and rules, each once. */
  readonly parts: ReadonlySet<string>;
}

/** What the player chose. An absent suit count allows any. */
export interface Choice {
  readonly numSuits: number | undefined;
  readonly parts: ReadonlySet<string>;
}

/** The parts of the catalog, and its variants split into them. */
export interface Catalog {
  readonly parts: ReadonlyMap<string, Part>;
  readonly variants: readonly BuilderVariant[];
  readonly suitCounts: readonly number[];
}

let catalog: Catalog | undefined;

/** The catalog, which the builder reads once. */
export function getCatalog(): Catalog {
  catalog ??= readCatalog(VARIANT_NAMES.map((name) => getVariant(name)));
  return catalog;
}

function readCatalog(variants: readonly Variant[]): Catalog {
  const recipes = variants.map((variant) => {
    const [suitsText = "", ...modifiers] = variant.recipe.split(
      RECIPE_MODIFIER_SEPARATOR,
    );
    return {
      variant,
      suitCodes: suitsText.split(RECIPE_SUIT_SEPARATOR),
      modifiers,
    };
  });

  // A rank can take the clues of a suit that its variant does not have, such as the 1s of
  // "Rainbow-Ones (5 Suits)". So every suit is read before the ranks.
  const suits = new Map<string, Suit>();
  for (const { variant, suitCodes } of recipes) {
    for (const [index, code] of suitCodes.entries()) {
      const suit = variant.suits[index];
      if (suit !== undefined && !suits.has(code)) {
        suits.set(code, suit);
      }
    }
  }

  const parts = new Map<string, Part>();
  const builderVariants = recipes.map(
    ({ variant, suitCodes, modifiers }): BuilderVariant => {
      const variantParts = new Set<string>();
      for (const code of suitCodes) {
        if (NORMAL_SUIT_IDS.has(code)) {
          continue;
        }
        variantParts.add(code);
        if (parts.has(code)) {
          continue;
        }
        const suit = suits.get(code);
        const group = getSuitGroup(code);
        const label = suit?.name ?? code;
        parts.set(code, {
          code,
          label,
          name: group === "reversed" ? label + SUIT_REVERSED_SUFFIX : label,
          group,
          suit,
        });
      }
      for (const code of modifiers) {
        variantParts.add(code);
        if (!parts.has(code)) {
          parts.set(code, getRulePart(code, suits));
        }
      }
      return {
        variant,
        numSuits: suitCodes.length,
        parts: variantParts,
      };
    },
  );

  const suitCounts = [
    ...new Set(builderVariants.map((variant) => variant.numSuits)),
  ].toSorted((a, b) => a - b);
  return {
    parts,
    variants: builderVariants,
    suitCounts,
  };
}

function getSuitGroup(code: string): PartGroup {
  const [id = "", ...flags] = code.split(RECIPE_SUIT_FLAG_SEPARATOR);
  if (flags.includes("rev")) {
    return "reversed";
  }
  if (flags.includes("dark")) {
    return "dark";
  }
  return SPECIAL_SUIT_IDS.has(id) ? "special" : "otherColors";
}

/** A rule of a recipe, such as "1pi" for Pink-Ones or "hole" for Throw It in a Hole. */
function getRulePart(code: string, suits: ReadonlyMap<string, Suit>): Part {
  if (code in CLUE_RULES) {
    return {
      code,
      label: CLUE_RULES[code as keyof typeof CLUE_RULES],
      name: CLUE_RULES[code as keyof typeof CLUE_RULES],
      group: "clues",
      suit: undefined,
    };
  }
  if (code in PLAY_RULES) {
    return {
      code,
      label: PLAY_RULES[code as keyof typeof PLAY_RULES],
      name: PLAY_RULES[code as keyof typeof PLAY_RULES],
      group: "play",
      suit: undefined,
    };
  }

  const rank = code.slice(0, 1);
  const rule = code.slice(1);
  let name: string;
  switch (rule) {
    case RECIPE_DECEPTIVE_RANK: {
      name = `Deceptive ${rank}s`;
      break;
    }

    case RECIPE_CRITICAL_RANK: {
      name = `Critical ${rank}s`;
      break;
    }

    case RECIPE_SCARCE_RANK: {
      name = `Scarce ${rank}s`;
      break;
    }

    default: {
      // The rank takes the clues of a suit, such as Rainbow.
      name = `${suits.get(rule)?.displayName ?? rule} ${rank}s`;
      break;
    }
  }
  return {
    code,
    label: name,
    name,
    group: "ranks",
    suit: undefined,
  };
}

/** The parts of a variant, as a choice that the builder starts from. */
export function getChoice(
  builderCatalog: Catalog,
  variantName: string,
): Choice {
  const found = builderCatalog.variants.find(
    (candidate) => candidate.variant.name === variantName,
  );
  return {
    numSuits: found?.numSuits,
    parts: found?.parts ?? new Set(),
  };
}

function hasEvery(variant: BuilderVariant, choice: Choice): boolean {
  return (
    (choice.numSuits === undefined || variant.numSuits === choice.numSuits)
    && [...choice.parts].every((code) => variant.parts.has(code))
  );
}

/** The variants that have every chosen part, and maybe others. */
function getReachable(
  builderCatalog: Catalog,
  choice: Choice,
): readonly BuilderVariant[] {
  return builderCatalog.variants.filter((variant) => hasEvery(variant, choice));
}

/**
 * The variants that have exactly the chosen parts. Several can match, such as variants that differ
 * only in their normal suits. The catalog's order puts the usual one first.
 */
export function getMatches(
  builderCatalog: Catalog,
  choice: Choice,
): readonly BuilderVariant[] {
  return getReachable(builderCatalog, choice).filter(
    (variant) => variant.parts.size === choice.parts.size,
  );
}

/** Whether a choice with this part added still leads to a variant. */
export function canAdd(
  builderCatalog: Catalog,
  choice: Choice,
  code: string,
): boolean {
  const parts = new Set(choice.parts).add(code);
  return builderCatalog.variants.some((variant) =>
    hasEvery(variant, {
      numSuits: choice.numSuits,
      parts,
    }),
  );
}

/** Whether a choice with this suit count still leads to a variant. */
export function canHaveSuits(
  builderCatalog: Catalog,
  choice: Choice,
  numSuits: number,
): boolean {
  return builderCatalog.variants.some((variant) =>
    hasEvery(variant, {
      ...choice,
      numSuits,
    }),
  );
}

/** Adds a part to a choice, or removes it. */
export function toggle(choice: Choice, code: string): Choice {
  const parts = new Set(choice.parts);
  if (parts.has(code)) {
    parts.delete(code);
  } else {
    parts.add(code);
  }
  return {
    ...choice,
    parts,
  };
}
