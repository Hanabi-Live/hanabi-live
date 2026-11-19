// Bundles "public/css/main.css" and its imports, which every production page loads, and minifies
// them with Lightning CSS, failing on any CSS that it cannot parse. Beside the bundle, it writes
// the Font Awesome font with only the icons that the bundle keeps. Usage: `bun buildCss.ts <out>`,
// where `<out>` ends with ".min.css".

import type { SelectorComponent, Visitor } from "lightningcss";
import { bundle } from "lightningcss";
import path from "node:path";
import subsetFont from "subset-font";
import {
  FONT_AWESOME_FONT_PATH,
  FONT_AWESOME_FONT_URL,
} from "./fontAwesome.ts";

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

/**
 * The properties whose strings are characters of the font, such as `--fa: "\f00c"` for "fa-check",
 * and `content: "\f00c"` for a checked box.
 */
const FONT_CHARACTER_PROPERTIES: ReadonlySet<string> = new Set([
  "--fa",
  "content",
]);

const BUNDLE_SUFFIX = ".min.css";
/** The font of a bundle, such as "main.abc.icons.woff2" for "main.abc.min.css". */
const FONT_SUFFIX = ".icons.woff2";

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

/**
 * Lightning CSS 1.33.0 gives a visitor an empty optional value as `null`, but fails to read `null`
 * back from a returned rule. For example, `var(--fa-width, 1.25em)` has a `from` of `null`. A
 * missing key reads back as an empty value.
 */
function withoutNulls<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, child: unknown) =>
      child === null ? undefined : child,
    ),
  ) as T;
}

/**
 * Removes the rules of the Font Awesome classes that the site does not use. Collects the characters
 * of the font that the other rules show, once the bundle has visited every rule.
 */
function getIconPruner(usedIcons: ReadonlySet<string>): {
  readonly visitor: Visitor<never>;
  readonly characters: ReadonlySet<string>;
} {
  const characters = new Set<string>();
  const visitor: Visitor<never> = {
    Rule: {
      // Lightning CSS defines the types of the rule and of the returned rules.
      // eslint-disable-next-line complete/no-mutable-return
      style(rule) {
        const selectors = rule.value.selectors.filter(
          // eslint-disable-next-line complete/prefer-readonly-parameter-types
          (selector) => !usesUnusedClass(selector, usedIcons),
        );
        if (selectors.length > 0) {
          for (const declaration of rule.value.declarations.declarations) {
            if (
              declaration.property === "custom"
              && FONT_CHARACTER_PROPERTIES.has(declaration.value.name)
            ) {
              for (const token of declaration.value.value) {
                if (token.type === "token" && token.value.type === "string") {
                  for (const character of token.value.value) {
                    characters.add(character);
                  }
                }
              }
            }
          }
        }
        if (selectors.length === rule.value.selectors.length) {
          return undefined;
        }
        // An empty list removes the rule.
        return selectors.length === 0
          ? []
          : withoutNulls({
              ...rule,
              value: {
                ...rule.value,
                selectors,
              },
            });
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
  return {
    visitor,
    characters,
  };
}

async function main() {
  const [output, ...rest] = process.argv.slice(2);
  if (output?.endsWith(BUNDLE_SUFFIX) !== true || rest.length > 0) {
    fail(
      `Usage: bun buildCss.ts <out>, where <out> ends with "${BUNDLE_SUFFIX}"`,
    );
  }

  const { visitor, characters } = getIconPruner(await getUsedIcons());
  let result: ReturnType<typeof bundle>;
  try {
    result = bundle({
      filename: ENTRY,
      minify: true,
      visitor,
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

  // The bundle is next to its font, so it can name the font without a directory.
  const fontPath = `${output.slice(0, -BUNDLE_SUFFIX.length)}${FONT_SUFFIX}`;
  const code = result.code.toString();
  if (!code.includes(FONT_AWESOME_FONT_URL)) {
    fail(`The bundle does not load the font: ${FONT_AWESOME_FONT_URL}`);
  }
  const fullFont = await Bun.file(FONT_AWESOME_FONT_PATH).arrayBuffer();
  const font = await subsetFont(
    Buffer.from(fullFont),
    [...characters].join(""),
    { targetFormat: "woff2" },
  );
  const bundleCode = code.replaceAll(
    FONT_AWESOME_FONT_URL,
    path.basename(fontPath),
  );
  await Promise.all([Bun.write(output, bundleCode), Bun.write(fontPath, font)]);
}

await main();
