// The ESLint configuration that "generate-protocol.sh" formats the generated wire contracts with.
// Wrapping doc comments to their indentation is the only fix the packages' configurations make to
// the generator's output. That rule needs no type information, so this skips loading the
// TypeScript project, which takes several seconds. The packages' lint still checks these files.

import complete from "eslint-plugin-complete";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["**/*.ts"],
  languageOptions: { parser: tseslint.parser },
  plugins: { complete },
  rules: { "complete/format-jsdoc-comments": "error" },
});
