import { SUIT_REVERSED_SUFFIX } from "./getVariantDescriptions";
import { VariantJSON } from "./types/VariantJSON";
import { parseIntSafe } from "./util";

export function getVariantFromNewID(newID: string): VariantJSON {
  const [suitsString, ...variantModifiers] = newID.split(":");
  const suitIDsWithModifiers = suitsString.split("+");
  const suitNames = suitIDsWithModifiers.map((suitIDsWithModifier) => {
    const [suitID, ...modifiers] = suitIDsWithModifier.split("/");
    let suitName = suits_by_id.get(suitID)!.name;
    for (const sm of modifiers) {
      if (sm === "R") {
        suitName += SUIT_REVERSED_SUFFIX;
      } else {
        throw new Error(`Unknown suit modifier "/${sm}" in ${newID}`);
      }
    }

    return suitName;
  });

  const variant: VariantJSON = {
    name: "",
    id: 0,
    suits: suitNames,
    newID,
  };

  for (const suit_id_with_modifiers of suitsString.split("+")) {
    const [suit_id, ...suit_modifiers] = suit_id_with_modifiers.split("/");
    if (suits_by_id.get(suit_id)!.showSuitName) {
      variant.showSuitNames = true;
    }
  }

  for (const variantModifier of variantModifiers) {
    switch (variantModifier) {
      case "R1":
      case "R5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialAllClueColors = true;
        break;
      }

      case "P1":
      case "P5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "W1":
      case "W5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialNoClueColors = true;
        break;
      }

      case "B1":
      case "B5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "O1":
      case "O5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "N1":
      case "N5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "M1":
      case "M5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "L1":
      case "L5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "D1":
      case "D5": {
        variant.specialRank = parseIntSafe(variantModifier[1]);
        variant.specialDeceptive = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
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

  return variant;
}
