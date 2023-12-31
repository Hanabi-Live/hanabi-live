import { gameID } from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { PlayerSchema } from "./Player";

const game = z.object({
  id: gameID,
  players: PlayerSchema.array(),
});

export type Game = z.infer<typeof game>;

const jsonSchema = zodToJsonSchema(game, "Game") as AnySchema;
export const gameStringifyFunc = fastJSONStringify(jsonSchema) as (
  game: Game,
) => string;
