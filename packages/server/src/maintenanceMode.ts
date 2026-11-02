import { ServerCommand } from "@hanabi-live/data";
import { logger } from "./logger";
import { wsSendAll } from "./wsHelpers";

let maintenanceMode = false;

export function isMaintenanceMode(): boolean {
  return maintenanceMode;
}

export function setMaintenanceMode(enabled: boolean): void {
  maintenanceMode = enabled;
  wsSendAll(ServerCommand.maintenance, { maintenanceMode });
  logger.info(`Maintenance mode ${enabled ? "enabled" : "disabled"}.`);
}
