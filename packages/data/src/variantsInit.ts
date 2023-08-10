import { getSuitAbbreviationsForVariant } from "./abbreviations";
import { DEFAULT_CARD_RANKS, DEFAULT_CLUE_RANKS } from "./constants";
import variantsJSON from "./json/variants.json";
import { getIdentityNotePatternForVariant } from "./notes";
import type { Color } from "./types/Color";
import type { Suit } from "./types/Suit";
import type { Variant } from "./types/Variant";
import type { VariantJSON } from "./types/VariantJSON";

export function variantsInit(
  COLORS: ReadonlyMap<string, Color>,
  SUITS: ReadonlyMap<string, Suit>,
  START_CARD_RANK: number,
): ReadonlyMap<string, Variant> {
  const variants = new Map<string, Variant>();

  if (variantsJSON.length === 0) {
    throw new Error(
      'The "variants.json" file did not have any elements in it.',
    );
  }

  for (const variantJSON of variantsJSON as VariantJSON[]) {
    // Validate the name.
    if (variantJSON.name === "") {
      throw new Error(
        'There is a variant with an empty name in the "variants.json" file.',
      );
    }
    const { name } = variantJSON;

    // Validate the ID. (The first variant has an ID of 0.)
    if (variantJSON.id < 0) {
      throw new Error(`The "${name}" variant has an invalid ID.`);
    }
    const { id } = variantJSON;

    // Validate the suits.
    if (variantJSON.suits.length === 0) {
      throw new Error(`The "${name}" variant has an empty suits array.`);
    }

    // The suits are specified as an array of strings. Convert the strings to objects.
    const suits = variantJSON.suits.map((suitName) => {
      const suit = SUITS.get(suitName);
      if (suit === undefined) {
        throw new Error(
          `The "${name}" variant has a "${suitName}" suit, which does not exist.`,
        );
      }

      return suit;
    });

    // Derive the ranks that the cards of each suit will be.
    const ranks: number[] = [...DEFAULT_CARD_RANKS];
    if (name.startsWith("Up or Down")) {
      // The "Up or Down" variants have START cards.
      ranks.push(START_CARD_RANK);
    }

    // Validate the clue colors (the colors available to clue in this variant) and convert the
    // string array to a color object array.
    const clueColors = getVariantClueColors(variantJSON, COLORS, suits);

    // Validate the clue ranks (the ranks available to clue in this variant). If it is not
    // specified, assume that players can clue ranks 1 through 5.
    const clueRanks = variantJSON.clueRanks ?? [...DEFAULT_CLUE_RANKS];

    // Validate the "specialRank" property (e.g. for "Rainbow-Ones"). If it is not specified, assume
    // -1 (e.g. there are no special ranks).
    if (
      variantJSON.specialRank !== undefined &&
      (variantJSON.specialRank < 1 || variantJSON.specialRank > 5)
    ) {
      throw new Error(
        `The "specialRank" property for the variant "${variantJSON.name}" must be between 1 and 5.`,
      );
    }
    const specialRank = variantJSON.specialRank ?? -1;

    // Validate the "specialAllClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialAllClueColors === false) {
      throw new Error(
        `The "specialAllClueColors" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialAllClueColors = variantJSON.specialAllClueColors ?? false;

    // Validate the "specialAllClueRanks" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialAllClueRanks === false) {
      throw new Error(
        `The "specialAllClueRanks" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialAllClueRanks = variantJSON.specialAllClueRanks ?? false;

    // Validate the "specialNoClueColors" property. If it is not specified, assume false (e.g.
    // cluing ranks in this variant works normally).
    if (variantJSON.specialNoClueColors === false) {
      throw new Error(
        `The "specialNoClueColors" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialNoClueColors = variantJSON.specialNoClueColors ?? false;

    // Validate the "specialNoClueRanks" property. If it is not specified, assume false (e.g. cluing
    // ranks in this variant works normally).
    if (variantJSON.specialNoClueRanks === false) {
      throw new Error(
        `The "specialNoClueRanks" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialNoClueRanks = variantJSON.specialNoClueRanks ?? false;

    // Validate the "specialDeceptive" property. If it is not specified, assume false (e.g. cluing
    // ranks in this variant works normally).
    if (variantJSON.specialDeceptive === false) {
      throw new Error(
        `The "specialDeceptive" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const specialDeceptive = variantJSON.specialDeceptive ?? false;

    // Validate the "oddsAndEvens" property. If it is not specified, assume false (e.g. cluing ranks
    // in this variant works normally).
    if (variantJSON.oddsAndEvens === false) {
      throw new Error(
        `The "oddsAndEvens" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const oddsAndEvens = variantJSON.oddsAndEvens ?? false;

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

    // Validate the "clueStarved" property. If it is not specified, assume false.
    if (variantJSON.clueStarved === false) {
      throw new Error(
        `The "clueStarved" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const clueStarved = variantJSON.clueStarved ?? false;

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
    const cowPig = variantJSON.cowAndPig ?? false;

    // Validate the "duck" property. If it is not specified, assume false.
    if (variantJSON.duck === false) {
      throw new Error(
        `The "duck" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const duck = variantJSON.duck ?? false;

    // Validate the "throwItInAHole" property. If it is not specified, assume false.
    if (variantJSON.throwItInAHole === false) {
      throw new Error(
        `The "throwItInAHole" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const throwItInAHole = variantJSON.throwItInAHole ?? false;

    // Validate the "upOrDown" property. If it is not specified, assume false.
    if (variantJSON.upOrDown === false) {
      throw new Error(
        `The "upOrDown" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const upOrDown = variantJSON.upOrDown ?? false;

    // Validate the "synesthesia" property. If it is not specified, assume false.
    if (variantJSON.synesthesia === false) {
      throw new Error(
        `The "synesthesia" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const synesthesia = variantJSON.synesthesia ?? false;

    // Validate the "criticalFours" property. If it is not specified, assume false.
    if (variantJSON.criticalFours === false) {
      throw new Error(
        `The "criticalFours" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const criticalFours = variantJSON.criticalFours ?? false;

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

    // Validate the "showSuitNames" property. If it is not specified, assume that we are not showing
    // the suit names.
    if (variantJSON.showSuitNames === false) {
      throw new Error(
        `The "showSuitNames" property for the variant "${variantJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    let showSuitNames = variantJSON.showSuitNames ?? false;

    const variantHasReversedSuits = suits.some((suit: Suit) => suit.reversed);
    if (variantHasReversedSuits) {
      showSuitNames = true;
    }

    // Assume 5 cards per stack.
    const maxScore = suits.length * 5;

    // Variants with dual-color suits need to adjust the positions of elements in the corner of the
    // card (e.g. the note indicator) because it will overlap with the triangle that shows the color
    // composition of the suit.
    const offsetCornerElements = suits.some(
      (suit: Suit) => suit.clueColors.length > 1,
    );

    // Prepare the abbreviations for each suit.
    const suitAbbreviations = getSuitAbbreviationsForVariant(name, suits);

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
      id,
      newID: "", // TODO
      suits,
      ranks,
      clueColors,
      clueRanks,

      specialRank,
      specialAllClueColors,
      specialAllClueRanks,
      specialNoClueColors,
      specialNoClueRanks,
      specialDeceptive,

      oddsAndEvens,
      funnels,
      chimneys,
      clueStarved,
      alternatingClues,
      cowAndPig: cowPig,
      duck,
      throwItInAHole,
      upOrDown,
      synesthesia,
      criticalFours,
      colorCluesTouchNothing,
      rankCluesTouchNothing,

      showSuitNames,
      maxScore,
      offsetCornerElements,
      suitAbbreviations,
      identityNotePattern,
    };
    variants.set(variantJSON.name, variant);
  }

  return variants;
}

function getVariantClueColors(
  variantJSON: VariantJSON,
  COLORS: ReadonlyMap<string, Color>,
  suits: Suit[],
): Color[] {
  // If the clue colors were not specified in the JSON, derive them from the suits.
  if (variantJSON.clueColors === undefined) {
    const clueColors: Color[] = [];

    for (const suit of suits) {
      if (suit.allClueColors) {
        // If a suit is touched by all colors, then we don't want to add every single clue color to
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
    if (color === undefined) {
      throw new Error(
        `The "${variantJSON.name}" variant has a clue color of "${colorString}", which does not exist.`,
      );
    }

    return color;
  });
}
