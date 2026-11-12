// The icons that summarize a table's options in the lobby, with the tooltips that explain them.

import type { ServerCommandData } from "@hanabi-live/data";
import { SECONDS_PER_MINUTE } from "@hanabi-live/data";
import { secondsToClockString } from "@hanabi-live/game";
import { OptionIcons } from "../enums/OptionIcons.ts";
import { escapeHtml } from "../utils.ts";

export interface OptionDescription {
  /** Identifies the option in element IDs. */
  readonly name: string;
  readonly icon: OptionIcons;
  /** Text shown after the icon. */
  readonly label?: string;
  /** HTML that explains the option. */
  readonly tooltip: string;
}

export function getOptionDescriptions(
  settings: ServerCommandData["table"]["settings"],
): readonly OptionDescription[] {
  const { options } = settings;
  const descriptions: OptionDescription[] = [];

  const { timeControl } = options;
  if (timeControl !== undefined) {
    const timeBase = secondsToClockString(timeControl.baseSeconds);
    descriptions.push({
      name: "timer",
      icon: OptionIcons.Timed,
      label: `(${timeBase} + ${secondsToClockString(timeControl.perTurnSeconds)})`,
      tooltip: `This is a <strong>Timed Game</strong>. The base time is <strong>${timeBase} minute${
        timeControl.baseSeconds === SECONDS_PER_MINUTE ? "" : "s"
      }</strong> plus <strong>${timeControl.perTurnSeconds} second${
        timeControl.perTurnSeconds === 1 ? "" : "s"
      }</strong> per turn.`,
    });
  }

  if (options.speedrun) {
    descriptions.push({
      name: "speedrun",
      icon: OptionIcons.Speedrun,
      tooltip: "This is a <strong>Speedrun</strong>.",
    });
  }

  if (options.deckPlays) {
    descriptions.push({
      name: "deck-plays",
      icon: OptionIcons.DeckPlays,
      tooltip:
        "The <strong>Bottom-Deck Blind-Plays</strong> option is enabled.",
    });
  }

  if (options.emptyClues) {
    descriptions.push({
      name: "empty-clues",
      icon: OptionIcons.EmptyClues,
      tooltip: "The <strong>Empty Clues</strong> option is enabled.",
    });
  }

  if (options.oneExtraCard) {
    descriptions.push({
      name: "one-extra-card",
      icon: OptionIcons.OneExtraCard,
      tooltip: "The <strong>One Extra Card</strong> option is enabled.",
    });
  }

  if (options.oneLessCard) {
    descriptions.push({
      name: "one-less-card",
      icon: OptionIcons.OneLessCard,
      tooltip: "The <strong>One Less Card</strong> option is enabled.",
    });
  }

  if (options.allOrNothing) {
    descriptions.push({
      name: "all-or-nothing",
      icon: OptionIcons.AllOrNothing,
      tooltip: "The <strong>All or Nothing</strong> option is enabled.",
    });
  }

  if (options.detrimentalCharacters) {
    descriptions.push({
      name: "characters",
      icon: OptionIcons.DetrimentalCharacters,
      tooltip: "The <strong>Detrimental Characters</strong> option is enabled.",
    });
  }

  const { deal } = settings;
  if (deal?.type === "seed") {
    descriptions.push({
      name: "seed",
      icon: OptionIcons.Seed,
      tooltip: `This table deals the custom seed of: <strong>${escapeHtml(deal.suffix)}</strong>`,
    });
  } else if (deal?.type === "replay") {
    const turn = deal.turn === undefined ? "" : ` (from turn ${deal.turn + 1})`;
    descriptions.push({
      name: "replay",
      icon: OptionIcons.Replay,
      tooltip: `This table replays game: <strong>#${deal.gameId}</strong>${turn}`,
    });
  }

  return descriptions;
}
