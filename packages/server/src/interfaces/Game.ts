import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { GameID } from "../types/GameID";
import { PlayerSchema } from "./Player";

const GameSchema = z.object({
  id: z.number(),
  players: PlayerSchema.array(),
});

type GameRaw = z.infer<typeof GameSchema>;

export type Game = Omit<GameRaw, "id"> & { id: GameID };

const jsonSchema = zodToJsonSchema(GameSchema, "Game") as AnySchema;
export const gameStringifyFunc = fastJSONStringify(jsonSchema) as (
  game: Game,
) => string;
