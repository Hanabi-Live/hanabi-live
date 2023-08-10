import { parseIntSafe, trimSuffix } from "@hanabi/utils";
import { isEqual } from "lodash";
import {
  REVERSE_MODIFIER,
  SUIT_DELIMITER,
  SUIT_MODIFIERS,
  SUIT_MODIFIER_DELIMITER,
  SUIT_REVERSED_SUFFIX,
  VARIANT_DELIMITER,
} from "../constants";
import type { SuitJSON } from "../types/SuitJSON";
import type { VariantDescription } from "../types/VariantDescription";
import type { VariantJSON } from "../types/VariantJSON";
import { getSpecialClueRanks } from "./getVariantDescriptions";

export function getNewVariantID(
  variantDescription: VariantDescription,
  suitsNameMap: Map<string, SuitJSON>,
): string {
  const suitIDs = variantDescription.suits.map((suitName) =>
    getNewSuitID(suitName, suitsNameMap),
  );

  const suitsID = suitIDs.join(SUIT_DELIMITER);

  const specialVariantIDSuffixes =
    getSpecialVariantIDSuffixes(variantDescription);
  if (specialVariantIDSuffixes.length === 0) {
    return suitsID;
  }

  const variantSuffix = specialVariantIDSuffixes.join(VARIANT_DELIMITER);
  return `${suitsID}${VARIANT_DELIMITER}${variantSuffix}`;
}

function getNewSuitID(
  suitName: string,
  suitsNameMap: Map<string, SuitJSON>,
): string {
  // Reversed suits are a special case; they have an "R" appended to the non-reversed suit id.
  if (suitName.endsWith(SUIT_REVERSED_SUFFIX)) {
    const normalSuitName = trimSuffix(suitName, SUIT_REVERSED_SUFFIX);
    const suit = suitsNameMap.get(normalSuitName);
    if (suit === undefined) {
      throw new Error(
        `Failed to find the non-reversed suit ID for suit: ${suitName}`,
      );
    }

    return `${suit.id}${SUIT_MODIFIER_DELIMITER}R`;
  }

  const suit = suitsNameMap.get(suitName);
  if (suit === undefined) {
    throw new Error(`Failed to find the suit ID for suit: ${suitName}`);
  }

  return suit.id;
}

function getSpecialVariantIDSuffixes(
  variantDescription: VariantDescription,
): string[] {
  const variantIDSuffixes: string[] = [];

  // Suit-Ones / Suit-Fives

  if (variantDescription.specialRank !== undefined) {
    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`R${variantDescription.specialRank}`); // Rainbow
    }

    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`P${variantDescription.specialRank}`); // Pink
    }

    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`W${variantDescription.specialRank}`); // White
    }

    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`B${variantDescription.specialRank}`); // Brown
    }

    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`O${variantDescription.specialRank}`); // Omni
    }

    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`N${variantDescription.specialRank}`); // Null
    }

    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`M${variantDescription.specialRank}`); // Muddy Rainbow
    }

    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(`L${variantDescription.specialRank}`); // Light Pink
    }

    // Deceptive-Ones / Deceptive-Fives
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive === true
    ) {
      variantIDSuffixes.push(`D${variantDescription.specialRank}`); // Deceptive
    }
  }

  return variantIDSuffixes;
}

export function validateNewVariantIDs(
  variantsJSON: VariantJSON[],
  suitsIDMap: Map<string, SuitJSON>,
): void {
  const newVariantIDs = new Set();

  for (const variantJSON of variantsJSON) {
    if (variantJSON.newID === "") {
      throw new Error(
        `Variant "${variantJSON.name}" is missing a "newID" property.`,
      );
    }

    /*
    if (newVariantIDs.has(variantJSON.newID)) {
      throw new Error(
        `Variant "${variantJSON.name}" has a duplicate "newID" property of: ${variantJSON.newID}`,
      );
    }
    */

    newVariantIDs.add(variantJSON.newID);

    const reconstructedVariant = getVariantFromNewID(
      variantJSON.newID,
      variantJSON.name,
      variantJSON.id,
      suitsIDMap,
    );

    if (!isEqual(variantJSON, reconstructedVariant)) {
      /*
      console.error("--------------------------------------------------------");
      console.error("variantJSON:", variantJSON);
      console.error("--------------------------------------------------------");
      console.error("reconstructedVariant:", reconstructedVariant);
      console.error("--------------------------------------------------------");
      throw new Error(
        `Variant "${variantJSON.name}" has a new ID of "${variantJSON.newID}" that was parsed incorrectly. (See the previous object logs.)`,
      );
      */
    }
  }
}

/**
 * This function is only used for validation.
 *
 * It cannot compute the name or the old ID, so those must be provided.
 */
function getVariantFromNewID(
  newID: string,
  name: string,
  oldID: number,
  suitsIDMap: Map<string, SuitJSON>,
): VariantJSON {
  const [suitsString, ...variantModifiers] = newID.split(VARIANT_DELIMITER);
  if (suitsString === undefined) {
    throw new Error(
      `Failed to parse the suits string from the variant ID of: ${newID}`,
    );
  }

  const suitIDsWithModifiers = suitsString.split(SUIT_DELIMITER);
  const suits = getSuitNamesFromSuitID(suitIDsWithModifiers, suitsIDMap);

  const variant: VariantJSON = {
    name,
    id: oldID,
    newID,
    suits,
  };

  for (const suitIDWithModifiers of suitIDsWithModifiers) {
    const [suitID] = splitSuitID(suitIDWithModifiers);
    if (suitID === undefined) {
      throw new Error(
        `Failed to parse the base suit ID from the suit ID of: ${suitIDWithModifiers}`,
      );
    }

    const suit = suitsIDMap.get(suitID);
    if (suit === undefined) {
      throw new Error(`Failed to find a suit with an ID of: ${suitID}`);
    }

    if (suit.showSuitName === true) {
      variant.showSuitNames = true;
    }
  }

  for (const variantModifier of variantModifiers) {
    const secondCharacter = variantModifier[1];
    if (secondCharacter === undefined) {
      throw new Error(
        `Failed to get the second character of the variant modifier for variant "${name}" with a "newID" of "${newID}" and a variant modifier of "${variantModifier}".`,
      );
    }

    const secondCharacterNumber = parseIntSafe(secondCharacter);
    const specialRank = Number.isNaN(secondCharacterNumber)
      ? undefined
      : secondCharacterNumber;

    switch (variantModifier) {
      // Rainbow-Ones / Rainbow-Fives
      case "R1":
      case "R2":
      case "R3":
      case "R4":
      case "R5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        break;
      }

      // Pink-Ones / Pink-Fives
      case "P1":
      case "P2":
      case "P3":
      case "P4":
      case "P5": {
        variant.specialRank = specialRank;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // White-Ones / White-Fives
      case "W1":
      case "W2":
      case "W3":
      case "W4":
      case "W5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        break;
      }

      // Brown-Ones / Brown-Fives
      case "B1":
      case "B2":
      case "B3":
      case "B4":
      case "B5": {
        variant.specialRank = specialRank;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Omni-Ones / Omni-Fives
      case "O1":
      case "O2":
      case "O3":
      case "O4":
      case "O5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Null-Ones / Null-Fives
      case "N1":
      case "N2":
      case "N3":
      case "N4":
      case "N5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Muddy-Rainbow-Ones / Muddy-Rainbow-Fives
      case "M1":
      case "M2":
      case "M3":
      case "M4":
      case "M5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Light-Pink-Ones / Light-Pink-Fives
      case "L1":
      case "L2":
      case "L3":
      case "L4":
      case "L5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Deceptive-Ones / Deceptive-Fives
      case "D1":
      case "D2":
      case "D3":
      case "D4":
      case "D5": {
        variant.specialRank = specialRank;
        variant.specialDeceptive = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Critical 4's
      case "C1":
      case "C2":
      case "C3":
      case "C4":
      case "C5": {
        variant.criticalRank = specialRank;
        break;
      }

      // Clue Starved
      case "CS": {
        variant.clueStarved = true;
        break;
      }

      // Color Blind
      case "CB": {
        variant.colorCluesTouchNothing = true;
        break;
      }

      // Number Blind
      case "NB": {
        variant.rankCluesTouchNothing = true;
        break;
      }

      // Totally Blind
      case "TB": {
        variant.colorCluesTouchNothing = true;
        variant.rankCluesTouchNothing = true;
        break;
      }

      // Color Mute
      case "CM": {
        variant.clueColors = [];
        break;
      }

      // Number Mute
      case "NM": {
        variant.clueRanks = [];
        break;
      }

      // Alternating Clues
      case "AC": {
        variant.alternatingClues = true;
        break;
      }

      // Cow & Pig
      case "CP": {
        variant.cowAndPig = true;
        break;
      }

      // Duck
      case "Du": {
        variant.duck = true;
        break;
      }

      // Odds and Evens
      case "OE": {
        variant.oddsAndEvens = true;
        variant.clueRanks = [1, 2];
        break;
      }

      // Synesthesia
      case "Sy": {
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      }

      // Up or Down
      case "UD": {
        variant.upOrDown = true;
        variant.showSuitNames = true;
        break;
      }

      // Throw It in a Hole.
      case "TH": {
        variant.throwItInAHole = true;
        break;
      }

      // Funnels
      case "FU": {
        variant.funnels = true;
        break;
      }

      // Chimneys
      case "CH": {
        variant.chimneys = true;
        break;
      }

      default: {
        throw new Error(
          `Unknown variant modifier "${variantModifier}" in variant ID: ${newID}`,
        );
      }
    }

    if (variant.specialRank === 0) {
      throw new Error(
        "Failed to parse the special rank from the variant modifier.",
      );
    }
  }

  return variant;
}

function getSuitNamesFromSuitID(
  suitIDsWithModifiers: string[],
  suitsIDMap: Map<string, SuitJSON>,
) {
  return suitIDsWithModifiers.map((suitIDWithModifiers) => {
    const [suitID, ...modifiers] = splitSuitID(suitIDWithModifiers);

    const suit = suitsIDMap.get(suitID!);
    if (suit === undefined) {
      throw new Error(`Failed to find a suit with an ID of: ${suitID}`);
    }

    for (const modifier of modifiers) {
      if (!SUIT_MODIFIERS.has(modifier)) {
        throw new Error(
          `Suit "${suit.name}" has an unknown modifier of "${modifier}" in the suit ID of: ${suitIDWithModifiers}`,
        );
      }
    }

    const hasReverseModifier = modifiers.includes(REVERSE_MODIFIER);
    return hasReverseModifier ? suit.name + SUIT_REVERSED_SUFFIX : suit.name;
  });
}

function splitSuitID(suitIDWithModifiers: string) {
  return suitIDWithModifiers.split(SUIT_MODIFIER_DELIMITER);
}
