import fs from "fs";
import { isEqual } from "lodash";
import path from "path";
import {
  getAmbiguousVariants,
  getBasicVariants,
  getDualColorsVariants,
  getExtremelyAmbiguousVariants,
  getVariantsForEachSpecialSuitCombination,
  getVariantsForEachSuit,
  getVariantsForSpecialRanks,
  getVeryAmbiguousVariants,
} from "./getVariantDescriptions";
import { SuitJSON } from "./types/SuitJSON";
import { VariantDescription } from "./types/VariantDescription";
import { VariantJSON } from "./types/VariantJSON";
import { error, parseIntSafe } from "./util";

const SUIT_REVERSED_SUFFIX = " Reversed";

const oldVariantsNameToIDMap = new Map<string, number>();
const oldVariantsIDToNameMap = new Map<number, string>();
const suitsNameMap = new Map<string, SuitJSON>();
const lastUsedVariantID = -1;

main();

function main() {
  const [suitsPath, variantsPath, textPath] = getPaths();

  const suits = getJSONAndParse(suitsPath) as SuitJSON[];
  validateSuits(suits);
  setSuitDefaultValues(suits);
  setSuitNameMap(suits);

  const oldVariants = getJSONAndParse(variantsPath) as VariantJSON[];
  validateVariants(oldVariants);
  setOldVariantMaps(oldVariants);

  // We only want to create variants for certain suits
  // (e.g. "Red" does not get its own variants because it is a basic suit)
  const suitsToCreateVariantsFor = suits.filter((suit) => suit.createVariants);

  // Start to build all of the variants
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
    ...getBlindVariants(),
    ...getMuteVariants(),
    ...getAlternatingCluesVariants(),
    ...getClueStarvedVariants(),
    ...getCowAndPigVariants(),
    ...getDuckVariants(),
    ...getThrowItInAHoleVariants(),
    ...getReversedVariants(),
    ...getUpOrDownVariants(),
    ...getSynesthesiaVariants(),
    ...getCriticalFoursVariants(),
    ...getOddsAndEvensVariants(),
  ];
  const variants = getVariantsFromVariantDescriptions(variantDescriptions);

  validateNewVariantIDs(variants);

  if (checkForMissingVariants()) {
    error(
      'Skipping the creation of a new "variant.json" file since there were missing variants.',
    );
  }

  createVariantJSONFile(variantsPath);
  createVariantsTextFile(textPath);
}

function getPaths(): string[] {
  const repoRootPath = path.join(__dirname, "..", "..");
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

function getJSONAndParse(jsonPath: string) {
  const data = fs.readFileSync(jsonPath, "utf-8");
  return JSON.parse(data) as unknown;
}

function validateSuits(suits: SuitJSON[]) {
  const suitNames = new Set<string>();
  const suitIDs = new Set<string>();

  for (const suit of suits) {
    if (suit.name === undefined || suit.name === "") {
      error('One of the suits in the "suits.json" file does not have a name.');
    }

    if (suitNames.has(suit.name)) {
      error(`Suit "${suit.name}" has a duplicate name.`);
    }

    suitNames.add(suit.name);

    if (suit.id === undefined || suit.id === "") {
      error(`Suit "${suit.name}" does not have an ID.`);
    }

    if (suitIDs.has(suit.id)) {
      error(`Suit "${suit.name}" has a duplicate ID.`);
    }

    suitIDs.add(suit.id);
  }
}

function setSuitDefaultValues(suits: SuitJSON[]) {
  for (const suit of suits) {
    if (suit.oneOfEach === undefined) {
      suit.oneOfEach = false;
    }

    if (suit.allClueColors === undefined) {
      suit.allClueColors = false;
    }

    if (suit.allClueRanks === undefined) {
      suit.allClueRanks = false;
    }

    if (suit.noClueColors === undefined) {
      suit.noClueColors = false;
    }

    if (suit.noClueRanks === undefined) {
      suit.noClueRanks = false;
    }

    if (suit.prism === undefined) {
      suit.prism = false;
    }

    if (suit.showSuitName === undefined) {
      suit.showSuitName = false;
    }

    if (suit.createVariants === undefined) {
      suit.createVariants = false;
    }
  }
}

function setSuitNameMap(suits: SuitJSON[]) {
  for (const suit of suits) {
    suitsNameMap.set(suit.name, suit);
  }
}

function validateVariants(variants: VariantJSON[]) {
  const variantNames = new Set<string>();
  const variantIDs = new Set<number>();

  for (const variant of variants) {
    if (variant.name === undefined || variant.name === "") {
      error(
        'One of the variants in the "variants.json" file does not have a name.',
      );
    }

    if (variantNames.has(variant.name)) {
      error(`Variant "${variant.name}" has a duplicate name.`);
    }

    variantNames.add(variant.name);

    if (variant.id === undefined) {
      error(`Variant "${variant.name}" does not have an ID.`);
    }

    if (variant.id < 0) {
      error(`Variant "${variant.name}" has a negative ID.`);
    }

    if (variantIDs.has(variant.id)) {
      error(`Variant "${variant.name}" has a duplicate ID.`);
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

/**
 * Create an array containing the suits for the "3 Suits" variant, the "4 Suits" variant, and so on.
 */
function getBasicVariantSuits(): string[][] {
  const variantSuits: string[][] = [];

  variantSuits[1] = ["Red"];
  variantSuits[2] = [...variantSuits[1], "Blue"];

  // Green is inserted before Blue to keep the colors in "rainbow" order
  variantSuits[3] = [...variantSuits[2]];
  variantSuits[3].splice(1, 0, "Green");

  // Yellow is inserted before Green to keep the colors in "rainbow" order
  variantSuits[4] = [...variantSuits[3]];
  variantSuits[4].splice(1, 0, "Yellow");

  variantSuits[5] = [...variantSuits[4], "Purple"];
  variantSuits[6] = [...variantSuits[5], "Teal"];

  return variantSuits;
}

function getVariantsFromVariantDescriptions(
  variantDescriptions: VariantDescription[],
): VariantJSON[] {
  return variantDescriptions.map((variantDescription) => ({
    name: variantDescription.name,
    id: getNextUnusedVariantID(variantDescription.name),
    newID: getNewVariantID(variantDescription.suits),
    suits: variantDescription.suits,
  }));
}

function getNextUnusedVariantID(variantName: string) {
  // First, prefer the old/existing variant ID, if present
  const id = oldVariantsNameToIDMap.get(variantName);
  if (id !== undefined) {
    return id;
  }

  // Otherwise, find the lowest unused variant ID
  let foundUnusedVariantID = false;
  let variantID = lastUsedVariantID;
  do {
    variantID += 1;
    const existingVariantName = oldVariantsIDToNameMap.get(variantID);
    if (existingVariantName === undefined) {
      foundUnusedVariantID = true;
    }
  } while (!foundUnusedVariantID);

  return variantID;
}

function getNewVariantID(suitNames: string[]) {
  const suitIDs = getSuitIDsFromSuitNames(suitNames);
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

function validateNewVariantIDs(variants: VariantJSON[]): boolean {
  const newVariantIDs = new Set();

  for (const variant of variants) {
    if (variant.newID === undefined || variant.newID === "") {
      error(`Variant "${variant.name}" is missing a newID.`);
    }

    if (newVariantIDs.has(variant.newID)) {
      error(`Variant "${variant.name}" has a duplicate newID.`);
    }

    newVariantIDs.add(variant.newID);

    // Check that the id is correct
    const reconstructed = parseStrId(variant.strId);
    reconstructed.name = variant.name;
    reconstructed.id = variant.id;
    if (!isEqual(reconstructed, variant)) {
      console.log(
        `Variant ${variant.strId} is parsed incorrectly:`,
        variant,
        reconstructed,
      );

      return true;
    }
  }

  return false;
}

function parseStrId(strId: string): VariantJSON {
  const [full_suits_str, ...var_modifiers] = strId.split(":");
  const suit_names = full_suits_str.split("+").map((suit_id_with_modifiers) => {
    const [suit_id, ...suit_modifiers] = suit_id_with_modifiers.split("/");
    let suit_name = suits_by_id.get(suit_id)!.name;
    for (const sm of suit_modifiers) {
      if (sm === "R") {
        suit_name += SUIT_REVERSED_SUFFIX;
      } else {
        throw new Error(`Unknown suit modifier "/${sm}" in ${strId}`);
      }
    }
    return suit_name;
  });
  const variant: VariantJSON = {
    name: "",
    id: 0,
    suits: suit_names,
    strId,
  };
  for (const suit_id_with_modifiers of full_suits_str.split("+")) {
    const [suit_id, ...suit_modifiers] = suit_id_with_modifiers.split("/");
    if (suits_by_id.get(suit_id)!.showSuitName) {
      variant.showSuitNames = true;
    }
  }
  for (const vm of var_modifiers) {
    switch (vm) {
      case "R1":
      case "R5": {
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialAllClueColors = true;
        break;
      }

      case "P1":
      case "P5": {
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "W1":
      case "W5": {
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialNoClueColors = true;
        break;
      }

      case "B1":
      case "B5": {
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      }

      case "O1":
      case "O5":
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialAllClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "N1":
      case "N5":
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialNoClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "M1":
      case "M5":
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialAllClueColors = true;
        variant.specialNoClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "L1":
      case "L5":
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialNoClueColors = true;
        variant.specialAllClueRanks = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "D1":
      case "D5":
        variant.specialRank = parseIntSafe(vm[1]);
        variant.specialDeceptive = true;
        variant.clueRanks = [1, 2, 3, 4, 5].filter(
          (item) => item !== variant.specialRank,
        );
        break;
      case "CB":
        variant.colorCluesTouchNothing = true;
        break;
      case "NB":
        variant.rankCluesTouchNothing = true;
        break;
      case "TB":
        variant.colorCluesTouchNothing = true;
        variant.rankCluesTouchNothing = true;
        break;
      case "CM":
        variant.clueColors = [];
        break;
      case "NM":
        variant.clueRanks = [];
        break;
      case "AC":
        variant.alternatingClues = true;
        break;
      case "CS":
        variant.clueStarved = true;
        break;
      case "CP":
        variant.cowPig = true;
        break;
      case "Du":
        variant.duck = true;
        break;
      case "TH":
        variant.throwItInHole = true;
        break;
      case "UD":
        variant.upOrDown = true;
        variant.showSuitNames = true;
        break;
      case "Sy":
        variant.synesthesia = true;
        variant.clueRanks = [];
        break;
      case "C4":
        variant.criticalFours = true;
        break;
      case "OE":
        variant.oddsAndEvens = true;
        variant.clueRanks = [1, 2];
        break;
      default:
        throw new Error(`Unknown variant modifier ":${vm}" in ${strId}`);
    }
  }

  return variant;
}

// Helper functions

function checkForMissingVariants(): boolean {
  // Create a map for the new variants
  const new_variants_map = new Map<string, boolean>();
  variants.forEach((variant) => {
    new_variants_map.set(variant.name, true);
  });

  // Check for missing variants
  let missing = false;
  oldVariantsArray.forEach((variant) => {
    if (!new_variants_map.has(variant.name)) {
      missing = true;
      console.log(`Missing variant: ${variant.name}`);
    }
  });
  return missing;
}

function createVariantJSONFile(jsonPath: string) {
  const data = `${JSON.stringify(variants, null, 2)}\n`;
  fs.writeFileSync(jsonPath, data);
  console.log(`Created: ${jsonPath}`);
}

function createVariantsTextFile(textPath: string) {
  const contents: string[] = [];
  variants.forEach((variant) => {
    contents.push(`${variant.name} (#${variant.id})`);
  });

  fs.writeFileSync(textPath, `${contents.join("\n")}\n\n`);
  console.log(`Created: ${textPath}`);
}
