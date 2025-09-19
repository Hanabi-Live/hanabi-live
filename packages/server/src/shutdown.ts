const shuttingDown = false;
// eslint-disable-next-line no-unassigned-vars
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
