import {
  errorDetails,
  replayGameSchema,
  validationErrorDetails,
} from "@hanabi-live/data";
import type { z } from "zod";

export type GameJson = z.output<typeof replayGameSchema>;

type ParsedGameJson =
  { readonly gameJson: GameJson } | { readonly error: string };

/** Parses game JSON that someone pasted or linked, in the format the server imports. */
export function parseGameJson(text: string): ParsedGameJson {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { error: errorDetails(error, "Parsing game JSON") };
  }
  const result = replayGameSchema.safeParse(value);
  return result.success
    ? { gameJson: result.data }
    : { error: `Invalid game JSON: ${validationErrorDetails(result.error)}` };
}
