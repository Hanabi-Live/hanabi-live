import type {
  CommandChatData,
  CommandErrorData,
  CommandUserLeftData,
  CommandWarningData,
  CommandWelcomeData,
} from "@hanabi/data";
import {
  Command,
  CommandChatDataSchema,
  CommandErrorDataSchema,
  CommandUserLeftDataSchema,
  CommandWarningDataSchema,
  CommandWelcomeDataSchema,
} from "@hanabi/data";
import type { AnySchema } from "fast-json-stringify";
import fastJSONStringify from "fast-json-stringify";
import { validateInterfaceMatchesEnum } from "isaacscript-common-ts";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface CommandData {
  [Command.chat]: CommandChatData;
  [Command.error]: CommandErrorData;
  [Command.userLeft]: CommandUserLeftData;
  [Command.warning]: CommandWarningData;
  [Command.welcome]: CommandWelcomeData;
}

validateInterfaceMatchesEnum<CommandData, Command>();

const commandSchemas = {
  [Command.chat]: CommandChatDataSchema,
  [Command.error]: CommandErrorDataSchema,
  [Command.userLeft]: CommandUserLeftDataSchema,
  [Command.warning]: CommandWarningDataSchema,
  [Command.welcome]: CommandWelcomeDataSchema,
} as const satisfies Record<Command, unknown>;

export const commandStringifyFuncs = Object.fromEntries(
  Object.entries(commandSchemas).map(([key, value]) => {
    const jsonSchema = zodToJsonSchema(value, key) as AnySchema;
    const stringifyFunc = fastJSONStringify(jsonSchema);
    return [key, stringifyFunc];
  }),
) as Record<Command, (data: unknown) => string>;
