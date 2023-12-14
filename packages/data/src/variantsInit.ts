import { assertDefined, parseIntSafe } from "@hanabi/utils";
import { getUppercaseSuitAbbreviationsForVariant } from "./abbreviations";
import {
  DEFAULT_CARD_RANKS,
  DEFAULT_CLUE_RANKS,
  DEFAULT_FINISHED_STACK_LENGTH,
  START_CARD_RANK,
} from "./constants";
import type { Color } from "./interfaces/Color";
import type { Suit } from "./interfaces/Suit";
import type { Variant } from "./interfaces/Variant";
import type { VariantDescription } from "./interfaces/VariantDescription";
import type { VariantJSON } from "./interfaces/VariantJSON";
import variantsJSON from "./json/variants.json";
import { getIdentityNotePatternForVariant } from "./notes";
import type { Rank } from "./types/Rank";
import { isValidRankClueNumber } from "./types/RankClueNumber";

export function variantsInit(
  colorsMap: ReadonlyMap<string, Color>,
  suitsMap: ReadonlyMap<string, Suit>,
): ReadonlyMap<string, Variant> {
  const variants = new Map<string, Variant>();

  if (variantsJSON.length === 0) {
    throw new Error(
      'The "variants.json" file did not have any elements in it.',
    );
  }

  // Fields are validated in the order that they appear in "VariantDescription.ts".
  for (const variantJSON of variantsJSON as VariantJSON[]) {
    // ------------------------
    // `VariantJSON` properties
    // ------------------------

    // Validate the ID. (The first variant has an ID of 0.)
    if (variantJSON.id < 0) {
      throw new Error(`The "${variantJSON.name}" variant has an invalid ID.`);
    }
    const { id } = variantJSON;

    // Validate the new ID.
    if (variantJSON.newID === "") {
      throw new Error(
        `The "${variantJSON.name}" variant has a blank "newID" property.`,
      );
    }
    const { newID } = variantJSON;

    const variant = createVariant(colorsMap, suitsMap, variantJSON, id, newID);

    variants.set(variantJSON.name, variant);
  }

  return variants;
}

export function createVariant(
  colorsMap: ReadonlyMap<string, Color>,
  suitsMap: ReadonlyMap<string, Suit>,
  variantDescription: VariantDescription,
  id: number,
  newID: string,
): Variant {
  // ---------------
  // Core properties
  // ---------------

  // Validate the name.
  if (variantDescription.name === "") {
    throw new Error("Attempted to create variant with an empty name.");
  }
  const { name } = variantDescription;

  // Validate the suits.
  if (variantDescription.suits.length === 0) {
    throw new Error(`The "${name}" variant has an empty suits array.`);
  }

  // The suits are specified as an array of strings. Convert the strings to objects.
  const suits = variantDescription.suits.map((suitName) => {
    const suit = suitsMap.get(suitName);
    assertDefined(
      suit,
      `The "${name}" variant has a "${suitName}" suit, which does not exist.`,
    );

    return suit;
  });

  // Validate the clue colors (the colors available to clue in this variant) and convert the string
  // array to a color object array.
  const clueColors = getVariantClueColors(variantDescription, colorsMap, suits);

  // Validate the clue ranks (the ranks available to clue in this variant). If it is not specified,
  // assume that players can clue the normal ranks.
  if (variantDescription.clueRanks !== undefined) {
    for (const clueRank of variantDescription.clueRanks) {
      if (!isValidRankClueNumber(clueRank)) {
        throw new Error(
          `The "clueRanks" property for the variant "${name}" has an invalid value of: ${clueRank}`,
        );
      }
    }
  }
  const clueRanks = variantDescription.clueRanks ?? [...DEFAULT_CLUE_RANKS];

  // Validate the "stackSize" property.
  if (variantDescription.stackSize === DEFAULT_FINISHED_STACK_LENGTH) {
    throw new Error(
      `The "stackSize" property for the variant "${variantDescription.name}" must not be set to ${DEFAULT_FINISHED_STACK_LENGTH}. If it is intended to be ${DEFAULT_FINISHED_STACK_LENGTH}, then remove the property altogether.`,
    );
  }
  const stackSize =
    variantDescription.stackSize ?? DEFAULT_FINISHED_STACK_LENGTH;

  // -----------------------------------------------
  // Special variant properties (from `VariantJSON`)
  // -----------------------------------------------

  // Validate the "clueStarved" property. If it is not specified, assume false.
  if (variantDescription.clueStarved === false) {
    throw new Error(
      `The "clueStarved" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const clueStarved = variantDescription.clueStarved ?? false;

  // Validate the "colorCluesTouchNothing" property. If it is not specified, assume false (e.g.
  // cluing colors in this variant works normally).
  if (variantDescription.colorCluesTouchNothing === false) {
    throw new Error(
      `The "colorCluesTouchNothing" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const colorCluesTouchNothing =
    variantDescription.colorCluesTouchNothing ?? false;

  // Validate the "rankCluesTouchNothing" property. If it is not specified, assume false (e.g.
  // cluing ranks in this variant works normally).
  if (variantDescription.rankCluesTouchNothing === false) {
    throw new Error(
      `The "rankCluesTouchNothing" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const rankCluesTouchNothing =
    variantDescription.rankCluesTouchNothing ?? false;

  // Validate the "alternatingClues" property. If it is not specified, assume false.
  if (variantDescription.alternatingClues === false) {
    throw new Error(
      `The "alternatingClues" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const alternatingClues = variantDescription.alternatingClues ?? false;

  // Validate the "cowAndPig" property. If it is not specified, assume false.
  if (variantDescription.cowAndPig === false) {
    throw new Error(
      `The "cowAndPig" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const cowAndPig = variantDescription.cowAndPig ?? false;

  // Validate the "duck" property. If it is not specified, assume false.
  if (variantDescription.duck === false) {
    throw new Error(
      `The "duck" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const duck = variantDescription.duck ?? false;

  // Validate the "oddsAndEvens" property. If it is not specified, assume false (e.g. cluing ranks
  // in this variant works normally).
  if (variantDescription.oddsAndEvens === false) {
    throw new Error(
      `The "oddsAndEvens" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const oddsAndEvens = variantDescription.oddsAndEvens ?? false;

  // Validate the "synesthesia" property. If it is not specified, assume false.
  if (variantDescription.synesthesia === false) {
    throw new Error(
      `The "synesthesia" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const synesthesia = variantDescription.synesthesia ?? false;

  // Validate the "upOrDown" property. If it is not specified, assume false.
  if (variantDescription.upOrDown === false) {
    throw new Error(
      `The "upOrDown" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const upOrDown = variantDescription.upOrDown ?? false;

  // Validate the "throwItInAHole" property. If it is not specified, assume false.
  if (variantDescription.throwItInAHole === false) {
    throw new Error(
      `The "throwItInAHole" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const throwItInAHole = variantDescription.throwItInAHole ?? false;

  // Validate the "funnels" property. If it is not specified, assume false (e.g. cluing ranks in
  // this variant works normally).
  if (variantDescription.funnels === false) {
    throw new Error(
      `The "funnels" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const funnels = variantDescription.funnels ?? false;

  // Validate the "chimneys" property. If it is not specified, assume false (e.g. cluing ranks in
  // this variant works normally).
  if (variantDescription.chimneys === false) {
    throw new Error(
      `The "chimneys" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const chimneys = variantDescription.chimneys ?? false;

  // Validate the "sudoku" property. If it is not specified, assume false (e.g. cluing ranks in this
  // variant works normally).
  if (variantDescription.sudoku === false) {
    throw new Error(
      `The "sudoku" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const sudoku = variantDescription.sudoku ?? false;

  // --------------------------------------
  // Computed `Variant` properties (part 1)
  // --------------------------------------

  // Derive the ranks that the cards of each suit will be. (This must be before validating the
  // special rank properties.)
  const ranks: Rank[] = [...DEFAULT_CARD_RANKS].slice(0, stackSize);
  if (upOrDown) {
    // The "Up or Down" variants have START cards.
    ranks.push(START_CARD_RANK);
  }

  // --------------------------------------------
  // Special rank properties (from `VariantJSON`)
  // --------------------------------------------

  // Validate the "specialRank" property (e.g. for "Rainbow-Ones"). If it is not specified, assume
  // `undefined` (e.g. there are no special ranks).
  if (
    variantDescription.specialRank !== undefined &&
    !ranks.includes(variantDescription.specialRank)
  ) {
    throw new Error(
      `The "specialRank" property for the variant "${variantDescription.name}" is invalid: ${variantDescription.specialRank}`,
    );
  }
  const { specialRank } = variantDescription;

  // Validate the "specialRankAllClueColors" property. If it is not specified, assume false (e.g.
  // cluing ranks in this variant works normally).
  if (variantDescription.specialRankAllClueColors === false) {
    throw new Error(
      `The "specialRankAllClueColors" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const specialRankAllClueColors =
    variantDescription.specialRankAllClueColors ?? false;

  // Validate the "specialRankAllClueRanks" property. If it is not specified, assume false (e.g.
  // cluing ranks in this variant works normally).
  if (variantDescription.specialRankAllClueRanks === false) {
    throw new Error(
      `The "specialRankAllClueRanks" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const specialRankAllClueRanks =
    variantDescription.specialRankAllClueRanks ?? false;

  // Validate the "specialRankNoClueColors" property. If it is not specified, assume false (e.g.
  // cluing ranks in this variant works normally).
  if (variantDescription.specialRankNoClueColors === false) {
    throw new Error(
      `The "specialRankNoClueColors" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const specialRankNoClueColors =
    variantDescription.specialRankNoClueColors ?? false;

  // Validate the "specialRankNoClueRanks" property. If it is not specified, assume false (e.g.
  // cluing ranks in this variant works normally).
  if (variantDescription.specialRankNoClueRanks === false) {
    throw new Error(
      `The "specialRankNoClueRanks" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const specialRankNoClueRanks =
    variantDescription.specialRankNoClueRanks ?? false;

  // Validate the "specialRankDeceptive" property. If it is not specified, assume false (e.g. cluing
  // ranks in this variant works normally).
  if (variantDescription.specialRankDeceptive === false) {
    throw new Error(
      `The "specialRankDeceptive" property for the variant "${variantDescription.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
    );
  }
  const specialRankDeceptive = variantDescription.specialRankDeceptive ?? false;

  // Validate the "criticalRank" property. If it is not specified, assume `undefined` (e.g. there
  // are no critical ranks).
  if (
    variantDescription.criticalRank !== undefined &&
    !ranks.includes(variantDescription.criticalRank)
  ) {
    throw new Error(
      `The "criticalRank" property for the variant "${variantDescription.name}" is invalid: ${variantDescription.criticalRank}`,
    );
  }
  const { criticalRank } = variantDescription;

  // --------------------------------------
  // Computed `Variant` properties (part 2)
  // --------------------------------------

  const maxScore = suits.length * stackSize;

  // Variants with dual-color suits need to adjust the positions of elements in the corner of the
  // card (e.g. the note indicator) because it will overlap with the triangle that shows the color
  // composition of the suit.
  const offsetCornerElements = suits.some(
    (suit: Suit) => suit.clueColors.length > 1,
  );

  const suitAbbreviations = getUppercaseSuitAbbreviationsForVariant(
    name,
    suits,
  );

  const showSuitNames = getVariantShowSuitNames(suits, upOrDown, sudoku);

  // Create the regular expression pattern for identity notes in this variant.
  const isUpOrDown = name.startsWith("Up or Down");
  const identityNotePattern = getIdentityNotePatternForVariant(
    suits,
    ranks,
    suitAbbreviations,
    isUpOrDown,
  );

  // Add it to the map.
  const variant: Variant = {
    name,
    suits,
    ranks,

    clueColors,
    clueRanks,
    stackSize,

    specialRank,
    specialRankAllClueColors,
    specialRankAllClueRanks,
    specialRankNoClueColors,
    specialRankNoClueRanks,
    specialRankDeceptive,

    criticalRank,
    clueStarved,
    colorCluesTouchNothing,
    rankCluesTouchNothing,
    alternatingClues,
    cowAndPig,
    duck,
    oddsAndEvens,
    synesthesia,
    upOrDown,
    throwItInAHole,
    funnels,
    chimneys,
    sudoku,

    id,
    newID,

    maxScore,
    offsetCornerElements,
    suitAbbreviations,
    showSuitNames,
    identityNotePattern,
  };

  return variant;
}

function getVariantClueColors(
  variantDescription: VariantDescription,
  COLORS: ReadonlyMap<string, Color>,
  suits: readonly Suit[],
): readonly Color[] {
  // If the clue colors were not specified in the JSON, derive them from the suits.
  if (variantDescription.clueColors === undefined) {
    const clueColors: Color[] = [];

    for (const suit of suits) {
      if (suit.allClueColors) {
        // If a suit is touched by all colors, then we do not want to add every single clue color to
        // the variant clue list.
        continue;
      }

      for (const color of suit.clueColors) {
        if (!clueColors.includes(color)) {
          clueColors.push(color);
        }
      }
    }

    return clueColors;
  }

  // The clue colors are specified as an array of strings. Convert the strings to objects.
  return variantDescription.clueColors.map((colorString) => {
    const color = COLORS.get(colorString);
    assertDefined(
      color,
      `The "${variantDescription.name}" variant has a clue color of "${colorString}", which does not exist.`,
    );

    return color;
  });
}

function getVariantShowSuitNames(
  suits: readonly Suit[],
  upOrDown: boolean,
  sudoku: boolean,
): boolean {
  // If the suit ID ends in a number, it is an "Ambiguous" suit, which means that its identity is
  // not easily identifiable from a glance. Thus, we want to show the suit names for the variant in
  // this case.
  const hasSuitIDThatEndsWithANumber = suits.some((suit) => {
    const finalIDCharacter = suit.id.at(-1);
    assertDefined(
      finalIDCharacter,
      `Failed to get the final character of the ID of suit: ${suit.name}`,
    );

    const finalIDNumber = parseIntSafe(finalIDCharacter);
    return finalIDNumber !== undefined;
  });
  if (hasSuitIDThatEndsWithANumber) {
    return true;
  }

  // Dual-color suits are not easily identifiable from a glance. Thus, we want to show the suit
  // names for the variant in this case.
  const hasSuitThatIsTouchedByTwoOrMoreClueColors = suits.some(
    (suit) => suit.clueColors.length >= 2,
  );
  if (hasSuitThatIsTouchedByTwoOrMoreClueColors) {
    return true;
  }

  // If a variant has a reversed suit, we want to show the suit names so that the stack direction is
  // easily identifiable.
  const variantHasReversedSuits = suits.some((suit: Suit) => suit.reversed);
  if (variantHasReversedSuits) {
    return true;
  }

  // In "Up or Down" variants, we always want to show the suit names so that the stack directions
  // are easily identifiable.
  if (upOrDown) {
    return true;
  }

  // In "Sudoku" variants, we always want to show the suit names so that the stack status is easily
  // identifiable.
  if (sudoku) {
    return true;
  }

  return false;
}
