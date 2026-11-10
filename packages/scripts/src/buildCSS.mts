// Bundles "public/css/main.css" and its imports, which every production page loads, and minifies
// them with Lightning CSS, failing on any CSS that it cannot parse. Usage: `bun buildCSS.mts <out>`

import { bundle } from "lightningcss";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..", "..", "..");

/** Development pages load this file, and the browser follows its imports. */
const ENTRY = path.resolve(REPO_ROOT, "public", "css", "main.css");

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

async function main() {
  const [output, ...rest] = process.argv.slice(2);
  if (output === undefined || rest.length > 0) {
    fail("Usage: bun buildCSS.mts <out>");
  }

  let result: ReturnType<typeof bundle>;
  try {
    result = bundle({ filename: ENTRY, minify: true });
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
