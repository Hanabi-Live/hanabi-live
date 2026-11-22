import { gameInitSchema } from "@hanabi-live/data";
import { addVariant, getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { expect, test } from "bun:test";
import { isArray } from "complete-common";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { ROOT } from "./mainProcessSupport.ts";

/** Prints the server's variants as JSON. "runTests.ts" builds it. */
const CATALOG = path.join(ROOT, "server/target/debug/examples/catalog");

/**
 * Reads a game library value in the shape of the server's value: only the server's properties,
 * colors by name, and null for absent values.
 */
function asServer(value: unknown, server: unknown): unknown {
  if (isArray(value) && isArray(server)) {
    return value.map((item, index) => asServer(item, server[index]));
  }
  if (isRecord(value) && isRecord(server)) {
    return Object.fromEntries(
      Object.entries(server).map(([key, serverValue]) => [
        key,
        asServer(value[key], serverValue),
      ]),
    );
  }
  if (typeof server === "string" && isRecord(value)) {
    return value["name"];
  }
  // eslint-disable-next-line unicorn/no-null -- The server writes absent values as JSON null.
  return value ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !isArray(value);
}

const output = execFileSync(CATALOG, {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

/** The server's variants, and the rules that clients build each one from. */
const serverVariantSchema = z.looseObject({ name: z.string() });
const catalog = z
  .object({
    variants: z.array(serverVariantSchema),
    rules: z.array(z.unknown()),
  })
  .parse(JSON.parse(output));

test("the server's rules derive the same variants as the game library", () => {
  const serverVariants = catalog.variants;

  expect(serverVariants.map((variant) => variant.name)).toEqual([
    ...VARIANT_NAMES,
  ]);
  for (const serverVariant of serverVariants) {
    const variant = getVariant(serverVariant.name);
    expect(asServer(variant, serverVariant)).toEqual(serverVariant);
  }
});

test("a variant built from the rules in GameInit is the catalog's variant", () => {
  expect(catalog.rules).toHaveLength(VARIANT_NAMES.length);
  for (const [index, name] of VARIANT_NAMES.entries()) {
    const fromCatalog = getVariant(name);
    const rules = gameInitSchema
      .unwrap()
      .shape.variant.parse(catalog.rules[index]);
    expect(addVariant(rules)).toEqual(fromCatalog);
  }
});
