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
import {
  VARIANT_MODIFIER_SET,
  VariantModifier,
} from "../enums/VariantModifier";
import type { SuitJSON } from "../interfaces/SuitJSON";
import type { VariantDescription } from "../interfaces/VariantDescription";
import type { VariantJSON } from "../interfaces/VariantJSON";
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
  const variantIDSuffixes: VariantModifier[] = [];

  if (
    variantDescription.specialRank !== undefined &&
    variantDescription.specialRank !== -1
  ) {
    // Rainbow-Ones / Rainbow-Twos / etc.
    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `R${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Pink-Ones / Pink-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `P${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // White-Ones / White-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `W${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Brown-Ones / Brown-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `B${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Omni-Ones / Omni-Twos / etc.
    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `O${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Null-Ones / Null-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `N${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Muddy-Rainbow-Ones / Muddy-Rainbow-Twos / etc.
    if (
      variantDescription.specialAllClueColors === true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks === true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `M${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Light-Pink-Ones / Light-Pink-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks === true &&
      variantDescription.specialNoClueColors === true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `L${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Deceptive-Ones / Deceptive-Twos / etc.
    if (
      variantDescription.specialAllClueColors !== true &&
      variantDescription.specialAllClueRanks !== true &&
      variantDescription.specialNoClueColors !== true &&
      variantDescription.specialNoClueRanks !== true &&
      variantDescription.specialDeceptive === true
    ) {
      variantIDSuffixes.push(
        `D${variantDescription.specialRank}` as VariantModifier,
      );
    }
  }

  // Critical Ones / Critical Twos / etc.
  if (
    variantDescription.criticalRank !== undefined &&
    variantDescription.criticalRank !== -1
  ) {
    variantIDSuffixes.push(
      `C${variantDescription.criticalRank}` as VariantModifier,
    );
  }

  // Clue Starved
  if (variantDescription.clueStarved === true) {
    variantIDSuffixes.push(VariantModifier.ClueStarved);
  }

  // Color Blind
  if (
    variantDescription.colorCluesTouchNothing === true &&
    variantDescription.rankCluesTouchNothing !== true
  ) {
    variantIDSuffixes.push(VariantModifier.ColorBlind);
  }

  // Number Blind
  if (
    variantDescription.colorCluesTouchNothing !== true &&
    variantDescription.rankCluesTouchNothing === true
  ) {
    variantIDSuffixes.push(VariantModifier.NumberBlind);
  }

  // Totally Blind
  if (
    variantDescription.colorCluesTouchNothing === true &&
    variantDescription.rankCluesTouchNothing === true
  ) {
    variantIDSuffixes.push(VariantModifier.TotallyBlind);
  }

  // Color Mute
  if (
    variantDescription.clueColors !== undefined &&
    variantDescription.clueColors.length === 0
  ) {
    variantIDSuffixes.push(VariantModifier.ColorMute);
  }

  // Number Mute
  if (
    variantDescription.clueRanks !== undefined &&
    variantDescription.clueRanks.length === 0
  ) {
    variantIDSuffixes.push(VariantModifier.NumberMute);
  }

  // Alternating Clues
  if (variantDescription.alternatingClues === true) {
    variantIDSuffixes.push(VariantModifier.AlternatingClues);
  }

  // Cow & Pig
  if (variantDescription.cowAndPig === true) {
    variantIDSuffixes.push(VariantModifier.CowAndPig);
  }

  // Duck
  if (variantDescription.duck === true) {
    variantIDSuffixes.push(VariantModifier.Duck);
  }

  // Odds and Evens
  if (variantDescription.oddsAndEvens === true) {
    variantIDSuffixes.push(VariantModifier.OddsAndEvens);
  }

  // Synesthesia
  if (variantDescription.synesthesia === true) {
    variantIDSuffixes.push(VariantModifier.Synesthesia);
  }

  // Up or Down
  if (variantDescription.upOrDown === true) {
    variantIDSuffixes.push(VariantModifier.UpOrDown);
  }

  // Throw It in a Hole.
  if (variantDescription.throwItInAHole === true) {
    variantIDSuffixes.push(VariantModifier.ThrowItInAHole);
  }

  // Funnels
  if (variantDescription.funnels === true) {
    variantIDSuffixes.push(VariantModifier.Funnels);
  }

  // Chimneys
  if (variantDescription.chimneys === true) {
    variantIDSuffixes.push(VariantModifier.Chimneys);
  }

  // Sudoku
  if (variantDescription.sudoku === true) {
    variantIDSuffixes.push(VariantModifier.Sudoku);
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

    if (newVariantIDs.has(variantJSON.newID)) {
      console.error("variantJSON:", variantJSON);
      throw new Error(
        `Variant "${variantJSON.name}" has a duplicate "newID" property of "${variantJSON.newID}". (See the previous object log.)`,
      );
    }

    newVariantIDs.add(variantJSON.newID);

    const reconstructedVariant = getVariantFromNewID(
      variantJSON.newID,
      variantJSON.name,
      variantJSON.id,
      suitsIDMap,
    );

    if (!isEqual(variantJSON, reconstructedVariant)) {
      console.error("--------------------------------------------------------");
      console.error("variantJSON:", variantJSON);
      console.error("--------------------------------------------------------");
      console.error("reconstructedVariant:", reconstructedVariant);
      console.error("--------------------------------------------------------");
      throw new Error(
        `Variant "${variantJSON.name}" has a new ID of "${variantJSON.newID}" that was parsed incorrectly. (See the previous object logs.)`,
      );
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

    if (
      specialRank !== undefined &&
      specialRank !== 1 &&
      specialRank !== 2 &&
      specialRank !== 3 &&
      specialRank !== 4 &&
      specialRank !== 5
    ) {
      throw new Error(
        `The number in the variant modifier for variant "${name}" with a "newID" of "${newID}" and a variant modifier of "${variantModifier}" was not 1, 2, 3, 4, or 5.`,
      );
    }

    if (!VARIANT_MODIFIER_SET.has(variantModifier as VariantModifier)) {
      throw new Error(
        `Unknown variant modifier of "${variantModifier}" in a variant ID of "${newID}".`,
      );
    }
    const validatedVariantModifier = variantModifier as VariantModifier;

    switch (validatedVariantModifier) {
      // Rainbow-Ones / Rainbow-Fives
      case VariantModifier.RainbowOnes:
      case VariantModifier.RainbowTwos:
      case VariantModifier.RainbowThrees:
      case VariantModifier.RainbowFours:
      case VariantModifier.RainbowFives: {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        break;
      }

      // Pink-Ones / Pink-Fives
      case VariantModifier.PinkOnes:
      case VariantModifier.PinkTwos:
      case VariantModifier.PinkThrees:
      case VariantModifier.PinkFours:
      case VariantModifier.PinkFives: {
        variant.specialRank = specialRank;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // White-Ones / White-Fives
      case VariantModifier.WhiteOnes:
      case VariantModifier.WhiteTwos:
      case VariantModifier.WhiteThrees:
      case VariantModifier.WhiteFours:
      case VariantModifier.WhiteFives: {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        break;
      }

      // Brown-Ones / Brown-Fives
      case VariantModifier.BrownOnes:
      case VariantModifier.BrownTwos:
      case VariantModifier.BrownThrees:
      case VariantModifier.BrownFours:
      case VariantModifier.BrownFives: {
        variant.specialRank = specialRank;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Omni-Ones / Omni-Fives
      case VariantModifier.OmniOnes:
      case VariantModifier.OmniTwos:
      case VariantModifier.OmniThrees:
      case VariantModifier.OmniFours:
      case VariantModifier.OmniFives: {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Null-Ones / Null-Fives
      case VariantModifier.NullOnes:
      case VariantModifier.NullTwos:
      case VariantModifier.NullThrees:
      case VariantModifier.NullFours:
      case VariantModifier.NullFives: {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Muddy-Rainbow-Ones / Muddy-Rainbow-Fives
      case VariantModifier.MuddyRainbowOnes:
      case VariantModifier.MuddyRainbowTwos:
      case VariantModifier.MuddyRainbowThrees:
      case VariantModifier.MuddyRainbowFours:
      case VariantModifier.MuddyRainbowFives: {
        variant.specialRank = specialRank;
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Light-Pink-Ones / Light-Pink-Fives
      case VariantModifier.LightPinkOnes:
      case VariantModifier.LightPinkTwos:
      case VariantModifier.LightPinkThrees:
      case VariantModifier.LightPinkFours:
      case VariantModifier.LightPinkFives: {
        variant.specialRank = specialRank;
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Deceptive-Ones / Deceptive-Fives
      case VariantModifier.DeceptiveOnes:
      case VariantModifier.DeceptiveTwos:
      case VariantModifier.DeceptiveThrees:
      case VariantModifier.DeceptiveFours:
      case VariantModifier.DeceptiveFives: {
        variant.specialRank = specialRank;
        variant.specialDeceptive = true;
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Critical 4's
      case VariantModifier.CriticalOnes:
      case VariantModifier.CriticalTwos:
      case VariantModifier.CriticalThrees:
      case VariantModifier.CriticalFours:
      case VariantModifier.CriticalFives: {
        variant.criticalRank = specialRank;
        break;
      }

      // Clue Starved
      case VariantModifier.ClueStarved: {
        variant.clueStarved = true;
        break;
      }

      // Color Blind
      case VariantModifier.ColorBlind: {
        variant.colorCluesTouchNothing = true;
        break;
      }

      // Number Blind
      case VariantModifier.NumberBlind: {
        variant.rankCluesTouchNothing = true;
        break;
      }

      // Totally Blind
      case VariantModifier.TotallyBlind: {
        variant.colorCluesTouchNothing = true;
        variant.rankCluesTouchNothing = true;
        break;
      }

      // Color Mute
      case VariantModifier.ColorMute: {
        variant.clueColors = [];
        break;
      }

      // Number Mute
      case VariantModifier.NumberMute: {
        variant.clueRanks = [];
        break;
      }

      // Alternating Clues
      case VariantModifier.AlternatingClues: {
        variant.alternatingClues = true;
        break;
      }

      // Cow & Pig
      case VariantModifier.CowAndPig: {
        variant.cowAndPig = true;
        break;
      }

      // Duck
      case VariantModifier.Duck: {
        variant.duck = true;
        break;
      }

      // Odds and Evens
      case VariantModifier.OddsAndEvens: {
        variant.oddsAndEvens = true;
        variant.clueRanks = [1, 2];
        break;
      }

      // Synesthesia
      case VariantModifier.Synesthesia: {
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      }

      // Up or Down
      case VariantModifier.UpOrDown: {
        variant.upOrDown = true;
        break;
      }

      // Throw It in a Hole.
      case VariantModifier.ThrowItInAHole: {
        variant.throwItInAHole = true;
        break;
      }

      // Funnels
      case VariantModifier.Funnels: {
        variant.funnels = true;
        break;
      }

      // Chimneys
      case VariantModifier.Chimneys: {
        variant.chimneys = true;
        break;
      }

      // Sudoku
      case VariantModifier.Sudoku: {
        variant.sudoku = true;
        break;
      }
    }
  }

  return variant;
}

function getSuitNamesFromSuitID(
  suitIDsWithModifiers: string[],
  suitsIDMap: Map<string, SuitJSON>,
) {
  return suitIDsWithModifiers.map((suitIDWithModifiers) => {
    const [suitID, ...modifiers] = suitIDWithModifiers.split(
      SUIT_MODIFIER_DELIMITER,
    );

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
