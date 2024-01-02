import { tableID } from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { game } from "./Game";
import { PlayerSchema } from "./Player";

const table = z.object({
  id: tableID,
  players: PlayerSchema.array(),
  game,
});

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Table extends z.infer<typeof table> {}

const jsonSchema = zodToJsonSchema(table, "Game") as AnySchema;
export const tableStringifyFunc = fastJSONStringify(jsonSchema) as (
  table: Table,
) => string;
