import { expect, test } from "bun:test";
import { lintDependencyCatalog } from "./dependencyCatalog";

const root = {
  name: "root",
  workspaces: {
    packages: ["packages/*"],
    catalog: { react: "19.3.1", typescript: "6.0.3" },
  },
  devDependencies: { typescript: "catalog:" },
};
const game = { name: "@hanabi-live/game", dependencies: { react: "catalog:" } };
const workspaces = [
  game,
  {
    name: "@hanabi-live/client",
    dependencies: { "@hanabi-live/game": "workspace:*", react: "catalog:" },
  },
];

test("catalogs centralize external versions while local packages remain workspaces", () => {
  expect(() => {
    lintDependencyCatalog(root, workspaces);
  }).not.toThrow();
});

test("inline versions and undefined catalog references fail the dependency check", () => {
  for (const dependencies of [{ react: "19.3.1" }, { missing: "catalog:" }]) {
    expect(() => {
      lintDependencyCatalog(root, [{ name: "client", dependencies }]);
    }).toThrow("must reference a defined catalog");
  }
});

test("catalog ranges, unused entries, and cataloged local packages are rejected", () => {
  expect(() => {
    lintDependencyCatalog(
      {
        ...root,
        workspaces: {
          ...root.workspaces,
          catalog: { ...root.workspaces.catalog, react: "^19.3.1" },
        },
      },
      workspaces,
    );
  }).toThrow("exact version");
  expect(() => {
    lintDependencyCatalog(
      {
        ...root,
        workspaces: {
          ...root.workspaces,
          catalog: { ...root.workspaces.catalog, unused: "1.0.0" },
        },
      },
      workspaces,
    );
  }).toThrow("Unused catalog dependency");
  expect(() => {
    lintDependencyCatalog(
      {
        ...root,
        workspaces: {
          ...root.workspaces,
          catalog: { ...root.workspaces.catalog, "@hanabi-live/game": "0.0.8" },
        },
      },
      workspaces,
    );
  }).toThrow("must not be in the catalog");
});

test("local dependencies cannot silently resolve to registry packages", () => {
  expect(() => {
    lintDependencyCatalog(root, [
      game,
      { name: "client", dependencies: { "@hanabi-live/game": "catalog:" } },
    ]);
  }).toThrow("must use workspace:*");
});
