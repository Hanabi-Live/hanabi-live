import type { Tuple } from "complete-common";
import {
  HOUR_IN_MILLISECONDS,
  MINUTE_IN_MILLISECONDS,
  SECOND_IN_MILLISECONDS,
  assertDefined,
} from "complete-common";
import { getVariant } from "../gameData.ts";
import { EndCondition } from "../generated/protocol.ts";
import type { GameMetadata } from "../interfaces/GameMetadata.ts";
import type { Variant } from "../interfaces/Variant.ts";
import { getCharacterNameForPlayer } from "../reducers/reducerHelpers.ts";
import type { HiddenClue } from "../types/HiddenClue.ts";
import type { MsgClue } from "../types/MsgClue.ts";
import type { NumPlayers } from "../types/NumPlayers.ts";
import type { PlayerIndex } from "../types/PlayerIndex.ts";
import type {
  ActionClue,
  ActionDiscard,
  ActionPlay,
} from "../types/gameActions.ts";
import { getCardName } from "./card.ts";
import { getClueName, isPassTurnClue } from "./clues.ts";
import { getCardSlot } from "./hand.ts";

const SECONDS_PER_MINUTE = MINUTE_IN_MILLISECONDS / SECOND_IN_MILLISECONDS;
const SECONDS_PER_HOUR = HOUR_IN_MILLISECONDS / SECOND_IN_MILLISECONDS;

const HYPO_PREFIX = "[Hypo] ";
const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
] as const;

export function getGoesFirstText(
  playerIndex: PlayerIndex | undefined,
  playerNames: Readonly<Tuple<string, NumPlayers>>,
): string {
  const playerName =
    playerIndex === undefined
      ? "[unknown]"
      : (playerNames[playerIndex] ?? "[unknown]");

  return `${playerName} goes first`;
}

export function getClueText(
  action: ActionClue,
  targetHand: readonly number[],
  hypothetical: boolean,
  metadata: GameMetadata,
): string {
  const giver = metadata.playerNames[action.giver] ?? "unknown";
  const target = metadata.playerNames[action.target] ?? "unknown";
  const word = NUMBER_WORDS[action.orders.length] ?? "unknown";
  const variant = getVariant(metadata.options.variantName);
  const hypoPrefix = hypothetical ? HYPO_PREFIX : "";

  if (isPassTurnClue(action)) {
    return `${hypoPrefix}${giver} passes the turn`;
  }

  // First, handle the case of clue text in some special variants.
  const characterName = getCharacterNameForPlayer(
    action.giver,
    metadata.characterAssignments,
  );
  if (
    action.clue.type === undefined
    || variant.cowAndPig
    || variant.duck
    || characterName === "Quacker"
  ) {
    const actionName = getClueActionName(action.clue, variant, characterName);
    const targetSuffix = target.endsWith("s") ? "'" : "'s";

    // Create a list of slot numbers that correspond to the cards touched.
    const slots: number[] = [];
    for (const order of action.orders) {
      const slot = getCardSlot(order, targetHand);
      assertDefined(slot, `Failed to get the slot for card: ${order}`);

      slots.push(slot);
    }
    slots.sort((a, b) => a - b);

    const slotWord = slots.length === 1 ? "slot" : "slots";
    const slotsText = slots.join("/");

    return `${hypoPrefix}${giver} ${actionName} at ${target}${targetSuffix} ${slotWord} ${slotsText}`;
  }

  // Handle the default case of a normal clue.
  let clueName = getClueName(action.clue, variant, characterName);
  if (action.orders.length !== 1) {
    clueName += "s";
  }

  return `${hypoPrefix}${giver} tells ${target} about ${word} ${clueName}`;
}

function getClueActionName(
  msgClue: MsgClue | HiddenClue,
  variant: Variant,
  characterName: string,
): string {
  if (msgClue.type === undefined) {
    return "quacks";
  }
  if (variant.cowAndPig) {
    switch (msgClue.type) {
      case "color": {
        return "moos";
      }

      case "rank": {
        return "oinks";
      }
    }
  }

  if (variant.duck || characterName === "Quacker") {
    return "quacks";
  }

  return "clues";
}

export function getGameOverText(
  endCondition: EndCondition,
  playerIndex: PlayerIndex | undefined,
  score: number,
  metadata: GameMetadata,
  votes: readonly PlayerIndex[] | undefined,
): string {
  const playerName = getPlayerName(playerIndex, metadata);

  switch (endCondition) {
    case EndCondition.Normal: {
      return `Players score ${score} points.`;
    }

    case EndCondition.Strikeout: {
      break;
    }

    case EndCondition.Timeout: {
      return `${playerName} ran out of time!`;
    }

    case EndCondition.TerminatedByPlayer: {
      return `${playerName} terminated the game!`;
    }

    case EndCondition.TerminatedByVote: {
      const playerNames = getPlayerNames(votes, metadata);
      return `${playerNames} voted to terminate the game!`;
    }

    case EndCondition.SpeedrunFail: {
      break;
    }

    case EndCondition.IdleTimeout: {
      return "Players were idle for too long.";
    }

    case EndCondition.CharacterSoftlock: {
      return `${playerName} was left with 0 clues!`;
    }

    case EndCondition.AllOrNothingFail: {
      break;
    }

    case EndCondition.AllOrNothingSoftlock: {
      return `${playerName} was left with 0 clues and 0 cards!`;
    }
  }

  return "Players lose!";
}

function getPlayerNames(
  playerIndices: readonly PlayerIndex[] | undefined,
  metadata: GameMetadata,
): string {
  if (playerIndices === undefined) {
    return "The players";
  }

  const playerNames = playerIndices.map((i) => getPlayerName(i, metadata));
  playerNames.sort();

  if (playerNames.length === 2) {
    return `${playerNames[0]} and ${playerNames[1]}`;
  }

  const playerNamesExceptLast = playerNames.slice(0, -1);
  return `${playerNamesExceptLast.join(", ")}, and ${playerNames.at(-1)}`;
}

export function getPlayText(
  action: ActionPlay | ActionDiscard,
  slot: number | undefined,
  touched: boolean,
  playing: boolean,
  shadowing: boolean,
  hypothetical: boolean,
  metadata: GameMetadata,
): string {
  const variant = getVariant(metadata.options.variantName);
  const playerName = getPlayerName(action.playerIndex, metadata);

  const cardIsHidden =
    action.identity === undefined
    || (variant.throwItInAHole && (playing || shadowing));

  const cardName = cardIsHidden
    ? "a card"
    : getCardName(action.identity.suitIndex, action.identity.rank, variant);

  const location = slot === undefined ? "the deck" : `slot #${slot}`;
  const suffix = touched ? "" : " (blind)";
  const hypoPrefix = hypothetical ? HYPO_PREFIX : "";
  const playText =
    action.type === "discard" && action.failed && !cardIsHidden
      ? "fails to play"
      : "plays";

  return `${hypoPrefix}${playerName} ${playText} ${cardName} from ${location}${suffix}`;
}

export function getDiscardText(
  action: ActionDiscard,
  slot: number | undefined,
  touched: boolean,
  critical: boolean,
  playing: boolean,
  shadowing: boolean,
  hypothetical: boolean,
  metadata: GameMetadata,
): string {
  if (action.failed) {
    return getPlayText(
      action,
      slot,
      touched,
      playing,
      shadowing,
      hypothetical,
      metadata,
    );
  }

  const variant = getVariant(metadata.options.variantName);
  const playerName = getPlayerName(action.playerIndex, metadata);

  const cardIsHidden =
    action.identity === undefined
    || (variant.throwItInAHole && (playing || shadowing));

  const cardName = cardIsHidden
    ? "a card"
    : getCardName(action.identity.suitIndex, action.identity.rank, variant);

  const location = slot === undefined ? "the deck" : `slot #${slot}`;
  const suffix = getDiscardTextSuffix(touched, critical);
  const hypoPrefix = hypothetical ? HYPO_PREFIX : "";

  return `${hypoPrefix}${playerName} discards ${cardName} from ${location}${suffix}`;
}

function getDiscardTextSuffix(touched: boolean, critical: boolean): string {
  // The critical suffix takes precedence over the clued suffix.
  if (critical) {
    return " (critical)";
  }

  if (touched) {
    return " (clued)";
  }

  return "";
}

export function getPlayerName(
  playerIndex: PlayerIndex | undefined,
  metadata: GameMetadata,
): string {
  return playerIndex === undefined
    ? "[unknown]"
    : (metadata.playerNames[playerIndex] ?? "[unknown]");
}

export function millisecondsToClockString(milliseconds: number): string {
  // Non timed games measure time in negative values.
  const time = Math.abs(milliseconds);
  return secondsToClockString(Math.ceil(time / SECOND_IN_MILLISECONDS));
}

/** Formats a duration as "m:ss", or as "h:mm:ss" when it is at least an hour long. */
export function secondsToClockString(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  );
  const seconds = padTwoDigits(totalSeconds % SECONDS_PER_MINUTE);

  return hours > 0
    ? `${hours}:${padTwoDigits(minutes)}:${seconds}`
    : `${minutes}:${seconds}`;
}

function padTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}
