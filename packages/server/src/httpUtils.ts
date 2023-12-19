import { PROJECT_NAME } from "@hanabi/data";
import { IS_DEV } from "./env";
import { getClientVersion } from "./version";

/**
 * Some variables are used by the "layout.eta" file, meaning that they are needed for every page
 * across the website.
 *
 * This cannot be a constant object because we want the version of the client to be updatable
 * without restarting the server.
 */
// This cannot return `TemplateVariables` since it does not include the title yet.
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function getTemplateVariables() {
  return {
    projectName: PROJECT_NAME,
    isDev: IS_DEV,
    version: getClientVersion(),
  } as const;
}
