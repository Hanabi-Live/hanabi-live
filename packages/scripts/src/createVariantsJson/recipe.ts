import type { SuitJson, VariantDescription } from "@hanabi-live/game";
import {
  MIN_RANK,
  RECIPE_CRITICAL_RANK,
  RECIPE_DECEPTIVE_RANK,
  RECIPE_MODIFIER_SEPARATOR,
  RECIPE_SCARCE_RANK,
  RECIPE_SUIT_FLAG_SEPARATOR,
  RECIPE_SUIT_SEPARATOR,
  SUIT_REVERSED_SUFFIX,
  recipeFlagSchema,
  suitFlagSchema,
} from "@hanabi-live/game";
import { assertDefined, trimSuffix } from "complete-common";

type RecipeFlag = (typeof recipeFlagSchema.options)[number];

/** Whether a variant has each flag. The order of `recipeFlagSchema` is the order of a recipe. */
const RECIPE_FLAGS = {
  starved: (variant) => variant.clueStarved === true,
  cb: (variant) => variant.colorCluesTouchNothing === true,
  nb: (variant) => variant.rankCluesTouchNothing === true,
  cm: (variant) => variant.clueColors?.length === 0,
  // Synesthesia removes the rank clues itself.
  nm: (variant) =>
    variant.clueRanks?.length === 0 && variant.synesthesia !== true,
  alt: (variant) => variant.alternatingClues === true,
  cowpig: (variant) => variant.cowAndPig === true,
  duck: (variant) => variant.duck === true,
  oe: (variant) => variant.oddsAndEvens === true,
  syn: (variant) => variant.synesthesia === true,
  updown: (variant) => variant.upOrDown === true,
  hole: (variant) => variant.throwItInAHole === true,
  funnels: (variant) => variant.funnels === true,
  chimneys: (variant) => variant.chimneys === true,
  sudoku: (variant) => variant.sudoku === true,
} as const satisfies Record<
  RecipeFlag,
  (variant: VariantDescription) => boolean
>;

/**
 * Writes the recipe of a variant. The engine checks that each recipe describes its variant (in
 * "server/engine/src/recipe.rs"), so this only needs to pick the codes.
 */
export function getVariantRecipe(
  variantDescription: VariantDescription,
  suits: readonly SuitJson[],
): string {
  const suitsNameMap = new Map(suits.map((suit) => [suit.name, suit]));
  const suitsPart = variantDescription.suits
    .map((suitName) => getSuitRecipe(suitName, suitsNameMap))
    .join(RECIPE_SUIT_SEPARATOR);

  const modifiers = [
    ...getRankModifiers(variantDescription, suits),
    ...recipeFlagSchema.options.filter((flag) =>
      RECIPE_FLAGS[flag](variantDescription),
    ),
  ];

  return [suitsPart, ...modifiers].join(RECIPE_MODIFIER_SEPARATOR);
}

function getSuitRecipe(
  suitName: string,
  suitsNameMap: ReadonlyMap<string, SuitJson>,
): string {
  const reversed = suitName.endsWith(SUIT_REVERSED_SUFFIX);
  const normalSuitName = trimSuffix(suitName, SUIT_REVERSED_SUFFIX);
  const suit = suitsNameMap.get(normalSuitName);
  assertDefined(suit, `Failed to find the suit: ${normalSuitName}`);

  return reversed
    ? `${suit.id}${RECIPE_SUIT_FLAG_SEPARATOR}${suitFlagSchema.enum.rev}`
    : suit.id;
}

function getRankModifiers(
  variantDescription: VariantDescription,
  suits: readonly SuitJson[],
): readonly string[] {
  const modifiers: string[] = [];

  const { specialRank } = variantDescription;
  if (specialRank !== undefined) {
    const code =
      variantDescription.specialRankDeceptive === true
        ? RECIPE_DECEPTIVE_RANK
        : getSpecialRankSuitId(variantDescription, suits);
    modifiers.push(`${specialRank}${code}`);
  }

  if (variantDescription.criticalRank !== undefined) {
    modifiers.push(`${variantDescription.criticalRank}${RECIPE_CRITICAL_RANK}`);
  }

  if (variantDescription.scarceOnes === true) {
    modifiers.push(`${MIN_RANK}${RECIPE_SCARCE_RANK}`);
  }

  return modifiers;
}

/**
 * A special rank is touched like a suit, such as Rainbow-Ones like the Rainbow suit. This finds the
 * light suit that clues touch in the same way.
 */
function getSpecialRankSuitId(
  variantDescription: VariantDescription,
  suits: readonly SuitJson[],
): string {
  const suit = suits.find(
    (candidate) =>
      !candidate.id.includes(RECIPE_SUIT_FLAG_SEPARATOR)
      && candidate.oneOfEach !== true
      && candidate.prism !== true
      && candidate.inverted !== true
      && (candidate.allClueColors === true)
        === (variantDescription.specialRankAllClueColors === true)
      && (candidate.allClueRanks === true)
        === (variantDescription.specialRankAllClueRanks === true)
      && (candidate.noClueColors === true)
        === (variantDescription.specialRankNoClueColors === true)
      && (candidate.noClueRanks === true)
        === (variantDescription.specialRankNoClueRanks === true),
  );
  assertDefined(
    suit,
    `Failed to find a suit that clues touch like the special rank of: ${variantDescription.name}`,
  );

  return suit.id;
}
