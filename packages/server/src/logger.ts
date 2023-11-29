import { pino } from "pino";
import { IS_DEV } from "./env";

const DEV_OPTIONS = {
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
} as const;

const OPTIONS = IS_DEV ? DEV_OPTIONS : undefined;

/** @see https://github.com/pinojs/pino/issues/1782 */
export const logger = pino(OPTIONS);
