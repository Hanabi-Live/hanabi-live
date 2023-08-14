import pino from "pino";
import { IS_DEV } from "./env";

const options = IS_DEV
  ? {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
        },
      },
    }
  : {};

/** See: https://github.com/pinojs/pino/issues/1782 */
export const logger = pino(options);
