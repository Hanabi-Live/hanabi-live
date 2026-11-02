import type { ErrorEvent } from "@sentry/node";
import path from "node:path";

let capture: (() => void) | undefined;

export function reportServerError(): void {
  capture?.();
}

export async function initializeErrorReporting(
  development: boolean,
  dsn: string | undefined,
  release: string,
): Promise<() => Promise<boolean>> {
  if (development || dsn === undefined || dsn === "") {
    // eslint-disable-next-line @typescript-eslint/require-await
    return async () => true;
  }
  if (!URL.canParse(dsn)) {
    throw new Error("Invalid SENTRY_DSN.");
  }
  const parsed = new URL(dsn);
  if (
    !["http:", "https:"].includes(parsed.protocol)
    || !/^\w+$/u.test(parsed.username)
    || (parsed.password !== "" && !/^\w+$/u.test(parsed.password))
    || !/\/\d+$/u.test(parsed.pathname)
  ) {
    throw new Error("Invalid SENTRY_DSN.");
  }
  const sentry = await import("@sentry/node");
  const client = sentry.init({
    dsn,
    release,
    defaultIntegrations: false,
    enableRuntimeChannelInjection: false,
    enableOpenTelemetrySetup: false,
    includeServerName: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    sendClientReports: false,
    maxBreadcrumbs: 0,
    transportOptions: { bufferSize: 30 },
    beforeSend: (event): ErrorEvent => ({
      type: undefined,
      event_id: event.event_id,
      timestamp: event.timestamp,
      platform: "node",
      level: "error",
      release,
      exception: {
        values: event.exception?.values?.map((exception) => ({
          type: "Error",
          value: "Server error; inspect local logs.",
          stacktrace: {
            frames: exception.stacktrace?.frames?.map((frame) => ({
              filename:
                frame.filename === undefined
                  ? undefined
                  : path.basename(frame.filename),
              function: frame.function,
              lineno: frame.lineno,
              colno: frame.colno,
            })),
          },
        })),
      },
    }),
  });
  if (client?.getDsn() === undefined) {
    throw new Error("Sentry initialization failed.");
  }
  // Never pass log arguments: they can contain credentials, chat, or hidden cards.
  capture = () => {
    client.captureException(new Error("Server error; inspect local logs."));
  };
  return async () => {
    capture = undefined;
    return await client.close(2000);
  };
}
