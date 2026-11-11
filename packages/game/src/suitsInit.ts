import { assertDefined, assertEnumValue } from "complete-common";
import { ALL_RESERVED_NOTES } from "./abbreviations.ts";
import { SUIT_REVERSED_SUFFIX, UNKNOWN_SUIT_NAME } from "./constants.ts";
import { Pip } from "./enums/Pip.ts";
import type { Color } from "./interfaces/Color.ts";
import type { Suit } from "./interfaces/Suit.ts";
import type { SuitJson } from "./interfaces/SuitJson.ts";
import suitsJson from "./json/suits.json" with { type: "json" };

export function suitsInit(
  COLORS: ReadonlyMap<string, Color>,
): ReadonlyMap<string, Suit> {
  const suits = new Map<string, Suit>();

  // A test validates the file against the server's catalog contract.
  for (const suitJson of suitsJson as readonly SuitJson[]) {
    const { name, id, pip } = suitJson;

    // Validate the "pip" property.
    if (pip !== "none" && pip !== "auto") {
      assertEnumValue(
        pip,
        Pip,
        `The "${suitJson.name}" suit has an invalid pip of: ${pip}`,
      );
    }

    // If the abbreviation for the suit is not specified, use the abbreviation of the color with the
    // same name. Otherwise, assume that it is the first letter of the suit.
    let { abbreviation } = suitJson;
    if (abbreviation === undefined) {
      const color = COLORS.get(name);
      abbreviation = color === undefined ? name.charAt(0) : color.abbreviation;
    }

    // Validate the abbreviation.
    if (abbreviation !== abbreviation.toUpperCase()) {
      throw new Error(
        `The "${suitJson.name}" suit has an abbreviation of "${abbreviation}" that is not an uppercase letter.`,
      );
    }
    if (ALL_RESERVED_NOTES.has(abbreviation.toLowerCase())) {
      throw new Error(
        `The "${suitJson.name}" suit has an abbreviation of "${abbreviation}" that conflicts with a reserved note word.`,
      );
    }

    const createVariants = suitJson.createVariants ?? false;

    // The display name is optional; if not specified, then use the normal suit name.
    const displayName = suitJson.displayName ?? suitJson.name;

    // Validate the clue colors (the colors that touch this suit) and convert the string array to a
    // color object array. If the clue colors are not specified, use the color of the same name.
    // (This has to be before the fill validation.)
    const clueColors = getSuitClueColors(suitJson, COLORS);

    // Validate the fill.
    const { fill, fillColorblind } = getSuitFillAndFillColorblind(
      suitJson,
      COLORS,
      clueColors,
    );

    const fillColors = suitJson.fillColors ?? [];

    // Optional gameplay modification properties. If these are not specified, the suit functions
    // normally.
    const oneOfEach = suitJson.oneOfEach ?? false;
    const allClueColors = suitJson.allClueColors ?? false;
    const noClueColors = suitJson.noClueColors ?? false;
    const allClueRanks = suitJson.allClueRanks ?? false;
    const noClueRanks = suitJson.noClueRanks ?? false;
    const prism = suitJson.prism ?? false;
    const inverted = suitJson.inverted ?? false;

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
    suits.set(suitJson.name, suit);

    // Additionally, add the reversed version of this suit.
    const suitReversed: Suit = {
      ...suit,
      reversed: true,
    };
    suits.set(suitJson.name + SUIT_REVERSED_SUFFIX, suitReversed);
  }

  return suits;
}

function getSuitClueColors(
  suitJson: SuitJson,
  COLORS: ReadonlyMap<string, Color>,
): readonly Color[] {
  if (suitJson.clueColors !== undefined) {
    // Convert the color name strings to color objects.
    return suitJson.clueColors.map((colorName) => {
      const color = COLORS.get(colorName);
      assertDefined(
        color,
        `The clue color "${colorName}" for the suit "${suitJson.name}" does not exist.`,
      );

      return color;
    });
  }

  // The "Unknown" suit is not supposed to have clue colors, and some special suits do not have clue
  // colors explicitly assigned to them.
  if (
    suitJson.name === UNKNOWN_SUIT_NAME
    || suitJson.allClueColors === true
    || suitJson.noClueColors === true
    || suitJson.prism === true
  ) {
    return [];
  }

  // The clue colors were not specified; by default, use the color of the same name.
  const color = COLORS.get(suitJson.name);
  if (color !== undefined) {
    return [color];
  }

  throw new Error(
    `Failed to derive the clue colors for the "${suitJson.name}" suit. (There is no corresponding color named "${suitJson.name}".)`,
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
  suitJson: SuitJson,
  COLORS: ReadonlyMap<string, Color>,
  clueColors: readonly Color[],
): {
  fill: string;
  fillColorblind: string;
} {
  if (suitJson.fill !== undefined) {
    return {
      fill: suitJson.fill,
      fillColorblind: suitJson.fill,
    };
  }

  /**
   * For example, for the "Violet" dual-color suit, we need to check for the existence of the
   * "Purple" color so that it can match.
   */
  const potentialMatchingColorName = suitJson.displayName ?? suitJson.name;
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
    `Failed to find the fill for the "${suitJson.name}" suit. (There is no corresponding color named "${suitJson.name}" and this suit has no clue colors specified.)`,
  );
}
