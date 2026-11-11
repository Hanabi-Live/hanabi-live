import { getMonorepoPackageNames, getPackageJSON } from "complete-node";
import path from "node:path";
import { lintDependencyCatalog } from "./dependencyCatalog.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");
const REPO_ROOT = path.resolve(PACKAGE_ROOT, "..", "..");

const root = await getPackageJSON(REPO_ROOT);
const names = await getMonorepoPackageNames(REPO_ROOT);
const workspaces = await Promise.all(
  names.map(
    async (name) =>
      await getPackageJSON(path.join(REPO_ROOT, "packages", name)),
  ),
);
lintDependencyCatalog(root, workspaces);
