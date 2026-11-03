import hooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import { hanabiConfigBase } from "../../eslint.config.mjs";

export default defineConfig(
  ...hanabiConfigBase,
  {
    files: ["*.config.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "no-param-reassign": ["error", { props: false }],
      "unicorn/no-null": "off",
      "complete/require-variadic-function-argument": "off",
      "@typescript-eslint/no-floating-promises": [
        "error",
        { ignoreVoid: true },
      ],
      "no-void": ["error", { allowAsStatement: true }],
      // UI strings use empty as absence; wire IDs are validated positive integers.
      "@typescript-eslint/strict-boolean-expressions": [
        "error",
        {
          allowString: true,
          allowNumber: true,
          allowNullableString: true,
          allowNullableNumber: true,
        },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    files: ["src/store.ts"],
    rules: {
      // Normalized entity maps remove validated numeric IDs inside Immer reducers.
      "@typescript-eslint/no-dynamic-delete": "off",
    },
  },
  {
    files: ["src/main.tsx", "src/prototypes/main.tsx"],
    rules: {
      "import-x/no-unassigned-import": ["error", { allow: ["**/*.css"] }],
    },
  },
  {
    files: ["**/*.tsx"],
    rules: {
      // React event handlers and state setters intentionally discard callback return values.
      "@typescript-eslint/strict-void-return": "off",
      "@typescript-eslint/no-confusing-void-expression": [
        "error",
        { ignoreArrowShorthand: true },
      ],
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "no-nested-ternary": "off",
    },
  },
  { ignores: ["test-results/**", "playwright-report/**"] },
);
