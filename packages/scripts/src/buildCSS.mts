// Minifies the stylesheets with Lightning CSS, failing on any CSS that it cannot parse. Usage:
// - `bun buildCSS.mts <output>` bundles the stylesheets that production pages load.
// - `bun buildCSS.mts --critical` minifies the critical CSS that "build-critical-css.sh" generates.

import { transform } from "lightningcss";
import path from "node:path";

const CSS_DIR = path.resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "public",
  "css",
);

/** The stylesheets in the bundle, in order. Development pages load them separately. */
const BUNDLE = [
  "lib/fontawesome.min.css",
  "lib/solid.min.css",
  "lib/alpha.css",
  "hanabi.css",
  "dark.css",
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function minify(filename: string): Promise<string> {
  const code = await Bun.file(path.join(CSS_DIR, filename)).bytes();
  let result: ReturnType<typeof transform>;
  try {
    result = transform({ filename, code, minify: true });
  } catch (error) {
    // The error also holds the whole stylesheet, so report only where and what it is.
    fail(`${filename}:${location(error)} ${String(error)}`);
  }

  const [warning] = result.warnings;
  if (warning !== undefined) {
    fail(
      `${filename}:${warning.loc.line}:${warning.loc.column}: ${warning.message}`,
    );
  }
  return new TextDecoder().decode(result.code);
}

function location(error: unknown): string {
  if (
    typeof error === "object"
    && error !== null
    && "loc" in error
    && typeof error.loc === "object"
    && error.loc !== null
    && "line" in error.loc
    && "column" in error.loc
  ) {
    return `${String(error.loc.line)}:${String(error.loc.column)}:`;
  }
  return "";
}

async function main() {
  const [output, ...rest] = process.argv.slice(2);
  if (output === undefined || rest.length > 0) {
    fail("Usage: bun buildCSS.mts <output> | --critical");
  }

  if (output === "--critical") {
    await Bun.write(
      path.join(CSS_DIR, "critical.min.css"),
      await minify("critical.css"),
    );
    return;
  }

  const minified = await Promise.all(BUNDLE.map(minify));
  await Bun.write(output, minified.join("\n"));
}

await main();
