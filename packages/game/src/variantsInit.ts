import { assertDefined, parseIntSafe } from "complete-common";
import { getUppercaseSuitAbbreviationsForVariant } from "./abbreviations.ts";
import {
  DEFAULT_CLUE_RANKS,
  DEFAULT_FINISHED_STACK_LENGTH,
} from "./constants.ts";
import { Pip } from "./enums/Pip.ts";
import { DEFAULT_CARD_RANKS, START_CARD_RANK } from "./generated/protocol.ts";
import type { Color } from "./interfaces/Color.ts";
import type { Suit } from "./interfaces/Suit.ts";
import type { Variant } from "./interfaces/Variant.ts";
import type { VariantDescription } from "./interfaces/VariantDescription.ts";
import type { VariantJSON } from "./interfaces/VariantJSON.ts";
import variantsJSON from "./json/variants.json" with { type: "json" };
import { getIdentityNotePatternForVariant } from "./notes.ts";
import type { Rank } from "./types/Rank.ts";

const AUTO_PIP_PRIORITY = [
  Pip.hanabiRed1,
  Pip.hanabiYellow2,
  Pip.hanabiGreen3,
  Pip.hanabiBlue4,
  Pip.hanabiWhite5,
  Pip.hanabiAltWhite6,
] as const;

export function variantsInit(
  colorsMap: ReadonlyMap<string, Color>,
  suitsMap: ReadonlyMap<string, Suit>,
): ReadonlyMap<string, Variant> {
  const variants = new Map<string, Variant>();

  // A test validates the file against the server's catalog contract.
  for (const variantJSON of variantsJSON as readonly VariantJSON[]) {
    const { id, newID } = variantJSON;
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
  // Fields are validated in the order that they appear in `CatalogVariant` (in
  // "server/protocol/src/lib.rs").

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

  // The ranks available to clue in this variant. If it is not specified, assume that players can
  // clue the normal ranks.
  const clueRanks = variantDescription.clueRanks ?? [...DEFAULT_CLUE_RANKS];

  // The catalog omits the default stack size.
  const stackSize =
    variantDescription.stackSize ?? DEFAULT_FINISHED_STACK_LENGTH;

  // -----------------------------------------------
  // Special variant properties (from `VariantJSON`)
  // -----------------------------------------------

  // If "clueStarved" is not specified, assume false.
  const clueStarved = variantDescription.clueStarved ?? false;

  // If "colorCluesTouchNothing" is not specified, assume false (e.g. cluing colors in this variant
  // works normally).
  const colorCluesTouchNothing =
    variantDescription.colorCluesTouchNothing ?? false;

  // If "rankCluesTouchNothing" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const rankCluesTouchNothing =
    variantDescription.rankCluesTouchNothing ?? false;

  // If "alternatingClues" is not specified, assume false.
  const alternatingClues = variantDescription.alternatingClues ?? false;

  // If "cowAndPig" is not specified, assume false.
  const cowAndPig = variantDescription.cowAndPig ?? false;

  // If "duck" is not specified, assume false.
  const duck = variantDescription.duck ?? false;

  // If "oddsAndEvens" is not specified, assume false (e.g. cluing ranks in this variant works
  // normally).
  const oddsAndEvens = variantDescription.oddsAndEvens ?? false;

  // If "synesthesia" is not specified, assume false.
  const synesthesia = variantDescription.synesthesia ?? false;

  // If "upOrDown" is not specified, assume false.
  const upOrDown = variantDescription.upOrDown ?? false;

  // If "throwItInAHole" is not specified, assume false.
  const throwItInAHole = variantDescription.throwItInAHole ?? false;

  // If "funnels" is not specified, assume false (e.g. cluing ranks in this variant works normally).
  const funnels = variantDescription.funnels ?? false;

  // If "chimneys" is not specified, assume false (e.g. cluing ranks in this variant works
  // normally).
  const chimneys = variantDescription.chimneys ?? false;

  // If "sudoku" is not specified, assume false (e.g. cluing ranks in this variant works normally).
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

  const pips: Pip[] = [];
  for (const suit of suits) {
    const { pip } = suit;
    if (pip === "none") {
      throw new Error(`The "${suit.name}" suit has no pip.`);
    }

    if (pip === "auto") {
      const match = AUTO_PIP_PRIORITY.find(
        (candidatePip) => !pips.includes(candidatePip),
      );
      assertDefined(
        match,
        `Failed to find an automatic pip for suit: ${suit.name}`,
      );
      pips.push(match);
    } else {
      pips.push(pip);
    }
  }

  // --------------------------------------------
  // Special rank properties (from `VariantJSON`)
  // --------------------------------------------

  // Validate the "specialRank" property (e.g. for "Rainbow-Ones"). If it is not specified, assume
  // `undefined` (e.g. there are no special ranks).
  if (
    variantDescription.specialRank !== undefined
    && !ranks.includes(variantDescription.specialRank)
  ) {
    throw new Error(
      `The "specialRank" property for the variant "${variantDescription.name}" is invalid: ${variantDescription.specialRank}`,
    );
  }
  const { specialRank } = variantDescription;

  // If "specialRankAllClueColors" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const specialRankAllClueColors =
    variantDescription.specialRankAllClueColors ?? false;

  // If "specialRankAllClueRanks" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const specialRankAllClueRanks =
    variantDescription.specialRankAllClueRanks ?? false;

  // If "specialRankNoClueColors" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const specialRankNoClueColors =
    variantDescription.specialRankNoClueColors ?? false;

  // If "specialRankNoClueRanks" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const specialRankNoClueRanks =
    variantDescription.specialRankNoClueRanks ?? false;

  // If "specialRankDeceptive" is not specified, assume false (e.g. cluing ranks in this variant
  // works normally).
  const specialRankDeceptive = variantDescription.specialRankDeceptive ?? false;

  // Validate the "criticalRank" property. If it is not specified, assume `undefined` (e.g. there
  // are no critical ranks).
  if (
    variantDescription.criticalRank !== undefined
    && !ranks.includes(variantDescription.criticalRank)
  ) {
    throw new Error(
      `The "criticalRank" property for the variant "${variantDescription.name}" is invalid: ${variantDescription.criticalRank}`,
    );
  }
  const { criticalRank } = variantDescription;

  // If "scarceOnes" is not specified, assume false (e.g. there is the usual number of ones per
  // suit).
  const scarceOnes = variantDescription.scarceOnes ?? false;

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

  // Use the variant metadata, not its name, to enable Up or Down note shorthands.
  const identityNotePattern = getIdentityNotePatternForVariant(
    suits,
    ranks,
    suitAbbreviations,
    upOrDown,
  );

  const hasInverted = suits.some((suit: Suit) => suit.inverted);

  // Add it to the map.
  const variant: Variant = {
    name,
    suits,
    ranks,
    pips,

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
    scarceOnes,
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
    hasInverted,

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

  // If a variant has a reversed suit, or in "Up or Down" and "Sudoku" variants, we want to show the
  // suit names so that the stack directions and status are easily identifiable.
  const variantHasReversedSuits = suits.some((suit: Suit) => suit.reversed);
  return variantHasReversedSuits || upOrDown || sudoku;
}
