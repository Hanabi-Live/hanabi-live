import { assertObject, assertString } from "complete-common";

type Manifest = Readonly<Record<string, unknown>>;
const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const EXACT_VERSION =
  /^\d+\.\d+\.\d+(?:-[\d\-.A-Za-z]+)?(?:\+[\d\-.A-Za-z]+)?$/u;

export function lintDependencyCatalog(
  root: Manifest,
  workspaces: readonly Manifest[],
): void {
  const { workspaces: configuration } = root;
  assertObject(
    configuration,
    "The root package.json must define a workspace catalog.",
  );
  const { catalog } = configuration;
  assertObject(
    catalog,
    "The root package.json must define a dependency catalog.",
  );
  const names = new Set(
    workspaces.map((workspace) => {
      const { name } = workspace;
      assertString(name, "Each workspace must have a package name.");
      return name;
    }),
  );
  const used = new Set<string>();
  for (const [name, version] of Object.entries(catalog)) {
    assertString(version, `Catalog version for ${name} must be a string.`);
    if (!EXACT_VERSION.test(version)) {
      throw new Error(`Catalog dependency ${name} must pin an exact version.`);
    }
    if (names.has(name)) {
      throw new Error(`Local workspace ${name} must not be in the catalog.`);
    }
  }
  for (const manifest of [root, ...workspaces]) {
    const packageName = manifest["name"];
    assertString(packageName, "Each package must have a name.");
    for (const section of DEPENDENCY_SECTIONS) {
      const dependencies = manifest[section];
      if (dependencies === undefined) {
        continue;
      }
      assertObject(
        dependencies,
        `${packageName}.${section} must be an object.`,
      );
      for (const [name, version] of Object.entries(dependencies)) {
        if (names.has(name)) {
          if (version !== "workspace:*") {
            throw new Error(`${packageName}: ${name} must use workspace:*.`);
          }
        } else {
          if (version !== "catalog:" || !Object.hasOwn(catalog, name)) {
            throw new Error(
              `${packageName}: ${name} must reference a defined catalog: entry.`,
            );
          }
          used.add(name);
        }
      }
    }
  }
  for (const name of Object.keys(catalog)) {
    if (!used.has(name)) {
      throw new Error(`Unused catalog dependency: ${name}`);
    }
  }
}
