import pino from "pino";

// See: https://github.com/pinojs/pino/issues/1782
// eslint-disable-next-line import/no-mutable-exports
export let logger = pino();

export function setLoggerPretty(): void {
  logger = pino({
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
      },
    },
  });
}
