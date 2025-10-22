import type {
  BasicRank,
  SuitJSON,
  VariantDescription,
  VariantJSON,
} from "@hanabi-live/game";
import {
  DEFAULT_CLUE_RANKS,
  REVERSE_MODIFIER,
  START_CARD_RANK,
  SUIT_DELIMITER,
  SUIT_MODIFIERS,
  SUIT_MODIFIER_DELIMITER,
  SUIT_REVERSED_SUFFIX,
  VARIANT_DELIMITER,
  VARIANT_MODIFIER_SET,
  VariantModifier,
} from "@hanabi-live/game";
import { assertDefined, parseIntSafe, trimSuffix } from "complete-common";
import { isEqual } from "lodash";
import { getSpecialClueRanks } from "./getVariantDescriptions";

export function getNewVariantID(
  variantDescription: VariantDescription,
  suitsNameMap: ReadonlyMap<string, SuitJSON>,
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
  suitsNameMap: ReadonlyMap<string, SuitJSON>,
): string {
  // Reversed suits are a special case; they have an "R" appended to the non-reversed suit id.
  if (suitName.endsWith(SUIT_REVERSED_SUFFIX)) {
    const normalSuitName = trimSuffix(suitName, SUIT_REVERSED_SUFFIX);
    const suit = suitsNameMap.get(normalSuitName);
    assertDefined(
      suit,
      `Failed to find the non-reversed suit ID for suit: ${suitName}`,
    );

    return `${suit.id}${SUIT_MODIFIER_DELIMITER}R`;
  }

  const suit = suitsNameMap.get(suitName);
  assertDefined(suit, `Failed to find the suit ID for suit: ${suitName}`);

  return suit.id;
}

function getSpecialVariantIDSuffixes(
  variantDescription: VariantDescription,
): readonly string[] {
  const variantIDSuffixes: VariantModifier[] = [];

  if (variantDescription.specialRank !== undefined) {
    // Rainbow-Ones / Rainbow-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `R${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Pink-Ones / Pink-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `P${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // White-Ones / White-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `W${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Brown-Ones / Brown-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `B${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Omni-Ones / Omni-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `O${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Null-Ones / Null-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `N${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Muddy-Rainbow-Ones / Muddy-Rainbow-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `M${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Light-Pink-Ones / Light-Pink-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIDSuffixes.push(
        `L${variantDescription.specialRank}` as VariantModifier,
      );
    }

    // Deceptive-Ones / Deceptive-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive === true
    ) {
      variantIDSuffixes.push(
        `D${variantDescription.specialRank}` as VariantModifier,
      );
    }
  }

  // Critical Ones / Critical Twos / etc.
  if (variantDescription.criticalRank !== undefined) {
    variantIDSuffixes.push(
      `C${variantDescription.criticalRank}` as VariantModifier,
    );
  }

  // Scarce Ones
  if (variantDescription.scarceOnes === true) {
    variantIDSuffixes.push(VariantModifier.ScarceOnes);
  }

  // Clue Starved
  if (variantDescription.clueStarved === true) {
    variantIDSuffixes.push(VariantModifier.ClueStarved);
  }

  // Color Blind
  if (
    variantDescription.colorCluesTouchNothing === true
    && variantDescription.rankCluesTouchNothing !== true
  ) {
    variantIDSuffixes.push(VariantModifier.ColorBlind);
  }

  // Number Blind
  if (
    variantDescription.colorCluesTouchNothing !== true
    && variantDescription.rankCluesTouchNothing === true
  ) {
    variantIDSuffixes.push(VariantModifier.NumberBlind);
  }

  // Totally Blind
  if (
    variantDescription.colorCluesTouchNothing === true
    && variantDescription.rankCluesTouchNothing === true
  ) {
    variantIDSuffixes.push(VariantModifier.TotallyBlind);
  }

  // Color Mute
  if (
    variantDescription.clueColors !== undefined
    && variantDescription.clueColors.length === 0
  ) {
    variantIDSuffixes.push(VariantModifier.ColorMute);
  }

  // Number Mute
  if (
    variantDescription.clueRanks !== undefined
    && variantDescription.clueRanks.length === 0
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
  variantsJSON: readonly VariantJSON[],
  suitsIDMap: ReadonlyMap<string, SuitJSON>,
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
  suitsIDMap: ReadonlyMap<string, SuitJSON>,
): VariantJSON {
  const [suitsString, ...variantModifiers] = newID.split(VARIANT_DELIMITER);
  assertDefined(
    suitsString,
    `Failed to parse the suits string from the variant ID of: ${newID}`,
  );

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
    assertDefined(
      secondCharacter,
      `Failed to get the second character of the variant modifier for variant "${name}" with a "newID" of "${newID}" and a variant modifier of "${variantModifier}".`,
    );

    const variantModifierRank = parseIntSafe(secondCharacter);
    if (
      variantModifierRank !== undefined
      && variantModifierRank !== 1
      && variantModifierRank !== 2
      && variantModifierRank !== 3
      && variantModifierRank !== 4
      && variantModifierRank !== 5
      && variantModifierRank !== START_CARD_RANK
    ) {
      throw new Error(
        `The number in the variant modifier for variant "${name}" with a "newID" of "${newID}" and a variant modifier of "${variantModifier}" was not 1, 2, 3, 4, 5, or ${START_CARD_RANK}.`,
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
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Rainbow-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankAllClueColors = true;
        // We do not restrict the ranks for rainbow.
        break;
      }

      // Pink-Ones / Pink-Fives
      case VariantModifier.PinkOnes:
      case VariantModifier.PinkTwos:
      case VariantModifier.PinkThrees:
      case VariantModifier.PinkFours:
      case VariantModifier.PinkFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Pink-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankAllClueRanks = true;
        // Since the pink rank can be touched by other rank clues, we arbitrarily remove the clue
        // rank corresponding to the pink rank in order to make the variant harder.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // White-Ones / White-Fives
      case VariantModifier.WhiteOnes:
      case VariantModifier.WhiteTwos:
      case VariantModifier.WhiteThrees:
      case VariantModifier.WhiteFours:
      case VariantModifier.WhiteFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a White-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankNoClueColors = true;
        // We do not restrict the ranks for white. (Otherwise, it would not be possible to positive
        // clue the rank.)
        break;
      }

      // Brown-Ones / Brown-Fives
      case VariantModifier.BrownOnes:
      case VariantModifier.BrownTwos:
      case VariantModifier.BrownThrees:
      case VariantModifier.BrownFours:
      case VariantModifier.BrownFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Brown-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankNoClueRanks = true;
        // Since the brown rank cannot be touched by rank clues, having that rank clue available
        // would be pointless.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Omni-Ones / Omni-Fives
      case VariantModifier.OmniOnes:
      case VariantModifier.OmniTwos:
      case VariantModifier.OmniThrees:
      case VariantModifier.OmniFours:
      case VariantModifier.OmniFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Omni-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankAllClueColors = true;
        variant.specialRankAllClueRanks = true;
        // Since the omni rank can be touched by other clues, we arbitrarily remove the clue rank
        // corresponding to the omni rank in order to make the variant harder.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Null-Ones / Null-Fives
      case VariantModifier.NullOnes:
      case VariantModifier.NullTwos:
      case VariantModifier.NullThrees:
      case VariantModifier.NullFours:
      case VariantModifier.NullFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Null-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankNoClueColors = true;
        variant.specialRankNoClueRanks = true;
        // Since the null rank cannot be touched by rank clues, having that rank clue available
        // would be pointless.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Muddy-Rainbow-Ones / Muddy-Rainbow-Fives
      case VariantModifier.MuddyRainbowOnes:
      case VariantModifier.MuddyRainbowTwos:
      case VariantModifier.MuddyRainbowThrees:
      case VariantModifier.MuddyRainbowFours:
      case VariantModifier.MuddyRainbowFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Muddy-Rainbow-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankAllClueColors = true;
        variant.specialRankNoClueRanks = true;
        // Since the muddy rainbow rank cannot be touched by rank clues, having that rank clue
        // available would be pointless.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Light-Pink-Ones / Light-Pink-Fives
      case VariantModifier.LightPinkOnes:
      case VariantModifier.LightPinkTwos:
      case VariantModifier.LightPinkThrees:
      case VariantModifier.LightPinkFours:
      case VariantModifier.LightPinkFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Light-Pink-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankNoClueColors = true;
        variant.specialRankAllClueRanks = true;
        // Since the light pink rank can be touched by other rank clues, we arbitrarily remove the
        // clue rank corresponding to the pink rank in order to make the variant harder.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Deceptive-Ones / Deceptive-Fives
      case VariantModifier.DeceptiveOnes:
      case VariantModifier.DeceptiveTwos:
      case VariantModifier.DeceptiveThrees:
      case VariantModifier.DeceptiveFours:
      case VariantModifier.DeceptiveFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Deceptive-Rank variant.",
        );

        variant.specialRank = variantModifierRank;
        variant.specialRankDeceptive = true;
        // Since the deceptive rank cannot be touched by rank clues equal to itself, having that
        // rank clue available would be pointless.
        variant.clueRanks = getSpecialClueRanks(variant.specialRank);
        break;
      }

      // Critical 4's
      case VariantModifier.CriticalOnes:
      case VariantModifier.CriticalTwos:
      case VariantModifier.CriticalThrees:
      case VariantModifier.CriticalFours:
      case VariantModifier.CriticalFives: {
        assertDefined(
          variantModifierRank,
          "Failed to parse the rank for a Critical Rank variant.",
        );

        variant.criticalRank = variantModifierRank;
        break;
      }

      // Scarce 1's
      case VariantModifier.ScarceOnes: {
        variant.scarceOnes = true;
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
        if (variant.suits.length !== 5) {
          variant.stackSize = variant.suits.length as BasicRank;
          variant.clueRanks = DEFAULT_CLUE_RANKS.slice(0, variant.suits.length);
        }
        break;
      }
    }
  }

  return variant;
}

function getSuitNamesFromSuitID(
  suitIDsWithModifiers: readonly string[],
  suitsIDMap: ReadonlyMap<string, SuitJSON>,
): readonly string[] {
  return suitIDsWithModifiers.map((suitIDWithModifiers) => {
    const [suitID, ...modifiers] = suitIDWithModifiers.split(
      SUIT_MODIFIER_DELIMITER,
    );
    assertDefined(
      suitID,
      `Failed to parse the suit ID: ${suitIDWithModifiers}`,
    );

    const suit = suitsIDMap.get(suitID);
    assertDefined(suit, `Failed to find a suit with an ID of: ${suitID}`);

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
