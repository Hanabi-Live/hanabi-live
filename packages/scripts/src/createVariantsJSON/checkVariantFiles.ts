import {
  $s,
  diff,
  fatalError,
  findPackageRoot,
  isFile,
  isMain,
  readFile,
} from "isaacscript-common-node";
import path from "node:path";

const PACKAGE_ROOT = findPackageRoot();
const REPO_ROOT = path.join(PACKAGE_ROOT, "..", "..");
const VARIANTS_JSON_PATH = path.join(
  REPO_ROOT,
  "packages",
  "game",
  "json",
  "variants.json",
);
const VARIANTS_TXT_PATH = path.join(REPO_ROOT, "misc", "variants.txt");

if (isMain()) {
  main();
}

function main() {
  if (!isFile(VARIANTS_JSON_PATH)) {
    fatalError(
      `Failed to find the "variants.json" file at: ${VARIANTS_JSON_PATH}`,
    );
  }

  const oldVariantsJSON = readFile(VARIANTS_JSON_PATH);
  const oldVariantsTXT = readFile(VARIANTS_TXT_PATH);

  $s`npm run create-variants-json`;

  const newVariantsJSON = readFile(VARIANTS_JSON_PATH);
  const newVariantsTXT = readFile(VARIANTS_TXT_PATH);

  // Compare the text file first since the diff will be cleaner.
  if (oldVariantsTXT !== newVariantsTXT) {
    diff(oldVariantsTXT, newVariantsTXT);
    fatalError('The "variants.txt" file is not up to date.');
  }

  if (oldVariantsJSON !== newVariantsJSON) {
    diff(oldVariantsTXT, newVariantsTXT);
    fatalError('The "variants.json" file is not up to date.');
  }
}
