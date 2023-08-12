import pino from "pino";

// See: https://github.com/pinojs/pino/issues/1782
// eslint-disable-next-line import/no-mutable-exports
export let logger = pino();

export const PINO_OPTIONS_FOR_DEV = {
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
} as const;

export function setLoggerPretty(): void {
  logger = pino(PINO_OPTIONS_FOR_DEV);
}
