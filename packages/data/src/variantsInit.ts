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
import type { VariantJSON } from "./interfaces/VariantJSON";
import variantsJSON from "./json/variants.json";
import { getIdentityNotePatternForVariant } from "./notes";
import {isValidBasicRank, Rank} from "./types/Rank";
import { isValidRank } from "./types/Rank";
import { isValidRankClueNumber } from "./types/RankClueNumber";

export function variantsInit(
  COLORS: ReadonlyMap<string, Color>,
  SUITS: ReadonlyMap<string, Suit>,
): ReadonlyMap<string, Variant> {
  const variants = new Map<string, Variant>();

  if (variantsJSON.length === 0) {
    throw new Error(
      'The "variants.json" file did not have any elements in it.',
    );
  }

  // Fields are validated in the order that they appear in "VariantDescription.ts".
  for (const variantJSON of variantsJSON as VariantJSON[]) {
    // ---------------
    // Core properties
    // ---------------

    // Validate the name.
    if (variantJSON.name === "") {
      throw new Error(
        'There is a variant with an empty name in the "variants.json" file.',
      );
    }
    const { name } = variantJSON;

    // Validate the suits.
    if (variantJSON.suits.length === 0) {
      throw new Error(`The "${name}" variant has an empty suits array.`);
    }

    // The suits are specified as an array of strings. Convert the strings to objects.
    const suits = variantJSON.suits.map((suitName) => {
      const suit = SUITS.get(suitName);
      assertDefined(
        suit,
        `The "${name}" variant has a "${suitName}" suit, which does not exist.`,
      );

      return suit;
    });

    // Validate the clue colors (the colors available to clue in this variant) and convert the
    // string array to a color object array.
    const clueColors = getVariantClueColors(variantJSON, COLORS, suits);

    // Validate the clue ranks (the ranks available to clue in this variant). If it is not
    // specified, assume that players can clue the normal ranks.
    if (variantJSON.clueRanks !== undefined) {
      for (const clueRank of variantJSON.clueRanks) {
        if (!isValidRankClueNumber(clueRank)) {
          throw new Error(
            `The "clueRanks" property for the variant "${name}" has an invalid value of: ${clueRank}`,
          );
        }
      }
    }
    const clueRanks = variantJSON.clueRanks ?? [...DEFAULT_CLUE_RANKS];

    // --------------------------------------------
    // Special rank properties (from `VariantJSON`)
    // --------------------------------------------

    // Validate the "specialRank" property (e.g. for "Rainbow-Ones"). If it is not specified, assume
    // `undefined` (e.g. there are no special ranks).
    if (
      variantJSON.specialRank !== undefined &&
      !isValidRank(variantJSON.specialRank)
    ) {
      throw new Error(
        `The "specialRank" property for the variant "${variantJSON.name}" is invalid: ${variantJSON.specialRank}`,
      );
    }
    const { specialRank } = variantJSON;

    // Validate the "specialRankAllClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialRankAllClueColors === false) {
      throw new Error(
        `The "specialRankAllClueColors" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialRankAllClueColors =
      variantJSON.specialRankAllClueColors ?? false;

    // Validate the "specialRankAllClueRanks" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialRankAllClueRanks === false) {
      throw new Error(
        `The "specialRankAllClueRanks" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialRankAllClueRanks =
      variantJSON.specialRankAllClueRanks ?? false;

    // Validate the "specialRankNoClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialRankNoClueColors === false) {
      throw new Error(
        `The "specialRankNoClueColors" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialRankNoClueColors =
      variantJSON.specialRankNoClueColors ?? false;

    // Validate the "specialRankNoClueRanks" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialRankNoClueRanks === false) {
      throw new Error(
        `The "specialRankNoClueRanks" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialRankNoClueRanks = variantJSON.specialRankNoClueRanks ?? false;

    // Validate the "specialRankDeceptive" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialRankDeceptive === false) {
      throw new Error(
        `The "specialRankDeceptive" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialRankDeceptive = variantJSON.specialRankDeceptive ?? false;

    // -----------------------------------------------
    // Special variant properties (from `VariantJSON`)
    // -----------------------------------------------

    // Validate the "criticalRank" property. If it is not specified, assume `undefined` (e.g. there
    // are no critical ranks).
    if (
      variantJSON.criticalRank !== undefined &&
      !isValidRank(variantJSON.criticalRank)
    ) {
      throw new Error(
        `The "criticalRank" property for the variant "${variantJSON.name}" is invalid: ${variantJSON.criticalRank}`,
      );
    }
    const { criticalRank } = variantJSON;

    // Validate the "clueStarved" property. If it is not specified, assume false.
    if (variantJSON.clueStarved === false) {
      throw new Error(
        `The "clueStarved" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const clueStarved = variantJSON.clueStarved ?? false;

    // Validate the "colorCluesTouchNothing" property. If it is not specified, assume false (e.g.
    // cluing colors in this variant works normally).
    if (variantJSON.colorCluesTouchNothing === false) {
      throw new Error(
        `The "colorCluesTouchNothing" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const colorCluesTouchNothing = variantJSON.colorCluesTouchNothing ?? false;

    // Validate the "rankCluesTouchNothing" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.rankCluesTouchNothing === false) {
      throw new Error(
        `The "rankCluesTouchNothing" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const rankCluesTouchNothing = variantJSON.rankCluesTouchNothing ?? false;

    // Validate the "alternatingClues" property. If it is not specified, assume false.
    if (variantJSON.alternatingClues === false) {
      throw new Error(
        `The "alternatingClues" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const alternatingClues = variantJSON.alternatingClues ?? false;

    // Validate the "cowAndPig" property. If it is not specified, assume false.
    if (variantJSON.cowAndPig === false) {
      throw new Error(
        `The "cowAndPig" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const cowAndPig = variantJSON.cowAndPig ?? false;

    // Validate the "duck" property. If it is not specified, assume false.
    if (variantJSON.duck === false) {
      throw new Error(
        `The "duck" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const duck = variantJSON.duck ?? false;

    // Validate the "oddsAndEvens" property. If it is not specified, assume false (e.g. cluing ranks
    // in this variant works normally).
    if (variantJSON.oddsAndEvens === false) {
      throw new Error(
        `The "oddsAndEvens" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const oddsAndEvens = variantJSON.oddsAndEvens ?? false;

    // Validate the "synesthesia" property. If it is not specified, assume false.
    if (variantJSON.synesthesia === false) {
      throw new Error(
        `The "synesthesia" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const synesthesia = variantJSON.synesthesia ?? false;

    // Validate the "upOrDown" property. If it is not specified, assume false.
    if (variantJSON.upOrDown === false) {
      throw new Error(
        `The "upOrDown" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const upOrDown = variantJSON.upOrDown ?? false;

    // Validate the "throwItInAHole" property. If it is not specified, assume false.
    if (variantJSON.throwItInAHole === false) {
      throw new Error(
        `The "throwItInAHole" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const throwItInAHole = variantJSON.throwItInAHole ?? false;

    // Validate the "funnels" property. If it is not specified, assume false (e.g. cluing ranks in
    // this variant works normally).
    if (variantJSON.funnels === false) {
      throw new Error(
        `The "funnels" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const funnels = variantJSON.funnels ?? false;

    // Validate the "chimneys" property. If it is not specified, assume false (e.g. cluing ranks in
    // this variant works normally).
    if (variantJSON.chimneys === false) {
      throw new Error(
        `The "chimneys" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const chimneys = variantJSON.chimneys ?? false;

    // Validate the "sudoku" property. If it is not specified, assume false (e.g. cluing ranks in
    // this variant works normally).
    if (variantJSON.sudoku === false) {
      throw new Error(
        `The "sudoku" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const sudoku = variantJSON.sudoku ?? false;

    // Validate the "stackSize" property. If it is not specified, assume 5.
    if (variantJSON.stackSize === DEFAULT_FINISHED_STACK_LENGTH) {
      throw new Error(
          `The "stackSize" property for the variant "${variantJSON.name}" must not be set to ${DEFAULT_FINISHED_STACK_LENGTH}. If it is intended to be ${DEFAULT_FINISHED_STACK_LENGTH}, then remove the property altogether.`,
      );
    }
    if (variantJSON.stackSize !== undefined && !isValidBasicRank(variantJSON.stackSize)) {

    }
    const stackSize = variantJSON.stackSize ?? DEFAULT_FINISHED_STACK_LENGTH;

    // ------------------------
    // `VariantJSON` properties
    // ------------------------

    // Validate the ID. (The first variant has an ID of 0.)
    if (variantJSON.id < 0) {
      throw new Error(`The "${name}" variant has an invalid ID.`);
    }
    const { id } = variantJSON;

    // Validate the new ID.
    if (variantJSON.newID === "") {
      throw new Error(`The "${name}" variant has a blank "newID" property.`);
    }
    const { newID } = variantJSON;

    // -----------------------------
    // Computed `Variant` properties
    // -----------------------------

    // Derive the ranks that the cards of each suit will be.
    const ranks: Rank[] = [...DEFAULT_CARD_RANKS].slice(0, stackSize);
    if (upOrDown) {
      // The "Up or Down" variants have START cards.
      ranks.push(START_CARD_RANK);
    }

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
    variants.set(variantJSON.name, variant);
  }

  return variants;
}

function getVariantClueColors(
  variantJSON: VariantJSON,
  COLORS: ReadonlyMap<string, Color>,
  suits: readonly Suit[],
): readonly Color[] {
  // If the clue colors were not specified in the JSON, derive them from the suits.
  if (variantJSON.clueColors === undefined) {
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
  return variantJSON.clueColors.map((colorString) => {
    const color = COLORS.get(colorString);
    assertDefined(
      color,
      `The "${variantJSON.name}" variant has a clue color of "${colorString}", which does not exist.`,
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
