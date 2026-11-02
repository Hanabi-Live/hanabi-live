import { pino } from "pino";
import { IS_DEV } from "./env";
import { reportServerError } from "./errorReporting";

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
export const logger = pino({
  ...OPTIONS,
  hooks: {
    logMethod(args, method, level) {
      if (level >= 50) {
        reportServerError();
      }
      // Pino supplies the originating (possibly child) logger as the receiver.
      method.apply(this, args); // eslint-disable-line unicorn/no-this-outside-of-class
    },
  },
});
