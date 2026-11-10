// Bundles "public/css/main.css" and its imports, which every production page loads, and minifies
// them with Lightning CSS, failing on any CSS that it cannot parse. Usage: `bun buildCSS.mts <out>`

import type { SelectorComponent, Visitor } from "lightningcss";
import { bundle } from "lightningcss";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

/** Development pages load this file, and the browser follows its imports. */
const ENTRY = path.resolve(REPO_ROOT, "public", "css", "main.css");

/**
 * Font Awesome defines about 1,300 icons and many helper classes (such as "fa-spin"), and the site
 * uses few of them. The bundle keeps only the Font Awesome classes that these files name in full,
 * such as "fa-check".
 */
const ICON_SOURCE_DIRECTORIES = [
  "packages/client/src",
  "public/standalone",
  "server/src",
  "server/templates",
] as const;
const ICON_SOURCE_FILES = new Bun.Glob("**/*.{html,rs,ts,tsx}");

/** A Font Awesome class: "fa", a style such as "fas", or a name such as "fa-check". */
const FONT_AWESOME_CLASS = String.raw`fa(?:[a-z]|-[\d\-a-z]+)?`;
const FONT_AWESOME_CLASS_IN_TEXT = new RegExp(
  String.raw`\b${FONT_AWESOME_CLASS}\b`,
  "gu",
);
const FONT_AWESOME_CLASS_NAME = new RegExp(`^${FONT_AWESOME_CLASS}$`, "u");

/** An icon name that is put together at runtime, which the search for icon names cannot see. */
const BUILT_ICON_NAME = /\bfa-(?:\$\{|\{\{)/u;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function location(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const fileName =
    "fileName" in error && typeof error.fileName === "string"
      ? path.relative(REPO_ROOT, error.fileName)
      : "";
  if (
    "loc" in error
    && typeof error.loc === "object"
    && error.loc !== null
    && "line" in error.loc
    && "column" in error.loc
  ) {
    return `${fileName}:${String(error.loc.line)}:${String(error.loc.column)}:`;
  }
  return fileName === "" ? "" : `${fileName}:`;
}

async function getUsedIcons(): Promise<ReadonlySet<string>> {
  const files = ICON_SOURCE_DIRECTORIES.flatMap((directory) =>
    [
      ...ICON_SOURCE_FILES.scanSync({ cwd: path.join(REPO_ROOT, directory) }),
    ].map((file) => path.join(directory, file)),
  );
  const texts = await Promise.all(
    files.map(
      async (file) => await Bun.file(path.join(REPO_ROOT, file)).text(),
    ),
  );
  const icons = new Set<string>();
  for (const [i, text] of texts.entries()) {
    if (BUILT_ICON_NAME.test(text)) {
      fail(
        `${files[i]}: Write icon class names in full (such as "fa-check"), so that the CSS bundle keeps their icons.`,
      );
    }
    for (const [icon] of text.matchAll(FONT_AWESOME_CLASS_IN_TEXT)) {
      icons.add(icon);
    }
  }
  return icons;
}

/** Whether a selector, such as ".fa-check:before", names a Font Awesome class that is not used. */
function usesUnusedClass(
  selector: readonly SelectorComponent[],
  usedIcons: ReadonlySet<string>,
): boolean {
  return selector.some(
    (component) =>
      component.type === "class"
      && FONT_AWESOME_CLASS_NAME.test(component.name)
      && !usedIcons.has(component.name),
  );
}

/** Removes the rules of the Font Awesome classes that the site does not use. */
function getIconPruner(usedIcons: ReadonlySet<string>): Visitor<never> {
  return {
    Rule: {
      // Lightning CSS defines the types of the rule and of the returned rules.
      // eslint-disable-next-line complete/no-mutable-return
      style(rule) {
        const selectors = rule.value.selectors.filter(
          // eslint-disable-next-line complete/prefer-readonly-parameter-types
          (selector) => !usesUnusedClass(selector, usedIcons),
        );
        if (selectors.length === rule.value.selectors.length) {
          return undefined;
        }
        // An empty list removes the rule.
        return selectors.length === 0
          ? []
          : { ...rule, value: { ...rule.value, selectors } };
      },
      // Font Awesome names each animation after the class that uses it, such as "fa-spin".
      // eslint-disable-next-line complete/no-mutable-return
      keyframes(rule) {
        const { value: name } = rule.value.name;
        return FONT_AWESOME_CLASS_NAME.test(name) && !usedIcons.has(name)
          ? []
          : undefined;
      },
    },
  };
}

async function main() {
  const [output, ...rest] = process.argv.slice(2);
  if (output === undefined || rest.length > 0) {
    fail("Usage: bun buildCSS.mts <out>");
  }

  const usedIcons = await getUsedIcons();
  let result: ReturnType<typeof bundle>;
  try {
    result = bundle({
      filename: ENTRY,
      minify: true,
      visitor: getIconPruner(usedIcons),
    });
  } catch (error) {
    // The error can also hold a whole stylesheet, so report only where and what it is.
    fail(`${location(error)} ${String(error)}`);
  }

  const [warning] = result.warnings;
  if (warning !== undefined) {
    fail(
      `${path.relative(REPO_ROOT, warning.loc.filename)}:${warning.loc.line}:${warning.loc.column}: ${warning.message}`,
    );
  }
  await Bun.write(output, result.code);
}

await main();
