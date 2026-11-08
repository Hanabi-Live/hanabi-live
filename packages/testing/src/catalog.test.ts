import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { expect, test } from "bun:test";
import { isArray } from "complete-common";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { ROOT } from "./mainProcessSupport";

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
  if (isRecord(value) && typeof server === "string") {
    return value["name"];
  }
  // eslint-disable-next-line unicorn/no-null -- The server writes absent values as JSON null.
  return value ?? null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !isArray(value);
}

test("the server's rules derive the same variants as the game library", () => {
  const output = execFileSync(CATALOG, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const serverVariants = z
    .array(z.looseObject({ name: z.string() }))
    .parse(JSON.parse(output));

  expect(serverVariants.map((variant) => variant.name)).toEqual([
    ...VARIANT_NAMES,
  ]);
  for (const serverVariant of serverVariants) {
    const variant = getVariant(serverVariant.name);
    expect(asServer(variant, serverVariant)).toEqual(serverVariant);
  }
});
