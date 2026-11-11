import { expect, test } from "bun:test";
import type { z } from "zod";
import {
  catalogCharacterSchema,
  catalogColorSchema,
  catalogSuitSchema,
  catalogVariantSchema,
} from "./generated/protocol.js";
import charactersJSON from "./json/characters.json" with { type: "json" };
import colorsJSON from "./json/colors.json" with { type: "json" };
import suitsJSON from "./json/suits.json" with { type: "json" };
import variantsJSON from "./json/variants.json" with { type: "json" };

// The loaders use these files without parsing them, so this checks them against the server's
// catalog contract.
const catalogFiles: ReadonlyArray<readonly [string, z.ZodType, unknown]> = [
  ["characters.json", catalogCharacterSchema, charactersJSON],
  ["colors.json", catalogColorSchema, colorsJSON],
  ["suits.json", catalogSuitSchema, suitsJSON],
  ["variants.json", catalogVariantSchema, variantsJSON],
];

test.each(catalogFiles)(
  "%s matches the catalog contract",
  (_file, schema, entries) => {
    const result = schema.array().min(1).safeParse(entries);
    expect(result.error).toBeUndefined();
  },
);
