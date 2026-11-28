import type { PlayerIndex } from "@hanabi-live/game";
import { HYPO_PREFIX } from "@hanabi-live/game";

/**
 * The player whose action wrote a line of the action log, if any. Each such line starts with the
 * name of the player who acted. When one name starts with another (such as "Al" and "Alice"), the
 * line belongs to the longer name that it starts with.
 */
export function getLogLinePlayerIndex(
  text: string,
  playerNames: readonly string[],
): PlayerIndex | undefined {
  // A line of a hypothetical has a prefix before the name.
  const line = text.startsWith(HYPO_PREFIX)
    ? text.slice(HYPO_PREFIX.length)
    : text;

  let longest: number | undefined;
  for (const [i, name] of playerNames.entries()) {
    if (
      line.startsWith(name)
      && (longest === undefined || name.length > playerNames[longest]!.length)
    ) {
      longest = i;
    }
  }

  return longest as PlayerIndex | undefined;
}
