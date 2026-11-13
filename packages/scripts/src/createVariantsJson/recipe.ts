import type {
  SuitJson,
  VariantDescription,
  VariantId,
  VariantJson,
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
import type { Writeable } from "complete-common";
import {
  assertDefined,
  assertEnumValue,
  parseIntSafe,
  trimSuffix,
} from "complete-common";
import equal from "fast-deep-equal";
import { getSpecialClueRanks } from "./getVariantDescriptions.ts";

export function getVariantRecipe(
  variantDescription: VariantDescription,
  suitsNameMap: ReadonlyMap<string, SuitJson>,
): string {
  const suitIds = variantDescription.suits.map((suitName) =>
    getSuitRecipe(suitName, suitsNameMap),
  );

  const suitsId = suitIds.join(SUIT_DELIMITER);

  const specialVariantIdSuffixes =
    getSpecialVariantIdSuffixes(variantDescription);
  if (specialVariantIdSuffixes.length === 0) {
    return suitsId;
  }

  const variantSuffix = specialVariantIdSuffixes.join(VARIANT_DELIMITER);
  return `${suitsId}${VARIANT_DELIMITER}${variantSuffix}`;
}

function getSuitRecipe(
  suitName: string,
  suitsNameMap: ReadonlyMap<string, SuitJson>,
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

function getSpecialVariantIdSuffixes(
  variantDescription: VariantDescription,
): readonly string[] {
  const variantIdSuffixes: string[] = [];

  if (variantDescription.specialRank !== undefined) {
    // Rainbow-Ones / Rainbow-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`R${variantDescription.specialRank}`);
    }

    // Pink-Ones / Pink-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`P${variantDescription.specialRank}`);
    }

    // White-Ones / White-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`W${variantDescription.specialRank}`);
    }

    // Brown-Ones / Brown-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`B${variantDescription.specialRank}`);
    }

    // Omni-Ones / Omni-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`O${variantDescription.specialRank}`);
    }

    // Null-Ones / Null-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`N${variantDescription.specialRank}`);
    }

    // Muddy-Rainbow-Ones / Muddy-Rainbow-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors === true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks === true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`M${variantDescription.specialRank}`);
    }

    // Light-Pink-Ones / Light-Pink-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks === true
      && variantDescription.specialRankNoClueColors === true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive !== true
    ) {
      variantIdSuffixes.push(`L${variantDescription.specialRank}`);
    }

    // Deceptive-Ones / Deceptive-Twos / etc.
    if (
      variantDescription.specialRankAllClueColors !== true
      && variantDescription.specialRankAllClueRanks !== true
      && variantDescription.specialRankNoClueColors !== true
      && variantDescription.specialRankNoClueRanks !== true
      && variantDescription.specialRankDeceptive === true
    ) {
      variantIdSuffixes.push(`D${variantDescription.specialRank}`);
    }
  }

  // Critical Ones / Critical Twos / etc.
  if (variantDescription.criticalRank !== undefined) {
    variantIdSuffixes.push(`C${variantDescription.criticalRank}`);
  }

  // Scarce Ones
  if (variantDescription.scarceOnes === true) {
    variantIdSuffixes.push(VariantModifier.ScarceOnes);
  }

  // Clue Starved
  if (variantDescription.clueStarved === true) {
    variantIdSuffixes.push(VariantModifier.ClueStarved);
  }

  // Color Blind
  if (
    variantDescription.colorCluesTouchNothing === true
    && variantDescription.rankCluesTouchNothing !== true
  ) {
    variantIdSuffixes.push(VariantModifier.ColorBlind);
  }

  // Number Blind
  if (
    variantDescription.colorCluesTouchNothing !== true
    && variantDescription.rankCluesTouchNothing === true
  ) {
    variantIdSuffixes.push(VariantModifier.NumberBlind);
  }

  // Totally Blind
  if (
    variantDescription.colorCluesTouchNothing === true
    && variantDescription.rankCluesTouchNothing === true
  ) {
    variantIdSuffixes.push(VariantModifier.TotallyBlind);
  }

  // Color Mute
  if (
    variantDescription.clueColors !== undefined
    && variantDescription.clueColors.length === 0
  ) {
    variantIdSuffixes.push(VariantModifier.ColorMute);
  }

  // Number Mute
  if (
    variantDescription.clueRanks !== undefined
    && variantDescription.clueRanks.length === 0
  ) {
    variantIdSuffixes.push(VariantModifier.NumberMute);
  }

  // Alternating Clues
  if (variantDescription.alternatingClues === true) {
    variantIdSuffixes.push(VariantModifier.AlternatingClues);
  }

  // Cow & Pig
  if (variantDescription.cowAndPig === true) {
    variantIdSuffixes.push(VariantModifier.CowAndPig);
  }

  // Duck
  if (variantDescription.duck === true) {
    variantIdSuffixes.push(VariantModifier.Duck);
  }

  // Odds and Evens
  if (variantDescription.oddsAndEvens === true) {
    variantIdSuffixes.push(VariantModifier.OddsAndEvens);
  }

  // Synesthesia
  if (variantDescription.synesthesia === true) {
    variantIdSuffixes.push(VariantModifier.Synesthesia);
  }

  // Up or Down
  if (variantDescription.upOrDown === true) {
    variantIdSuffixes.push(VariantModifier.UpOrDown);
  }

  // Throw It in a Hole.
  if (variantDescription.throwItInAHole === true) {
    variantIdSuffixes.push(VariantModifier.ThrowItInAHole);
  }

  // Funnels
  if (variantDescription.funnels === true) {
    variantIdSuffixes.push(VariantModifier.Funnels);
  }

  // Chimneys
  if (variantDescription.chimneys === true) {
    variantIdSuffixes.push(VariantModifier.Chimneys);
  }

  // Sudoku
  if (variantDescription.sudoku === true) {
    variantIdSuffixes.push(VariantModifier.Sudoku);
  }

  return variantIdSuffixes;
}

export function validateVariantRecipes(
  variantsJson: readonly VariantJson[],
  suitsIdMap: ReadonlyMap<string, SuitJson>,
): void {
  const recipes = new Set();

  for (const variantJson of variantsJson) {
    if (variantJson.recipe === "") {
      throw new Error(
        `Variant "${variantJson.name}" is missing a "recipe" property.`,
      );
    }

    if (recipes.has(variantJson.recipe)) {
      console.error("variantJson:", variantJson);
      throw new Error(
        `Variant "${variantJson.name}" has a duplicate "recipe" property of "${variantJson.recipe}". (See the previous object log.)`,
      );
    }

    recipes.add(variantJson.recipe);

    const reconstructedVariant = getVariantFromRecipe(
      variantJson.recipe,
      variantJson.name,
      variantJson.id,
      suitsIdMap,
    );

    if (!equal(variantJson, reconstructedVariant)) {
      console.error("--------------------------------------------------------");
      console.error("variantJson:", variantJson);
      console.error("--------------------------------------------------------");
      console.error("reconstructedVariant:", reconstructedVariant);
      console.error("--------------------------------------------------------");
      throw new Error(
        `Variant "${variantJson.name}" has a recipe of "${variantJson.recipe}" that was parsed incorrectly. (See the previous object logs.)`,
      );
    }
  }
}

/**
 * This function is only used for validation.
 *
 * It cannot compute the name of the old ID, so those must be provided.
 */
function getVariantFromRecipe(
  recipe: string,
  name: string,
  oldId: VariantId,
  suitsIdMap: ReadonlyMap<string, SuitJson>,
): VariantJson {
  const [suitsString, ...variantModifiers] = recipe.split(VARIANT_DELIMITER);
  assertDefined(
    suitsString,
    `Failed to parse the suits string from the variant recipe of: ${recipe}`,
  );

  const suitIdsWithModifiers = suitsString.split(SUIT_DELIMITER);
  const suits = getSuitNamesFromSuitId(suitIdsWithModifiers, suitsIdMap);

  const variant: Writeable<VariantJson> = {
    name,
    id: oldId,
    recipe,
    suits,
  };

  for (const variantModifier of variantModifiers) {
    const secondCharacter = variantModifier[1];
    assertDefined(
      secondCharacter,
      `Failed to get the second character of the variant modifier for variant "${name}" with a "recipe" of "${recipe}" and a variant modifier of "${variantModifier}".`,
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
        `The number in the variant modifier for variant "${name}" with a "recipe" of "${recipe}" and a variant modifier of "${variantModifier}" was not 1, 2, 3, 4, 5, or ${START_CARD_RANK}.`,
      );
    }

    assertEnumValue(
      variantModifier,
      VariantModifier,
      `Unknown variant modifier of "${variantModifier}" in a variant recipe of "${recipe}".`,
      VARIANT_MODIFIER_SET,
    );

    switch (variantModifier) {
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
          variant.stackSize = variant.suits.length as NonNullable<
            VariantJson["stackSize"]
          >;
          variant.clueRanks = DEFAULT_CLUE_RANKS.slice(0, variant.suits.length);
        }
        break;
      }
    }
  }

  return variant;
}

function getSuitNamesFromSuitId(
  suitIdsWithModifiers: readonly string[],
  suitsIdMap: ReadonlyMap<string, SuitJson>,
): readonly string[] {
  return suitIdsWithModifiers.map((suitIdWithModifiers) => {
    const [suitId, ...modifiers] = suitIdWithModifiers.split(
      SUIT_MODIFIER_DELIMITER,
    );
    assertDefined(
      suitId,
      `Failed to parse the suit ID: ${suitIdWithModifiers}`,
    );

    const suit = suitsIdMap.get(suitId);
    assertDefined(suit, `Failed to find a suit with an ID of: ${suitId}`);

    for (const modifier of modifiers) {
      if (!SUIT_MODIFIERS.has(modifier)) {
        throw new Error(
          `Suit "${suit.name}" has an unknown modifier of "${modifier}" in the suit ID of: ${suitIdWithModifiers}`,
        );
      }
    }

    const hasReverseModifier = modifiers.includes(REVERSE_MODIFIER);
    return hasReverseModifier ? suit.name + SUIT_REVERSED_SUFFIX : suit.name;
  });
}
