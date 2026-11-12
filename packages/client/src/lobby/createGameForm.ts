// The values of the "Create Game" form, how to check them, and the table that they describe. It
// does not touch the page, so the rules can be tested alone.

import type { Settings } from "@hanabi-live/data";
import {
  DEFAULT_TIME_BASE_SECONDS,
  DEFAULT_TIME_PER_TURN_SECONDS,
  MAX_TIME_BASE_SECONDS,
  MAX_TIME_PER_TURN_SECONDS,
  SECONDS_PER_MINUTE,
  defaultSettings,
} from "@hanabi-live/data";
import type { GameOptions } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  doesVariantExist,
  getVariant,
  isValidNumPlayers,
} from "@hanabi-live/game";
import { parseFloatSafe, parseIntSafe } from "complete-common";
import type { Deal } from "./deal.ts";
import { readDeal } from "./deal.ts";

/** The table that the form starts from: the last one that we created, which our settings keep. */
export type CreateTable = Settings["createTable"];

/** The options that a checkbox under "Extra Options" sets. */
export type ExtraOption = Exclude<
  keyof GameOptions,
  "variantId" | "timeControl"
>;

type TimeControl = NonNullable<GameOptions["timeControl"]>;

/** The checkboxes under "Extra Options", in the order that the form shows them. */
const EXTRA_OPTION_NAMES = [
  "speedrun",
  "deckPlays",
  "emptyClues",
  "oneExtraCard",
  "oneLessCard",
  "allOrNothing",
  "detrimentalCharacters",
] as const satisfies readonly ExtraOption[];

/** The clock that a timed table has unless its creator chooses another. */
export const DEFAULT_TIME_CONTROL = {
  baseSeconds: DEFAULT_TIME_BASE_SECONDS,
  perTurnSeconds: DEFAULT_TIME_PER_TURN_SECONDS,
} as const satisfies TimeControl;

/** A character that the server accepts in a seed. */
const SEED_CHARACTER_REGEX = /^[\d\-A-Za-z]$/u;

/** The largest database ID, and the latest turn, that the server accepts. */
const MAX_INTEGER_FIELD = 2_147_483_647;

/** What the form shows. Text boxes keep their text, so that it can be invalid while it is typed. */
export interface CreateGameForm {
  readonly name: string;
  readonly variantName: string;
  readonly maxPlayers: string;
  readonly password: string;
  readonly timed: boolean;
  readonly timeBaseMinutes: string;
  readonly timePerTurnSeconds: string;
  readonly extraOptions: Readonly<Record<ExtraOption, boolean>>;
  readonly seed: string;
  readonly replayGameId: string;
  readonly replayTurn: string;
}

/** The text boxes that turn red and explain why while their value is invalid. */
type CheckedField =
  | "timeBaseMinutes"
  | "timePerTurnSeconds"
  | "seed"
  | "replayGameId"
  | "replayTurn";

/** Why each invalid text box is invalid. */
export type FormErrors = Partial<Record<CheckedField, string>>;

/**
 * Fills in the form from a table. The name, password, seed, and replay come from elsewhere. An
 * untimed table offers the default clock.
 */
export function formFromTable(
  { maxPlayers, options }: CreateTable,
  variantName: string,
): Omit<
  CreateGameForm,
  "name" | "password" | "seed" | "replayGameId" | "replayTurn"
> {
  const timeControl = options.timeControl ?? DEFAULT_TIME_CONTROL;
  return {
    variantName,
    maxPlayers: maxPlayers.toString(),
    timed: options.timeControl !== undefined,
    timeBaseMinutes: (timeControl.baseSeconds / SECONDS_PER_MINUTE).toString(),
    timePerTurnSeconds: timeControl.perTurnSeconds.toString(),
    extraOptions: Object.fromEntries(
      EXTRA_OPTION_NAMES.map((option) => [option, options[option]]),
    ) as Record<ExtraOption, boolean>,
  };
}

/** Whether the clock options apply, since a speedrun is never timed. */
function isTimed(form: CreateGameForm): boolean {
  return form.timed && !form.extraOptions.speedrun;
}

/** Whether the turn to replay from applies, which needs a game to replay. */
export function isReplaying(form: CreateGameForm): boolean {
  return form.replayGameId.trim() !== "";
}

export function getErrors(form: CreateGameForm): FormErrors {
  const errors: Record<CheckedField, string | undefined> = {
    timeBaseMinutes: isTimed(form)
      ? getTimeBaseError(form.timeBaseMinutes)
      : undefined,
    timePerTurnSeconds: isTimed(form)
      ? getTimePerTurnError(form.timePerTurnSeconds)
      : undefined,
    seed: getSeedError(form.seed.trim()),
    replayGameId: getReplayGameIdError(form),
    replayTurn: getReplayTurnError(form),
  };
  return Object.fromEntries(
    Object.entries(errors).filter(([, error]) => error !== undefined),
  );
}

function getTimeBaseError(text: string): string | undefined {
  const minutes = parseFloatSafe(text.trim());
  if (minutes === undefined || toSeconds(minutes) <= 0) {
    return "The base time must be a positive number of minutes.";
  }
  if (toSeconds(minutes) > MAX_TIME_BASE_SECONDS) {
    return `The base time cannot be more than ${MAX_TIME_BASE_SECONDS / SECONDS_PER_MINUTE} minutes.`;
  }
  return undefined;
}

function getTimePerTurnError(text: string): string | undefined {
  const seconds = parseIntSafe(text.trim());
  if (seconds === undefined || seconds <= 0) {
    return "The time per turn must be a positive whole number of seconds.";
  }
  if (seconds > MAX_TIME_PER_TURN_SECONDS) {
    return `The time per turn cannot be more than ${MAX_TIME_PER_TURN_SECONDS} seconds.`;
  }
  return undefined;
}

function getSeedError(seed: string): string | undefined {
  const invalidCharacters = new Set(
    [...new Intl.Segmenter().segment(seed)]
      .map(({ segment }) => segment)
      .filter((character) => !SEED_CHARACTER_REGEX.test(character)),
  );
  if (invalidCharacters.size === 0) {
    return undefined;
  }
  const shown = [...invalidCharacters]
    .map((character) => (character === " " ? "(space)" : character))
    .join(" ");
  return `You cannot have these characters in a seed: ${shown}`;
}

function getReplayGameIdError(form: CreateGameForm): string | undefined {
  const text = form.replayGameId.trim();
  if (text === "") {
    return undefined;
  }
  if (!isPositiveInteger(text)) {
    return "The game ID must be a positive number.";
  }
  if (form.seed.trim() !== "") {
    return "A replay uses its game's seed, so the custom seed must be blank.";
  }
  return undefined;
}

function getReplayTurnError(form: CreateGameForm): string | undefined {
  const text = form.replayTurn.trim();
  return !isReplaying(form) || text === "" || isPositiveInteger(text)
    ? undefined
    : "The turn must be a positive number.";
}

function isPositiveInteger(text: string): boolean {
  const value = /^\d+$/u.test(text) ? parseIntSafe(text) : undefined;
  return value !== undefined && value > 0 && value <= MAX_INTEGER_FIELD;
}

function toSeconds(minutes: number): number {
  return Math.round(minutes * SECONDS_PER_MINUTE);
}

/**
 * Reads the table that the form shows, with a clock only when it is timed. An invalid time keeps
 * the one in `remembered`, and an invalid player count or variant becomes the default.
 */
export function readTable(
  form: CreateGameForm,
  remembered: TimeControl,
): CreateTable {
  const minutes = parseFloatSafe(form.timeBaseMinutes.trim());
  const seconds = parseIntSafe(form.timePerTurnSeconds.trim());
  const maxPlayers = parseIntSafe(form.maxPlayers.trim());
  const variantName = form.variantName.trim();
  return {
    maxPlayers: isValidNumPlayers(maxPlayers)
      ? maxPlayers
      : defaultSettings.createTable.maxPlayers,
    options: {
      variantId: getVariant(
        doesVariantExist(variantName) ? variantName : DEFAULT_VARIANT_NAME,
      ).id,
      ...(form.timed && {
        timeControl: {
          baseSeconds:
            minutes === undefined
            || getTimeBaseError(form.timeBaseMinutes) !== undefined
              ? remembered.baseSeconds
              : toSeconds(minutes),
          perTurnSeconds:
            seconds === undefined
            || getTimePerTurnError(form.timePerTurnSeconds) !== undefined
              ? remembered.perTurnSeconds
              : seconds,
        },
      }),
      ...form.extraOptions,
    },
  };
}

/** The deal that the form asks for. Seeds and replays are not remembered. */
export function readFormDeal(form: CreateGameForm): Deal | undefined {
  return readDeal(
    form.seed.trim(),
    form.replayGameId.trim(),
    form.replayTurn.trim(),
  );
}
