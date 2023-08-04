import { isEqual } from "lodash";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  getAlternatingCluesVariants,
  getAmbiguousVariants,
  getBasicVariants,
  getBlindVariants,
  getChimneysVariants,
  getClueStarvedVariants,
  getCowAndPigVariants,
  getCriticalFoursVariants,
  getDualColorsVariants,
  getDuckVariants,
  getExtremelyAmbiguousVariants,
  getFunnelsVariants,
  getMatryoshkaVariants,
  getMixVariants,
  getMuteVariants,
  getOddsAndEvensVariants,
  getReversedVariants,
  getSudokuVariants,
  getSynesthesiaVariants,
  getThrowItInAHoleVariants,
  getUpOrDownVariants,
  getVariantsForEachSpecialSuitCombination,
  getVariantsForEachSuit,
  getVariantsForSpecialRanks,
  getVeryAmbiguousVariants,
} from "../getVariantDescriptions.js";
import type { SuitJSON } from "../types/SuitJSON.js";
import type { VariantDescription } from "../types/VariantDescription.js";
import type { VariantJSON } from "../types/VariantJSON.js";
import { getVariantFromNewID } from "./newID.js";
import { fatalError } from "./utils.js";

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
  setSuitDefaultValues(suits);
  setSuitMaps(suits);

  const oldVariants = getJSONAndParse(variantsPath) as VariantJSON[];
  validateVariants(oldVariants);
  setOldVariantMaps(oldVariants);

  // We only want to create variants for certain suits
  // (e.g. "Red" does not get its own variants because it is a basic suit)
  const suitsToCreateVariantsFor = suits.filter((suit) => suit.createVariants);

  // Start to build all of the variants.
  const basicVariantSuits = getBasicVariantSuits();
  const variantDescriptions = [
    ...getBasicVariants(basicVariantSuits),
    ...getVariantsForEachSuit(suitsToCreateVariantsFor, basicVariantSuits),
    ...getVariantsForEachSpecialSuitCombination(
      suitsToCreateVariantsFor,
      basicVariantSuits,
    ),
    ...getVariantsForSpecialRanks(suitsToCreateVariantsFor, basicVariantSuits),
    ...getAmbiguousVariants(suitsToCreateVariantsFor),
    ...getVeryAmbiguousVariants(suitsToCreateVariantsFor),
    ...getExtremelyAmbiguousVariants(suitsToCreateVariantsFor),
    ...getDualColorsVariants(suitsToCreateVariantsFor),
    ...getMixVariants(),
    ...getBlindVariants(basicVariantSuits),
    ...getMuteVariants(basicVariantSuits),
    ...getAlternatingCluesVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getClueStarvedVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getCowAndPigVariants(basicVariantSuits),
    ...getDuckVariants(basicVariantSuits),
    ...getThrowItInAHoleVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getReversedVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getUpOrDownVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getSynesthesiaVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getCriticalFoursVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getOddsAndEvensVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getFunnelsVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getChimneysVariants(suitsToCreateVariantsFor, basicVariantSuits),
    ...getMatryoshkaVariants(suitsToCreateVariantsFor),
    ...getSudokuVariants(suitsToCreateVariantsFor, basicVariantSuits),
  ];
  const variants = getVariantsFromVariantDescriptions(variantDescriptions);

  /// validateNewVariantIDs(variants); // TODO uncomment

  if (checkForMissingVariants(variants, oldVariants)) {
    fatalError(
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
      fatalError(
        'One of the suits in the "suits.json" file does not have a name.',
      );
    }

    if (suitNames.has(suit.name)) {
      fatalError(`Suit "${suit.name}" has a duplicate name.`);
    }

    suitNames.add(suit.name);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (suit.id === undefined || suit.id === "") {
      fatalError(`Suit "${suit.name}" does not have an ID.`);
    }

    if (suitIDs.has(suit.id)) {
      fatalError(`Suit "${suit.name}" has a duplicate ID.`);
    }

    suitIDs.add(suit.id);
  }
}

function setSuitDefaultValues(suits: SuitJSON[]) {
  for (const suit of suits) {
    // Main attributes
    if (suit.createVariants === undefined) {
      suit.createVariants = false;
    }

    // Visual appearance
    if (suit.showSuitName === undefined) {
      suit.showSuitName = false;
    }

    // Gameplay modifications
    if (suit.oneOfEach === undefined) {
      suit.oneOfEach = false;
    }

    if (suit.allClueColors === undefined) {
      suit.allClueColors = false;
    }

    if (suit.noClueColors === undefined) {
      suit.noClueColors = false;
    }

    if (suit.allClueRanks === undefined) {
      suit.allClueRanks = false;
    }

    if (suit.noClueRanks === undefined) {
      suit.noClueRanks = false;
    }

    if (suit.prism === undefined) {
      suit.prism = false;
    }
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
      fatalError(
        'One of the variants in the "variants.json" file does not have a name.',
      );
    }

    if (variantNames.has(variant.name)) {
      fatalError(`Variant "${variant.name}" has a duplicate name.`);
    }

    variantNames.add(variant.name);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (variant.id === undefined) {
      fatalError(`Variant "${variant.name}" does not have an ID.`);
    }

    if (variant.id < 0) {
      fatalError(`Variant "${variant.name}" has a negative ID.`);
    }

    if (variantIDs.has(variant.id)) {
      fatalError(`Variant "${variant.name}" has a duplicate ID.`);
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

/** The first element is undefined so that e.g. the values for "3 Suits" are at index 3. */
export type BasicVariantSuits = [
  undefined,
  string[],
  string[],
  string[],
  string[],
  string[],
  string[],
];

/**
 * Create an array containing the suits for the "3 Suits" variant, the "4 Suits" variant, and so on.
 */
function getBasicVariantSuits(): BasicVariantSuits {
  const oneSuit = ["Red"];
  const twoSuits = ["Red", "Blue"];

  // Green is inserted before Blue to keep the colors in "rainbow" order.
  const threeSuits = ["Red", "Green", "Blue"];

  // Yellow is inserted before Green to keep the colors in "rainbow" order.
  const fourSuits = ["Red", "Yellow", "Green", "Blue"];

  const fiveSuits = [...fourSuits, "Purple"];
  const sixSuits = [...fiveSuits, "Teal"];

  return [
    undefined,
    oneSuit,
    twoSuits,
    threeSuits,
    fourSuits,
    fiveSuits,
    sixSuits,
  ];
}

function getVariantsFromVariantDescriptions(
  variantDescriptions: VariantDescription[],
): VariantJSON[] {
  return variantDescriptions.map((variantDescription) => ({
    id: getNextUnusedVariantID(variantDescription.name),
    // newID: getNewVariantID(variantDescription),
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getNewVariantID(variantDescription: VariantDescription): string {
  const suitIDs = getSuitIDsFromSuitNames(variantDescription.suits);
  return suitIDs.join("+");
}

function getSuitIDsFromSuitNames(suitNames: string[]): string[] {
  return suitNames.map((suitName) => {
    const suit = suitsNameMap.get(suitName);
    if (suit === undefined) {
      throw new Error(`Failed to find the suit ID for suit: ${suitName}`);
    }

    return suit.id;
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validateNewVariantIDs(variants: VariantJSON[]) {
  const newVariantIDs = new Set();

  for (const variant of variants) {
    if (variant.newID === undefined || variant.newID === "") {
      fatalError(`Variant "${variant.name}" is missing a newID.`);
    }

    if (newVariantIDs.has(variant.newID)) {
      fatalError(`Variant "${variant.name}" has a duplicate newID.`);
    }

    newVariantIDs.add(variant.newID);

    const reconstructedVariant = getVariantFromNewID(variant.newID, suitsIDMap);
    reconstructedVariant.name = variant.name;
    reconstructedVariant.id = variant.id;
    if (!isEqual(reconstructedVariant, variant)) {
      fatalError(
        `Variant "${variant.name}" has a new ID that was parsed incorrectly.`,
      );
    }
  }
}

function checkForMissingVariants(
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
