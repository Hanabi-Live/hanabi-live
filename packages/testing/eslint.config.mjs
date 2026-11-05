// @ts-check
import { defineConfig } from "eslint/config";
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default defineConfig(
  ...hanabiConfigBase,
  {
    files: ["src/**/*.ts"],
    rules: {
      "import-x/no-extraneous-dependencies": [
        "error",
        { devDependencies: true },
      ],
    },
  },
  {
    files: ["src/database.ts", "src/database.test.ts"],
    rules: {
      // Postgres identifier quoting accepts one argument despite its variadic overload.
      "complete/require-variadic-function-argument": "off",
    },
  },
);
