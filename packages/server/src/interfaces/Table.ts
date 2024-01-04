import { tableID, userID } from "@hanabi/data";
import { numPlayers, options } from "@hanabi/game";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import z from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { extraOptions } from "./ExtraOptions";
import { game } from "./Game";
import { serverSpectator } from "./ServerSpectator";
import { tablePlayer } from "./TablePlayer";

const tableChatMessage = z
  .object({
    userID,
    username: z.string().min(1),
    msg: z.string().min(1),
  })
  .strict()
  .readonly();

const table = z
  .object({
    id: tableID,
    name: z.string().min(1),
    initialName: z.string().min(1),

    players: tablePlayer.array(),
    maxPlayers: numPlayers,
    spectators: serverSpectator.array(),
    kickedPlayers: userID.array(), // We cannot use a set since it is not serializable.

    ownerID: userID,
    visible: z.boolean(),
    passwordHash: z.string().min(1).optional(),
    running: z.boolean(),
    replay: z.boolean(),
    progress: z.number().int().min(0).max(100),

    datetimeCreated: z.date(),
    datetimeLastJoined: z.date(),
    datetimePlannedStart: z.date(),
    datetimeLastAction: z.date(),

    game,
    options,
    extraOptions,

    chat: tableChatMessage.array(),
    chatRead: z.record(userID, z.number().int()),
  })
  .strict();

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface Table extends z.infer<typeof table> {}

const jsonSchema = zodToJsonSchema(table, "Game") as AnySchema;
export const tableStringifyFunc = fastJSONStringify(jsonSchema) as (
  table: Table,
) => string;
