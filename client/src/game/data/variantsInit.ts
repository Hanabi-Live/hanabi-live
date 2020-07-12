import variantsJSON from '../../../../data/variants.json';
import Color from '../types/Color';
import Suit from '../types/Suit';
import Variant from '../types/Variant';

interface VariantJSON {
  id: number;
  suits: string[];

  clueColors?: string[];
  clueRanks?: number[];
  colorCluesTouchNothing?: boolean;
  rankCluesTouchNothing?: boolean;
  specialRank?: number;
  specialAllClueColors?: boolean;
  specialAllClueRanks?: boolean;
  specialNoClueColors?: boolean;
  specialNoClueRanks?: boolean;

  showSuitNames?: boolean;
  spacing?: boolean;
}
type VariantEntryIterable = Iterable<[keyof (typeof variantsJSON), VariantJSON]>;

export default function variantsInit(
  COLORS: Map<string, Color>,
  SUITS: Map<string, Suit>,
  START_CARD_RANK: number,
) {
  const VARIANTS = new Map<string, Variant>();

  for (const [variantName, variantJSON] of Object.entries(variantsJSON) as VariantEntryIterable) {
    // Validate the name
    const name: string = variantName;
    if (name === '') {
      throw new Error('There is a variant with an empty name in the "variants.json" file.');
    }

    // Validate the ID
    const id: number = variantJSON.id;
    if (id < 0) {
      throw new Error(`The "${name}" variant has an invalid ID.`);
    }

    // Validate the suits
    if (!Object.hasOwnProperty.call(variantJSON, 'suits')) {
      throw new Error(`The "${name}" variant does not have suits.`);
    }
    if (!Array.isArray(variantJSON.suits)) {
      throw new Error(`The suits for the variant "${name}" were not specified as an array.`);
    }
    if (variantJSON.suits.length === 0) {
      throw new Error(`The suits for the variant "${name}" is empty.`);
    }

    // The suits are specified as an array of strings
    // Convert the strings to objects
    const suits: Suit[] = [];
    for (const suitString of variantJSON.suits) {
      if (typeof suitString !== 'string') {
        throw new Error(`One of the suits for the variant "${name}" was not specified as a string.`);
      }

      const suitObject = SUITS.get(suitString);
      if (typeof suitObject !== 'undefined') {
        suits.push(suitObject);
      } else {
        throw new Error(`The suit "${suitString}" in the variant "${name}" does not exist.`);
      }
    }

    // Derive the ranks (the ranks that the cards of each suit will be)
    // By default, assume ranks 1 through 5
    const ranks = [1, 2, 3, 4, 5];
    if (name.startsWith('Up or Down')) {
      // The "Up or Down" variants have START cards
      ranks.push(START_CARD_RANK);
    }

    // Validate the clue colors (the colors available to clue in this variant)
    const clueColors: Color[] = [];
    if (Object.hasOwnProperty.call(variantJSON, 'clueColors')) {
      if (!Array.isArray(variantJSON.clueColors)) {
        throw new Error(`The clue colors for the variant "${name}" were not specified as an array.`);
      }

      // The clue colors are specified as an array of strings
      // Convert the strings to objects
      for (const colorString of variantJSON.clueColors!) {
        if (typeof colorString !== 'string') {
          throw new Error(`One of the clue colors for the variant "${name}" was not specified as a string.`);
        }

        const colorObject = COLORS.get(colorString);
        if (typeof colorObject !== 'undefined') {
          clueColors.push(colorObject);
        } else {
          throw new Error(`The color "${colorString}" in the variant "${name}" does not exist.`);
        }
      }
    } else {
      // The clue colors were not specified in the JSON, so derive them from the suits
      for (const suit of suits) {
        if (suit.allClueColors) {
          // If a suit is touched by all colors, then we don't want to add
          // every single clue color to the variant clue list
          continue;
        }
        for (const color of suit.clueColors) {
          if (!clueColors.includes(color)) {
            clueColors.push(color);
          }
        }
      }
    }

    // Validate the clue ranks (the ranks available to clue in this variant)
    // If it is not specified, assume that players can clue ranks 1 through 5
    const clueRanks: number[] = variantJSON.clueRanks || [1, 2, 3, 4, 5];

    // Validate the "colorCluesTouchNothing" property
    // If it is not specified, assume false (e.g. cluing colors in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'colorCluesTouchNothing')
      && variantJSON.colorCluesTouchNothing !== true
    ) {
      throw new Error(`The "colorCluesTouchNothing" property for the variant "${variantName}" must be set to true.`);
    }
    const colorCluesTouchNothing: boolean = variantJSON.colorCluesTouchNothing ?? false;

    // Validate the "rankCluesTouchNothing" property
    // If it is not specified, assume false (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'rankCluesTouchNothing')
      && variantJSON.rankCluesTouchNothing !== true
    ) {
      throw new Error(`The "rankCluesTouchNothing" property for the variant "${variantName}" must be set to true.`);
    }
    const rankCluesTouchNothing: boolean = variantJSON.rankCluesTouchNothing ?? false;

    // Validate the "specialRank" property (e.g. for "Rainbow-Ones")
    // If it is not specified, assume -1 (e.g. there are no special ranks)
    if (
      Object.hasOwnProperty.call(variantJSON, 'specialRank')
      && (variantJSON.specialRank! < 1 || variantJSON!.specialRank! > 5)
    ) {
      throw new Error(`The "specialRank" property for the variant "${variantName}" must be set to true.`);
    }
    const specialRank: number = variantJSON.specialRank ?? -1;

    // Validate the "specialAllClueColors" property
    // If it is not specified, assume false (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'specialAllClueColors')
      && variantJSON.specialAllClueColors !== true
    ) {
      throw new Error(`The "specialAllClueColors" property for the variant "${variantName}" must be set to true.`);
    }
    const specialAllClueColors: boolean = variantJSON.specialAllClueColors ?? false;

    // Validate the "specialAllClueRanks" property
    // If it is not specified, assume false (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'specialAllClueRanks')
      && variantJSON.specialAllClueRanks !== true
    ) {
      throw new Error(`The "specialAllClueRanks" property for the variant "${variantName}" must be set to true.`);
    }
    const specialAllClueRanks: boolean = variantJSON.specialAllClueRanks ?? false;

    // Validate the "specialNoClueColors" property
    // If it is not specified, assume false (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'specialNoClueColors')
      && variantJSON.specialNoClueColors !== true
    ) {
      throw new Error(`The "specialNoClueColors" property for the variant "${variantName}" must be set to true.`);
    }
    const specialNoClueColors: boolean = variantJSON.specialNoClueColors ?? false;

    // Validate the "specialNoClueRanks" property
    // If it is not specified, assume false (e.g. cluing ranks in this variant works normally)
    if (
      Object.hasOwnProperty.call(variantJSON, 'specialNoClueRanks')
      && variantJSON.specialNoClueRanks !== true
    ) {
      throw new Error(`The "specialNoClueRanks" property for the variant "${variantName}" must be set to true.`);
    }
    const specialNoClueRanks: boolean = variantJSON.specialNoClueRanks ?? false;

    // Validate the "showSuitNames" property
    // If it is not specified, assume that we are not showing the suit names
    if (
      Object.hasOwnProperty.call(variantJSON, 'showSuitNames')
      && variantJSON.showSuitNames !== true
    ) {
      throw new Error(`The "showSuitNames" property for the variant "${variantName}" must be set to true.`);
    }
    let showSuitNames: boolean = variantJSON.showSuitNames ?? false;

    // Always set "showSuitNames" to true if it has one or more reversed suits
    for (const suit of suits) {
      if (suit.reversed) {
        showSuitNames = true;
        break;
      }
    }

    // Validate the "spacing" property
    // If it is not specified, assume that there is no spacing
    if (
      Object.hasOwnProperty.call(variantJSON, 'spacing')
      && variantJSON.spacing !== true
    ) {
      throw new Error(`The "spacing" property for the variant "${variantName}" must be set to true.`);
    }
    const spacing: boolean = variantJSON.spacing ?? false;

    // Assume 5 cards per stack
    const maxScore = suits.length * 5;

    // Variants with dual-color suits need to adjust the positions of elements in the corner
    // of the card (e.g. the note indicator) because it will overlap with the triangle that
    // shows the color composition of the suit
    const offsetCornerElements = suits.some((suit: Suit) => suit.clueColors.length > 1);

    // Add it to the map
    const variant: Variant = {
      name,
      id,
      suits,
      ranks,
      clueColors,
      clueRanks,
      colorCluesTouchNothing,
      rankCluesTouchNothing,
      specialRank,
      specialAllClueColors,
      specialAllClueRanks,
      specialNoClueColors,
      specialNoClueRanks,
      showSuitNames,
      spacing,
      maxScore,
      offsetCornerElements,
    };
    VARIANTS.set(variantName, variant);
  }

  return VARIANTS;
}
