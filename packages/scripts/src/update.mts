import { updatePackageJSONDependenciesMonorepo } from "complete-node";
import path from "node:path";

const PACKAGE_ROOT = path.join(import.meta.dirname, "..");
const REPO_ROOT = path.join(PACKAGE_ROOT, "..", "..");

await updatePackageJSONDependenciesMonorepo(REPO_ROOT);
