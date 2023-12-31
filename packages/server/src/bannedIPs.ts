// We store banned IPs both in memory (for speed) and in the database (for persistence). When a new
// IP is banned, it must be added to both places.

import { setAdd } from "isaacscript-common-ts";
import { models } from "./models";

const bannedIPsSet = new Set<string>();

export async function bannedIPsInit(): Promise<void> {
  const bannedIPs = await models.bannedIPs.getAll();
  setAdd(bannedIPsSet, ...bannedIPs);
}

export function isBannedIP(ip: string): boolean {
  return bannedIPsSet.has(ip);
}

// TODO: add to bannedIPsSet when user is banned live
