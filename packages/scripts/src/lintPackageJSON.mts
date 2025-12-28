import { lintMonorepoPackageJSONs } from "complete-node";
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

await lintMonorepoPackageJSONs(REPO_ROOT);
