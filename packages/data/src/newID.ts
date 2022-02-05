import {
  getSpecialClueRanks,
  SUIT_REVERSED_SUFFIX,
} from "./getVariantDescriptions";
import { SuitJSON } from "./types/SuitJSON";
import { VariantJSON } from "./types/VariantJSON";
import { error, parseIntSafe } from "./util";

const VARIANT_DELIMITER = ":";
const SUIT_DELIMITER = "+";
const SUIT_MODIFIER_DELIMITER = "/";
const REVERSE_MODIFIER = "R";
const SUIT_MODIFIERS = new Set<string>([REVERSE_MODIFIER]);

export function getVariantFromNewID(
  newID: string,
  suitsIDMap: Map<string, SuitJSON>,
): VariantJSON {
  const [suitsString, ...variantModifiers] = newID.split(VARIANT_DELIMITER);
  const suitIDsWithModifiers = suitsString.split(SUIT_DELIMITER);
  const suitNames = getSuitNamesFromSuitID(suitIDsWithModifiers, suitsIDMap);

  const variant: VariantJSON = {
    name: "",
    id: 0,
    suits: suitNames,
    newID,
  };

  for (const suitIDWithModifiers of suitIDsWithModifiers) {
    const [suitID] = splitSuitID(suitIDWithModifiers);

    const suit = suitsIDMap.get(suitID);
    if (suit === undefined) {
      error(`Failed to find a suit with an ID of: ${suitID}`);
    }

    if (suit.showSuitName === true) {
      variant.showSuitNames = true;
    }
  }

  for (const variantModifier of variantModifiers) {
    const secondCharacter = variantModifier[1];

    switch (variantModifier) {
      // Rainbow
      case "R1":
      case "R5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialAllClueColors = true;
        break;
      }

      // Pink
      case "P1":
      case "P5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "W1":
      case "W5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialNoClueColors = true;
        break;
      }

      case "B1":
      case "B5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "O1":
      case "O5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "N1":
      case "N5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "M1":
      case "M5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "L1":
      case "L5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "D1":
      case "D5": {
        variant.specialRank = parseIntSafe(secondCharacter);
        variant.specialDeceptive = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      case "CB": {
        variant.colorCluesTouchNothing = true;
        break;
      }

      case "NB": {
        variant.rankCluesTouchNothing = true;
        break;
      }

      case "TB": {
        variant.colorCluesTouchNothing = true;
        variant.rankCluesTouchNothing = true;
        break;
      }

      case "CM": {
        variant.clueColors = [];
        break;
      }

      case "NM": {
        variant.clueRanks = [];
        break;
      }

      case "AC": {
        variant.alternatingClues = true;
        break;
      }

      case "CS": {
        variant.clueStarved = true;
        break;
      }

      case "CP": {
        variant.cowPig = true;
        break;
      }

      case "Du": {
        variant.duck = true;
        break;
      }

      case "TH": {
        variant.throwItInHole = true;
        break;
      }

      case "UD": {
        variant.upOrDown = true;
        variant.showSuitNames = true;
        break;
      }

      case "Sy": {
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      }

      case "C4": {
        variant.criticalFours = true;
        break;
      }

      case "OE": {
        variant.oddsAndEvens = true;
        variant.clueRanks = [1, 2];
        break;
      }

      default: {
        throw new Error(
          `Unknown variant modifier: ":${variantModifier}" in ${newID}`,
        );
      }
    }
  }

  if (Number.isNaN(variant.specialRank)) {
    error("Failed to parse the special rank from the variant modifier.");
  }

  return variant;
}

function getSuitNamesFromSuitID(
  suitIDsWithModifiers: string[],
  suitsIDMap: Map<string, SuitJSON>,
) {
  return suitIDsWithModifiers.map((suitIDWithModifiers) => {
    const [suitID, ...modifiers] = splitSuitID(suitIDWithModifiers);

    const suit = suitsIDMap.get(suitID);
    if (suit === undefined) {
      error(`Failed to find a suit with an ID of: ${suitID}`);
    }

    for (const modifier of modifiers) {
      if (!SUIT_MODIFIERS.has(modifier)) {
        error(
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
