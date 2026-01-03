import { updatePackageJSONDependenciesMonorepo } from "complete-node";
import path from "node:path";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

await updatePackageJSONDependenciesMonorepo(REPO_ROOT);
