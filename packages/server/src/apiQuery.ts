import type { UserID } from "@hanabi-live/data";

type Field = "id" | "numPlayers" | "score" | "variantID";

export interface PublicGameSelection {
  readonly userIDs?: readonly UserID[];
  readonly seed?: string;
  readonly variantID?: number;
  readonly start?: number;
  readonly end?: number;
}

export interface PublicGameQuery extends PublicGameSelection {
  readonly size: number;
  readonly offset: number;
  readonly order: Exclude<Field, "variantID">;
  readonly ascending: boolean;
  readonly filters: ReadonlyArray<{
    readonly field: Field;
    readonly value: number;
  }>;
}

export interface PublicGameRow {
  readonly id: number;
  readonly num_players: number;
  readonly score: number;
  readonly variant: number;
  readonly users: string;
  readonly datetime: string;
  readonly seed: string;
  readonly other_scores: number;
}

export function parseAPIInteger(value: string | undefined): number | undefined {
  if (value === undefined || !/^[+-]?\d+$/u.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function first(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

export function parseGameQuery(
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
  mode: "history" | "seed" | "variant",
): PublicGameQuery {
  const page = Math.max(0, parseAPIInteger(first(query["page"])) ?? 0);
  const requestedSize = parseAPIInteger(first(query["size"]));
  const size =
    requestedSize !== undefined && requestedSize >= 0 && requestedSize <= 100
      ? requestedSize
      : 10;
  if (!Number.isSafeInteger(page * size)) {
    throw new RangeError("Pagination offset is too large.");
  }
  const orderFields = ["id", "numPlayers", "score"] as const;
  let filterFields: ReadonlyArray<Field | undefined>;
  if (mode === "history") {
    filterFields = ["id", "numPlayers", "score", "variantID"];
  } else if (mode === "seed") {
    filterFields = ["id", undefined, "score"];
  } else {
    filterFields = ["id", "numPlayers", "score"];
  }
  let order: PublicGameQuery["order"] = mode === "history" ? "id" : "score";
  let ascending = false;
  let sorted = false;
  const filters: Array<{ field: Field; value: number }> = [];
  for (const [key, values] of Object.entries(query)) {
    const value = first(values);
    const sortMatch = /^col\[(\d+)\]$/u.exec(key);
    if (sortMatch !== null && !sorted) {
      const index = parseAPIInteger(sortMatch[1]);
      const field = index === undefined ? undefined : orderFields[index];
      if (field !== undefined) {
        order = field;
        ascending = value === "0";
        sorted = true;
      }
    }
    const filterMatch = /^fcol\[(\d+)\]$/u.exec(key);
    if (filterMatch === null || value === undefined || value === "") {
      continue;
    }
    const index = parseAPIInteger(filterMatch[1]);
    const field = index === undefined ? undefined : filterFields[index];
    if (field !== undefined) {
      const number = parseAPIInteger(value);
      if (number === undefined) {
        throw new RangeError(`Invalid numeric filter for ${field}.`);
      }
      filters.push({ field, value: number });
    }
  }
  return { size, offset: page * size, order, ascending, filters };
}
