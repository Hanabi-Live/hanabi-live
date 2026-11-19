// Copies the Font Awesome stylesheets and the solid font from its package into "public", where the
// server serves them. "bun install" runs this script, so the copies always match the installed
// version. Git ignores the copies.

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const PACKAGE_DIR = path.dirname(
  fileURLToPath(
    import.meta.resolve("@fortawesome/fontawesome-free/package.json"),
  ),
);
const CSS_DIR = path.join(REPO_ROOT, "public", "css", "lib");
const FONT_DIR = path.join(REPO_ROOT, "public", "webfonts");
const STYLESHEETS = ["fontawesome.min.css", "solid.min.css"] as const;
const FONT = "fa-solid-900.woff2";

/**
 * The stylesheets point to the font relative to their own directory. The development pages load
 * them from "public/css/lib", and the production bundle from "public/css", so both use the path
 * that the server serves the font at.
 */
const RELATIVE_FONT_DIR = "../webfonts/";
const SERVED_FONT_DIR = "/public/webfonts/";

async function copyStylesheet(stylesheet: string) {
  const text = await Bun.file(path.join(PACKAGE_DIR, "css", stylesheet)).text();
  await Bun.write(
    path.join(CSS_DIR, stylesheet),
    text.replaceAll(RELATIVE_FONT_DIR, SERVED_FONT_DIR),
  );
}

async function main() {
  await mkdir(CSS_DIR, { recursive: true });
  await mkdir(FONT_DIR, { recursive: true });
  await Promise.all([
    ...STYLESHEETS.map(copyStylesheet),
    copyFile(
      path.join(PACKAGE_DIR, "webfonts", FONT),
      path.join(FONT_DIR, FONT),
    ),
  ]);
}

await main();
