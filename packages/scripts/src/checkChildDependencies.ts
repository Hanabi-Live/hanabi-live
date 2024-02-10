import { dirName, getPackageJSONDependencies } from "isaacscript-common-node";
import path from "node:path";

const __dirname = dirName();
const REPO_ROOT = path.join(__dirname, "..", "..", "..");
const MAIN_PACKAGE_JSON = path.join(REPO_ROOT, "package.json");
const CHILD_PACKAGE_JSON = path.join(
  REPO_ROOT,
  "packages",
  "game",
  "package.json",
);

const mainDependencies = getPackageJSONDependencies(MAIN_PACKAGE_JSON);
if (mainDependencies === undefined) {
  throw new Error(`Failed to get the dependencies of: ${MAIN_PACKAGE_JSON}`);
}

const childDependencies = getPackageJSONDependencies(CHILD_PACKAGE_JSON);
if (childDependencies === undefined) {
  throw new Error(
    `Failed to get the child dependencies of: ${CHILD_PACKAGE_JSON}`,
  );
}

for (const [childDependencyName, childDependencyVersion] of Object.entries(
  childDependencies,
)) {
  const mainDependencyVersion = mainDependencies[childDependencyName];
  if (mainDependencyVersion === undefined) {
    throw new Error(
      `Failed to find the corresponding main dependency for: ${childDependencyName}`,
    );
  }

  if (mainDependencyVersion !== childDependencyVersion) {
    throw new Error(
      `The child dependency of "${childDependencyName}" in the "${CHILD_PACKAGE_JSON}" file does not match.`,
    );
  }
}
