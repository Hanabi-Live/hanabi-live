const shuttingDown = false;
let datetimeShutdownInit: string | undefined;

interface ShuttingDownMetadata {
  shuttingDown: boolean;
  datetimeShutdownInit: string | undefined;
}

export function getShuttingDownMetadata(): ShuttingDownMetadata {
  return {
    shuttingDown,
    datetimeShutdownInit,
  };
}
