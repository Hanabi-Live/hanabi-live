import type {
  SuitJson,
  VariantDescription,
  VariantId,
  VariantJson,
} from "@hanabi-live/game";
import { variantIdSchema } from "@hanabi-live/game";
import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { getVariantDescriptions } from "./getVariantDescriptions.ts";
import { getVariantRecipe, validateVariantRecipes } from "./recipe.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

/** The generated variant files: each one's path and the contents that belong there. */
interface VariantFiles {
  readonly variantsPath: string;
  readonly variantsJson: string;
  readonly textPath: string;
  readonly variantsText: string;
}

/** Writes the variant files that the suits and the existing variant IDs produce. */
export async function createVariantsJson(): Promise<void> {
  const files = await generateVariantFiles();
  fs.writeFileSync(files.variantsPath, files.variantsJson);
  console.log(`Created: ${files.variantsPath}`);
  fs.writeFileSync(files.textPath, files.variantsText);
  console.log(`Created: ${files.textPath}`);
}

/**
 * Generates the variant files without writing them, so that checking them does not touch files that
 * other checks may be reading.
 */
export async function generateVariantFiles(): Promise<VariantFiles> {
  const { suitsPath, variantsPath, textPath } = getPaths();

  const suits = getJsonAndParse(suitsPath) as SuitJson[];
  validateSuits(suits);
  const { suitsNameMap, suitsIdMap } = getSuitMaps(suits);

  const oldVariants = getJsonAndParse(variantsPath) as VariantJson[];
  validateVariants(oldVariants);
  const { oldVariantsNameToIdMap, oldVariantsIdToNameMap } =
    getOldVariantMaps(oldVariants);

  // Start to build all of the variants.
  const variantDescriptions = getVariantDescriptions(suits);
  const variants = getVariantsFromVariantDescriptions(
    variantDescriptions,
    suitsNameMap,
    oldVariantsNameToIdMap,
    oldVariantsIdToNameMap,
  );

  validateVariantRecipes(variants, suitsIdMap);

  if (hasMissingVariants(variants, oldVariants)) {
    throw new Error(
      'Skipping the creation of a new "variant.json" file since there were missing variants.',
    );
  }

  return {
    variantsPath,
    variantsJson: await formatVariantsJson(variants),
    textPath,
    variantsText: formatVariantsText(variants),
  };
}

function getPaths(): {
  readonly suitsPath: string;
  readonly variantsPath: string;
  readonly textPath: string;
} {
  const jsonDirectoryPath = path.join(
    REPO_ROOT,
    "packages",
    "game",
    "src",
    "json",
  );
  const suitsPath = path.join(jsonDirectoryPath, "suits.json");
  const variantsPath = path.join(jsonDirectoryPath, "variants.json");
  const textPath = path.join(REPO_ROOT, "misc", "variants.txt");

  return { suitsPath, variantsPath, textPath };
}

function getJsonAndParse(jsonPath: string): unknown {
  const data = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(data);
}

function validateSuits(suits: readonly SuitJson[]) {
  const suitNames = new Set<string>();
  const suitIds = new Set<string>();

  for (const suit of suits) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (suit.name === undefined || suit.name === "") {
      throw new Error(
        'One of the suits in the "suits.json" file does not have a name.',
      );
    }

    if (suitNames.has(suit.name)) {
      throw new Error(`Suit "${suit.name}" has a duplicate name.`);
    }

    suitNames.add(suit.name);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (suit.id === undefined || suit.id === "") {
      throw new Error(`Suit "${suit.name}" does not have an ID.`);
    }

    if (suitIds.has(suit.id)) {
      throw new Error(`Suit "${suit.name}" has a duplicate ID.`);
    }

    suitIds.add(suit.id);
  }
}

function getSuitMaps(suits: readonly SuitJson[]) {
  const suitsNameMap = new Map<string, SuitJson>();
  const suitsIdMap = new Map<string, SuitJson>();

  for (const suit of suits) {
    suitsNameMap.set(suit.name, suit);
    suitsIdMap.set(suit.id, suit);
  }

  return {
    suitsNameMap,
    suitsIdMap,
  };
}

function validateVariants(variants: readonly VariantJson[]) {
  const variantNames = new Set<string>();
  const variantIds = new Set<number>();

  for (const variant of variants) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variant.name === undefined || variant.name === "") {
      throw new Error(
        'One of the variants in the "variants.json" file does not have a name.',
      );
    }

    if (variantNames.has(variant.name)) {
      throw new Error(`Variant "${variant.name}" has a duplicate name.`);
    }

    variantNames.add(variant.name);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variant.id === undefined) {
      throw new Error(`Variant "${variant.name}" does not have an ID.`);
    }

    if (variant.id < 0) {
      throw new Error(`Variant "${variant.name}" has a negative ID.`);
    }

    if (variantIds.has(variant.id)) {
      throw new Error(`Variant "${variant.name}" has a duplicate ID.`);
    }

    variantIds.add(variant.id);
  }
}

function getOldVariantMaps(variants: readonly VariantJson[]) {
  const oldVariantsNameToIdMap = new Map<string, VariantId>();
  const oldVariantsIdToNameMap = new Map<number, string>();

  for (const variant of variants) {
    oldVariantsNameToIdMap.set(variant.name, variant.id);
    oldVariantsIdToNameMap.set(variant.id, variant.name);
  }

  return {
    oldVariantsNameToIdMap,
    oldVariantsIdToNameMap,
  };
}

/** Mutates `oldVariantsNameToIdMap` and `oldVariantsIdToNameMap`. */
function getVariantsFromVariantDescriptions(
  variantDescriptions: readonly VariantDescription[],
  suitsNameMap: ReadonlyMap<string, SuitJson>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsNameToIdMap: Map<string, VariantId>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsIdToNameMap: Map<number, string>,
): readonly VariantJson[] {
  return variantDescriptions.map((variantDescription) => ({
    id: getNextUnusedVariantId(
      variantDescription.name,
      oldVariantsNameToIdMap,
      oldVariantsIdToNameMap,
    ),
    recipe: getVariantRecipe(variantDescription, suitsNameMap),
    ...variantDescription,
  }));
}

/** Mutates `oldVariantsNameToIdMap` and `oldVariantsIdToNameMap`. */
function getNextUnusedVariantId(
  variantName: string,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsNameToIdMap: Map<string, VariantId>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsIdToNameMap: Map<number, string>,
): VariantId {
  // First, prefer the old/existing variant ID, if present.
  const id = oldVariantsNameToIdMap.get(variantName);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID.
  let unused = 0;
  while (oldVariantsIdToNameMap.has(unused)) {
    unused++;
  }
  const variantId = variantIdSchema.parse(unused);
  oldVariantsIdToNameMap.set(variantId, variantName);
  oldVariantsNameToIdMap.set(variantName, variantId);

  return variantId;
}

function hasMissingVariants(
  variants: readonly VariantJson[],
  oldVariants: readonly VariantJson[],
): boolean {
  const newVariantNames = new Set<string>();
  for (const variant of variants) {
    newVariantNames.add(variant.name);
  }

  let oneOrMoreVariantsIsMissing = false;
  for (const variant of oldVariants) {
    if (!newVariantNames.has(variant.name)) {
      oneOrMoreVariantsIsMissing = true;
      console.log(`Missing variant: ${variant.name}`);
    }
  }

  return oneOrMoreVariantsIsMissing;
}

async function formatVariantsJson(
  variants: readonly VariantJson[],
): Promise<string> {
  return await prettier.format(JSON.stringify(variants), { parser: "json" });
}

function formatVariantsText(variants: readonly VariantJson[]): string {
  const lines: string[] = Array.from(
    variants,
    (variant) => `${variant.name} (#${variant.id})`,
  );
  return lines.join("\n").concat("\n");
}
