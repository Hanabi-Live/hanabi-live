import { assertDefined, assertEnumValue } from "complete-common";
import { ALL_RESERVED_NOTES } from "./abbreviations";
import { SUIT_REVERSED_SUFFIX } from "./constants";
import { Pip } from "./enums/Pip";
import type { Color } from "./interfaces/Color";
import type { Suit } from "./interfaces/Suit";
import type { SuitJSON } from "./interfaces/SuitJSON";
import suitsJSON from "./json/suits.json";

export function suitsInit(
  COLORS: ReadonlyMap<string, Color>,
): ReadonlyMap<string, Suit> {
  const suits = new Map<string, Suit>();

  if (suitsJSON.length === 0) {
    throw new Error('The "suits.json" file did not have any elements in it.');
  }

  for (const suitJSON of suitsJSON) {
    // Validate the "name" property.
    if (suitJSON.name === "") {
      throw new Error(
        'There is a suit with an empty name in the "suits.json" file.',
      );
    }
    const { name } = suitJSON;

    // Validate the "id" property.
    if (suitJSON.id === "") {
      throw new Error(`The "${suitJSON.name}" suit has an empty id.`);
    }
    const { id } = suitJSON;

    // Validate the "pip" property.
    const { pip } = suitJSON;
    if (pip !== "none" && pip !== "auto") {
      assertEnumValue(
        pip,
        Pip,
        `The "${suitJSON.name}" suit has an invalid pip of: ${pip}`,
      );
    }

    // If the abbreviation for the suit is not specified, use the abbreviation of the color with the
    // same name. Otherwise, assume that it is the first letter of the suit.
    let { abbreviation } = suitJSON;
    if (abbreviation === undefined) {
      const color = COLORS.get(name);
      abbreviation = color === undefined ? name.charAt(0) : color.abbreviation;
    }

    // Validate the abbreviation.
    if (abbreviation.length !== 1) {
      throw new Error(
        `The "${suitJSON.name}" suit has an abbreviation of "${abbreviation}" that is not one letter long.`,
      );
    }
    if (abbreviation !== abbreviation.toUpperCase()) {
      throw new Error(
        `The "${suitJSON.name}" suit has an abbreviation of "${abbreviation}" that is not an uppercase letter.`,
      );
    }
    if (ALL_RESERVED_NOTES.has(abbreviation.toLowerCase())) {
      throw new Error(
        `The "${suitJSON.name}" suit has an abbreviation of "${abbreviation}" that conflicts with a reserved note word.`,
      );
    }

    // Validate the "createVariants" property.
    if (suitJSON.createVariants === false) {
      throw new Error(
        `The "createVariants" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const createVariants = suitJSON.createVariants ?? false;

    // Validate the "displayName" property.
    if (suitJSON.displayName === "") {
      throw new Error(
        'There is a suit with an empty display name in the "suits.json" file.',
      );
    }

    // The display name is optional; if not specified, then use the normal suit name.
    const displayName = suitJSON.displayName ?? suitJSON.name;

    // Validate the clue colors (the colors that touch this suit) and convert the string array to a
    // color object array. If the clue colors are not specified, use the color of the same name.
    // (This has to be before the fill validation.)
    const clueColors = getSuitClueColors(suitJSON, COLORS);

    // Validate the fill.
    const { fill, fillColorblind } = getSuitFillAndFillColorblind(
      suitJSON,
      COLORS,
      clueColors,
    );

    // Validate the fill colors.
    if (suitJSON.fillColors !== undefined && suitJSON.fillColors.length === 0) {
      throw new Error(
        `The "fillColors" array for the suit "${suitJSON.name}" is empty.`,
      );
    }
    const fillColors = suitJSON.fillColors ?? [];

    // Validate optional gameplay modification properties. If these are not specified, the suit
    // functions normally.
    if (suitJSON.oneOfEach === false) {
      throw new Error(
        `The "oneOfEach" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const oneOfEach = suitJSON.oneOfEach ?? false;

    if (suitJSON.allClueColors === false) {
      throw new Error(
        `The "allClueColors" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const allClueColors = suitJSON.allClueColors ?? false;

    if (suitJSON.noClueColors === false) {
      throw new Error(
        `The "noClueColors" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const noClueColors = suitJSON.noClueColors ?? false;

    if (suitJSON.allClueRanks === false) {
      throw new Error(
        `The "allClueRanks" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const allClueRanks = suitJSON.allClueRanks ?? false;

    if (suitJSON.noClueRanks === false) {
      throw new Error(
        `The "noClueRanks" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const noClueRanks = suitJSON.noClueRanks ?? false;

    if (suitJSON.prism === false) {
      throw new Error(
        `The "prism" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const prism = suitJSON.prism ?? false;

    if (suitJSON.inverted === false) {
      throw new Error(
        `The "inverted" property for the suit "${suitJSON.name}" must be set to true. If it is intended to be false, then remove the property altogether.`,
      );
    }
    const inverted = suitJSON.inverted ?? false;

    // Construct the suit object and add it to the map.
    const suit: Suit = {
      // Mandatory properties
      name,
      id,
      pip,

      // Optional properties
      abbreviation,
      createVariants,
      displayName,
      fill,
      fillColorblind,
      fillColors,

      // Optional gameplay modification properties.
      oneOfEach,
      clueColors,
      allClueColors,
      noClueColors,
      allClueRanks,
      noClueRanks,
      prism,
      inverted,

      reversed: false,
    };
    suits.set(suitJSON.name, suit);

    // Additionally, add the reversed version of this suit.
    const suitReversed: Suit = {
      ...suit,
      reversed: true,
    };
    suits.set(suitJSON.name + SUIT_REVERSED_SUFFIX, suitReversed);
  }

  return suits;
}

function getSuitClueColors(
  suitJSON: SuitJSON,
  COLORS: ReadonlyMap<string, Color>,
): readonly Color[] {
  if (suitJSON.clueColors !== undefined) {
    // Convert the color name strings to color objects.
    return suitJSON.clueColors.map((colorName) => {
      const color = COLORS.get(colorName);
      assertDefined(
        color,
        `The clue color "${colorName}" for the suit "${suitJSON.name}" does not exist.`,
      );

      return color;
    });
  }

  // The "Unknown" suit is not supposed to have clue colors.
  if (suitJSON.name === "Unknown") {
    return [];
  }

  // Some special suits do not have clue colors explicitly assigned to them.
  if (
    suitJSON.allClueColors === true
    || suitJSON.noClueColors === true
    || suitJSON.prism === true
  ) {
    return [];
  }

  // The clue colors were not specified; by default, use the color of the same name.
  const color = COLORS.get(suitJSON.name);
  if (color !== undefined) {
    return [color];
  }

  throw new Error(
    `Failed to derive the clue colors for the "${suitJSON.name}" suit. (There is no corresponding color named "${suitJSON.name}".)`,
  );
}

/**
 * If the fill is not specified, use the fill of the color with the same name (specifically, the
 * same display name, in the case of a dual-color suit). Otherwise, assume the fill of the first
 * clue color. (For example, "Red" does not have any clue colors specified, so the intermediate
 * condition is necessary.)
 *
 * We also need to compute a "fillColorblind" property for the suit.
 */
function getSuitFillAndFillColorblind(
  suitJSON: SuitJSON,
  COLORS: ReadonlyMap<string, Color>,
  clueColors: readonly Color[],
): {
  fill: string;
  fillColorblind: string;
} {
  if (suitJSON.fill === "") {
    throw new Error(
      `The fill property was empty for the "${suitJSON.name}" suit. Perhaps it should be removed entirely from the "suits.json" file?`,
    );
  }

  if (suitJSON.fill !== undefined) {
    return {
      fill: suitJSON.fill,
      fillColorblind: suitJSON.fill,
    };
  }

  /**
   * For example, for the "Purple D" dual-color suit, we need to check for the existence of the
   * "Purple" color so that it can match.
   */
  const potentialMatchingColorName = suitJSON.displayName ?? suitJSON.name;
  const color = COLORS.get(potentialMatchingColorName);
  if (color !== undefined) {
    // The "fill" and the "fillColorblind" properties are validated to not be empty in
    // "colorsInit.ts".
    return {
      fill: color.fill,
      fillColorblind: color.fillColorblind,
    };
  }

  const firstClueColor = clueColors[0];
  if (firstClueColor !== undefined) {
    // The "fill" and the "fillColorblind" properties are validated to not be empty in
    // "colorsInit.ts".
    return {
      fill: firstClueColor.fill,
      fillColorblind: firstClueColor.fillColorblind,
    };
  }

  throw new Error(
    `Failed to find the fill for the "${suitJSON.name}" suit. (There is no corresponding color named "${suitJSON.name}" and this suit has no clue colors specified.)`,
  );
}
