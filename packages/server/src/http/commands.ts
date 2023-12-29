import type {
  CommandErrorData,
  CommandUserLeftData,
  CommandWelcomeData,
} from "@hanabi/data";
import {
  Command,
  CommandErrorDataSchema,
  CommandUserLeftDataSchema,
  CommandWelcomeDataSchema,
} from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import { validateInterfaceMatchesEnum } from "isaacscript-common-ts";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface CommandData {
  [Command.error]: CommandErrorData;
  [Command.userLeft]: CommandUserLeftData;
  [Command.welcome]: CommandWelcomeData;
}

validateInterfaceMatchesEnum<CommandData, Command>();

const commandSchemas = {
  [Command.error]: CommandErrorDataSchema,
  [Command.userLeft]: CommandUserLeftDataSchema,
  [Command.welcome]: CommandWelcomeDataSchema,
} as const satisfies Record<Command, unknown>;

export const commandStringifyFuncs = Object.fromEntries(
  Object.entries(commandSchemas).map(([key, value]) => {
    const jsonSchema = zodToJsonSchema(value, key) as AnySchema;
    const stringifyFunc = fastJSONStringify(jsonSchema);
    return [key, stringifyFunc];
  }),
) as Record<Command, (data: unknown) => string>;
