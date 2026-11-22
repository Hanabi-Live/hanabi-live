import { doesVariantExist } from "@hanabi-live/game";
import { expect, test } from "vitest";
import { CURATED_VARIANT_NAMES } from "./curatedVariants.ts";

test("every curated variant is in the catalog, once", () => {
  for (const name of CURATED_VARIANT_NAMES) {
    expect(doesVariantExist(name), name).toBe(true);
  }
  expect(new Set(CURATED_VARIANT_NAMES).size).toBe(
    CURATED_VARIANT_NAMES.length,
  );
});
