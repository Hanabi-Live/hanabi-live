import { isEqual } from "lodash";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SuitJSON } from "../types/SuitJSON";
import type { VariantDescription } from "../types/VariantDescription";
import type { VariantJSON } from "../types/VariantJSON";
import { getVariantDescriptions } from "./getVariantDescriptions";
import { getNewVariantID, getVariantFromNewID } from "./newID";

const oldVariantsNameToIDMap = new Map<string, number>();
const oldVariantsIDToNameMap = new Map<number, string>();
const suitsNameMap = new Map<string, SuitJSON>();
const suitsIDMap = new Map<string, SuitJSON>();
const lastUsedVariantID = -1;

main();

function main() {
  const [suitsPath, variantsPath, textPath] = getPaths();

  const suits = getJSONAndParse(suitsPath) as SuitJSON[];
  validateSuits(suits);
  setSuitMaps(suits);

  const oldVariants = getJSONAndParse(variantsPath) as VariantJSON[];
  validateVariants(oldVariants);
  setOldVariantMaps(oldVariants);

  // Start to build all of the variants.
  const variantDescriptions = getVariantDescriptions(suits);
  const variants = getVariantsFromVariantDescriptions(variantDescriptions);

  validateNewVariantIDs(variants);

  if (hasMissingVariants(variants, oldVariants)) {
    throw new Error(
      'Skipping the creation of a new "variant.json" file since there were missing variants.',
    );
  }

  createVariantJSONFile(variants, variantsPath);
  createVariantsTextFile(variants, textPath);
}

function getPaths(): [string, string, string] {
  const repoRootPath = path.join(__dirname, "..", "..", "..", "..");
  const jsonDirectoryPath = path.join(
    repoRootPath,
    "packages",
    "data",
    "src",
    "json",
  );
  const suitsPath = path.join(jsonDirectoryPath, "suits.json");
  const variantsPath = path.join(jsonDirectoryPath, "variants.json");
  const textPath = path.join(repoRootPath, "misc", "variants.txt");

  return [suitsPath, variantsPath, textPath];
}

function getJSONAndParse(jsonPath: string): unknown {
  const data = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(data) as unknown;
}

function validateSuits(suits: SuitJSON[]) {
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

function setSuitMaps(suits: SuitJSON[]) {
  for (const suit of suits) {
    suitsNameMap.set(suit.name, suit);
    suitsIDMap.set(suit.id, suit);
  }
}

function validateVariants(variants: VariantJSON[]) {
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

function setOldVariantMaps(variants: VariantJSON[]) {
  for (const variant of variants) {
    oldVariantsNameToIDMap.set(variant.name, variant.id);
    oldVariantsIDToNameMap.set(variant.id, variant.name);
  }
}

function getVariantsFromVariantDescriptions(
  variantDescriptions: VariantDescription[],
): VariantJSON[] {
  return variantDescriptions.map((variantDescription) => ({
    id: getNextUnusedVariantID(variantDescription.name),
    newID: getNewVariantID(variantDescription, suitsNameMap),
    ...variantDescription,
  }));
}

function getNextUnusedVariantID(variantName: string): number {
  // First, prefer the old/existing variant ID, if present.
  const id = oldVariantsNameToIDMap.get(variantName);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID.
  let foundUnusedVariantID = false;
  let variantID = lastUsedVariantID;
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

function validateNewVariantIDs(variantsJSON: VariantJSON[]) {
  const newVariantIDs = new Set();

  for (const variantJSON of variantsJSON) {
    if (variantJSON.newID === "") {
      throw new Error(`Variant "${variantJSON.name}" is missing a newID.`);
    }

    if (newVariantIDs.has(variantJSON.newID)) {
      throw new Error(
        `Variant "${variantJSON.name}" has a duplicate newID of: ${variantJSON.newID}`,
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

function hasMissingVariants(
  variants: VariantJSON[],
  oldVariants: VariantJSON[],
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

function createVariantJSONFile(variants: VariantJSON[], jsonPath: string) {
  const data = `${JSON.stringify(variants, undefined, 2)}\n`;
  fs.writeFileSync(jsonPath, data);
  console.log(`Created: ${jsonPath}`);
}

function createVariantsTextFile(variants: VariantJSON[], textPath: string) {
  const lines: string[] = [];
  for (const variant of variants) {
    lines.push(`${variant.name} (#${variant.id})`);
  }

  let fileContents = lines.join("\n");
  fileContents += "\n";

  fs.writeFileSync(textPath, fileContents);
  console.log(`Created: ${textPath}`);
}
