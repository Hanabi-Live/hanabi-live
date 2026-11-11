import type {
  SuitJSON,
  VariantDescription,
  VariantJSON,
} from "@hanabi-live/game";
import fs from "node:fs";
import path from "node:path";
import * as prettier from "prettier";
import { getVariantDescriptions } from "./getVariantDescriptions";
import { getNewVariantID, validateNewVariantIDs } from "./newID";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..", "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

/** The generated variant files: each one's path and the contents that belong there. */
interface VariantFiles {
  readonly variantsPath: string;
  readonly variantsJSON: string;
  readonly textPath: string;
  readonly variantsText: string;
}

/** Writes the variant files that the suits and the existing variant IDs produce. */
export async function createVariantsJSON(): Promise<void> {
  const files = await generateVariantFiles();
  fs.writeFileSync(files.variantsPath, files.variantsJSON);
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

  const suits = getJSONAndParse(suitsPath) as SuitJSON[];
  validateSuits(suits);
  const { suitsNameMap, suitsIDMap } = getSuitMaps(suits);

  const oldVariants = getJSONAndParse(variantsPath) as VariantJSON[];
  validateVariants(oldVariants);
  const { oldVariantsNameToIDMap, oldVariantsIDToNameMap } =
    getOldVariantMaps(oldVariants);

  // Start to build all of the variants.
  const variantDescriptions = getVariantDescriptions(suits);
  const variants = getVariantsFromVariantDescriptions(
    variantDescriptions,
    suitsNameMap,
    oldVariantsNameToIDMap,
    oldVariantsIDToNameMap,
  );

  validateNewVariantIDs(variants, suitsIDMap);

  if (hasMissingVariants(variants, oldVariants)) {
    throw new Error(
      'Skipping the creation of a new "variant.json" file since there were missing variants.',
    );
  }

  return {
    variantsPath,
    variantsJSON: await formatVariantsJSON(variants),
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

function getJSONAndParse(jsonPath: string): unknown {
  const data = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(data);
}

function validateSuits(suits: readonly SuitJSON[]) {
  const suitNames = new Set<string>();
  const suitIDs = new Set<string>();

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

    if (suitIDs.has(suit.id)) {
      throw new Error(`Suit "${suit.name}" has a duplicate ID.`);
    }

    suitIDs.add(suit.id);
  }
}

function getSuitMaps(suits: readonly SuitJSON[]) {
  const suitsNameMap = new Map<string, SuitJSON>();
  const suitsIDMap = new Map<string, SuitJSON>();

  for (const suit of suits) {
    suitsNameMap.set(suit.name, suit);
    suitsIDMap.set(suit.id, suit);
  }

  return {
    suitsNameMap,
    suitsIDMap,
  };
}

function validateVariants(variants: readonly VariantJSON[]) {
  const variantNames = new Set<string>();
  const variantIDs = new Set<number>();

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

    if (variantIDs.has(variant.id)) {
      throw new Error(`Variant "${variant.name}" has a duplicate ID.`);
    }

    variantIDs.add(variant.id);
  }
}

function getOldVariantMaps(variants: readonly VariantJSON[]) {
  const oldVariantsNameToIDMap = new Map<string, number>();
  const oldVariantsIDToNameMap = new Map<number, string>();

  for (const variant of variants) {
    oldVariantsNameToIDMap.set(variant.name, variant.id);
    oldVariantsIDToNameMap.set(variant.id, variant.name);
  }

  return {
    oldVariantsNameToIDMap,
    oldVariantsIDToNameMap,
  };
}

/** Mutates `oldVariantsNameToIDMap` and `oldVariantsIDToNameMap`. */
function getVariantsFromVariantDescriptions(
  variantDescriptions: readonly VariantDescription[],
  suitsNameMap: ReadonlyMap<string, SuitJSON>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsNameToIDMap: Map<string, number>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsIDToNameMap: Map<number, string>,
): readonly VariantJSON[] {
  return variantDescriptions.map((variantDescription) => ({
    id: getNextUnusedVariantID(
      variantDescription.name,
      oldVariantsNameToIDMap,
      oldVariantsIDToNameMap,
    ),
    newID: getNewVariantID(variantDescription, suitsNameMap),
    ...variantDescription,
  }));
}

/** Mutates `oldVariantsNameToIDMap` and `oldVariantsIDToNameMap`. */
function getNextUnusedVariantID(
  variantName: string,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsNameToIDMap: Map<string, number>,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
  oldVariantsIDToNameMap: Map<number, string>,
): number {
  // First, prefer the old/existing variant ID, if present.
  const id = oldVariantsNameToIDMap.get(variantName);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID.
  let foundUnusedVariantID = false;
  let variantID = -1;
  do {
    variantID++;
    const existingVariantName = oldVariantsIDToNameMap.get(variantID);
    if (existingVariantName === undefined) {
      foundUnusedVariantID = true;
      oldVariantsIDToNameMap.set(variantID, variantName);
      oldVariantsNameToIDMap.set(variantName, variantID);
    }
  } while (!foundUnusedVariantID);

  return variantID;
}

function hasMissingVariants(
  variants: readonly VariantJSON[],
  oldVariants: readonly VariantJSON[],
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

async function formatVariantsJSON(
  variants: readonly VariantJSON[],
): Promise<string> {
  return await prettier.format(JSON.stringify(variants), { parser: "json" });
}

function formatVariantsText(variants: readonly VariantJSON[]): string {
  const lines: string[] = Array.from(
    variants,
    (variant) => `${variant.name} (#${variant.id})`,
  );
  return lines.join("\n").concat("\n");
}
