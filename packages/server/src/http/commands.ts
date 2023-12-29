import type { CommandErrorData, CommandUserLeftData } from "@hanabi/data";
import {
  Command,
  CommandErrorDataSchema,
  CommandUserLeftDataSchema,
} from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import { validateInterfaceMatchesEnum } from "isaacscript-common-ts";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface CommandData {
  [Command.error]: CommandErrorData;
  [Command.userLeft]: CommandUserLeftData;
}

validateInterfaceMatchesEnum<CommandData, Command>();

const commandSchemas = {
  [Command.error]: CommandErrorDataSchema,
  [Command.userLeft]: CommandUserLeftDataSchema,
} as const satisfies Record<Command, unknown>;

export const commandStringifyFuncs = Object.fromEntries(
  Object.entries(commandSchemas).map(([key, value]) => {
    const jsonSchema = zodToJsonSchema(value, key) as AnySchema;
    const stringifyFunc = fastJSONStringify(jsonSchema);
    return [key, stringifyFunc];
  }),
) as Record<Command, (data: unknown) => string>;
