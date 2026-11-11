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

  if (options.timed) {
    const timeBase = secondsToClockString(options.timeBaseSeconds);
    descriptions.push({
      name: "timer",
      icon: OptionIcons.Timed,
      label: `(${timeBase} + ${secondsToClockString(options.timePerTurnSeconds)})`,
      tooltip: `This is a <strong>Timed Game</strong>. The base time is <strong>${timeBase} minute${
        options.timeBaseSeconds === SECONDS_PER_MINUTE ? "" : "s"
      }</strong> plus <strong>${options.timePerTurnSeconds} second${
        options.timePerTurnSeconds === 1 ? "" : "s"
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

  if (settings.seed !== undefined) {
    descriptions.push({
      name: "seed",
      icon: OptionIcons.Seed,
      tooltip: `This table deals the custom seed of: <strong>${escapeHtml(settings.seed)}</strong>`,
    });
  }

  if (settings.replayGameId !== undefined) {
    const turn =
      settings.replayTurn === undefined
        ? ""
        : ` (from turn ${settings.replayTurn})`;
    descriptions.push({
      name: "replay",
      icon: OptionIcons.Replay,
      tooltip: `This table replays game: <strong>#${settings.replayGameId}</strong>${turn}`,
    });
  }

  return descriptions;
}
