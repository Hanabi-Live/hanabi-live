import { parseIntSafe } from "isaacscript-common-ts";
import {
  getSpecialClueRanks,
  SUIT_REVERSED_SUFFIX,
} from "../getVariantDescriptions";
import { SuitJSON } from "../types/SuitJSON";
import { VariantJSON } from "../types/VariantJSON";
import { error } from "./utils";

const VARIANT_DELIMITER = ":";
const SUIT_DELIMITER = "+";
const SUIT_MODIFIER_DELIMITER = "/";
const REVERSE_MODIFIER = "R";
const SUIT_MODIFIERS: ReadonlySet<string> = new Set([REVERSE_MODIFIER]);

export function getVariantFromNewID(
  newID: string,
  suitsIDMap: Map<string, SuitJSON>,
): VariantJSON {
  const [suitsString, ...variantModifiers] = newID.split(VARIANT_DELIMITER);
  const suitIDsWithModifiers = suitsString!.split(SUIT_DELIMITER);
  const suitNames = getSuitNamesFromSuitID(suitIDsWithModifiers, suitsIDMap);

  const variant: VariantJSON = {
    name: "",
    id: 0,
    suits: suitNames,
    newID,
  };

  for (const suitIDWithModifiers of suitIDsWithModifiers) {
    const [suitID] = splitSuitID(suitIDWithModifiers);

    const suit = suitsIDMap.get(suitID!);
    if (suit === undefined) {
      error(`Failed to find a suit with an ID of: ${suitID}`);
    }

    if (suit.showSuitName === true) {
      variant.showSuitNames = true;
    }
  }

  for (const variantModifier of variantModifiers) {
    const secondCharacter = variantModifier[1]!;
    const secondCharacterNumber = parseIntSafe(secondCharacter);
    const specialRank = Number.isNaN(secondCharacterNumber)
      ? 0
      : secondCharacterNumber;

    switch (variantModifier) {
      // Rainbow-Ones / Rainbow-Fives
      case "R1":
      case "R5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        break;
      }

      // Pink-Ones / Pink-Fives
      case "P1":
      case "P5": {
        variant.specialRank = specialRank;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // White-Ones / White-Fives
      case "W1":
      case "W5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        break;
      }

      // Brown-Ones / Brown-Fives
      case "B1":
      case "B5": {
        variant.specialRank = specialRank;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Omni-Ones / Omni-Fives
      case "O1":
      case "O5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Null-Ones / Null-Fives
      case "N1":
      case "N5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Muddy-Rainbow-Ones / Muddy-Rainbow-Fives
      case "M1":
      case "M5": {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Light-Pink-Ones / Light-Pink-Fives
      case "L1":
      case "L5": {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Deceptive-Ones / Deceptive-Fives
      case "D1":
      case "D5": {
        variant.specialRank = specialRank;
        variant.specialDeceptive = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
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

      // Clue Starved
      case "CS": {
        variant.clueStarved = true;
        break;
      }

      // Cow & Pig
      case "CP": {
        variant.cowPig = true;
        break;
      }

      // Duck
      case "Du": {
        variant.duck = true;
        break;
      }

      // Throw It in a Hole.
      case "TH": {
        variant.throwItInHole = true;
        break;
      }

      // Up or Down
      case "UD": {
        variant.upOrDown = true;
        variant.showSuitNames = true;
        break;
      }

      // Synesthesia
      case "Sy": {
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      }

      // Critical 4's
      case "C4": {
        variant.criticalFours = true;
        break;
      }

      // Odds and Evens
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

    if (variant.specialRank === 0) {
      error("Failed to parse the special rank from the variant modifier.");
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
