import { diff, isFile, isMain, readFile } from "complete-node";
import path from "node:path";
import { createVariantsJSON } from "./createVariantsJSON";

const PACKAGE_ROOT = path.join(__dirname, "..", "..");
const REPO_ROOT = path.join(PACKAGE_ROOT, "..", "..");
const VARIANTS_JSON_PATH = path.join(
  REPO_ROOT,
  "packages",
  "game",
  "src",
  "json",
  "variants.json",
);
const VARIANTS_TXT_PATH = path.join(REPO_ROOT, "misc", "variants.txt");

if (isMain()) {
  main().catch((error: unknown) => {
    throw new Error(`${error}`);
  });
}

async function main() {
  await checkVariantFiles();
}

async function checkVariantFiles() {
  if (!isFile(VARIANTS_JSON_PATH)) {
    throw new Error(
      `Failed to find the "variants.json" file at: ${VARIANTS_JSON_PATH}`,
    );
  }

  const oldVariantsJSON = readFile(VARIANTS_JSON_PATH);
  const oldVariantsTXT = readFile(VARIANTS_TXT_PATH);

  await createVariantsJSON(true);

  const newVariantsJSON = readFile(VARIANTS_JSON_PATH);
  const newVariantsTXT = readFile(VARIANTS_TXT_PATH);

  // Compare the text file first since the diff will be cleaner.
  if (oldVariantsTXT !== newVariantsTXT) {
    diff(oldVariantsTXT, newVariantsTXT);
    throw new Error('The "variants.txt" file is not up to date.');
  }

  if (oldVariantsJSON !== newVariantsJSON) {
    diff(oldVariantsTXT, newVariantsTXT);
    throw new Error('The "variants.json" file is not up to date.');
  }
}
