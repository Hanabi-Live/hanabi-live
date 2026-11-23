import { expect, test } from "vitest";
import { CURATED_VARIANT_RECIPES } from "../../curatedVariants.ts";
import { getCatalogName, getChoice, getRecipe } from "./variantBuilder.ts";

test("every curated variant is in the catalog or one that the builder makes, once", () => {
  for (const recipe of CURATED_VARIANT_RECIPES) {
    const known =
      getCatalogName(recipe) !== undefined
      || getRecipe(getChoice(recipe)) === recipe;
    expect(known, recipe).toBe(true);
  }
  expect(new Set(CURATED_VARIANT_RECIPES).size).toBe(
    CURATED_VARIANT_RECIPES.length,
  );
});
