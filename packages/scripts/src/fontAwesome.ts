import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

/** The directory that the server serves fonts from. */
export const FONT_DIR_URL = "/public/webfonts/";

/** The solid Font Awesome font, with every icon, as "copyFontAwesome.ts" copies it. */
export const FONT_AWESOME_FONT_NAME = "fa-solid-900.woff2";
export const FONT_AWESOME_FONT_URL = `${FONT_DIR_URL}${FONT_AWESOME_FONT_NAME}`;
export const FONT_AWESOME_FONT_PATH = path.join(
  REPO_ROOT,
  "public",
  "webfonts",
  FONT_AWESOME_FONT_NAME,
);
