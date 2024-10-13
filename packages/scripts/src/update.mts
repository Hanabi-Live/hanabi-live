// Packages held back:
// - "konva" - Stuck on "3.4.1" until the front-end client can be rewritten. (Upgrading the version
//   causes weird graphical glitches.)
// - "typescript" - Stuck on "5.5.4" until TSESLint upgrades:
// https://github.com/typescript-eslint/typescript-eslint/issues/9653

import { updatePackageJSONDependenciesMonorepo } from "complete-node";
import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const REPO_ROOT = path.join(PACKAGE_ROOT, "..", "..");

await updatePackageJSONDependenciesMonorepo(REPO_ROOT);
