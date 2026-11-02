import type { ClientCommandData } from "@hanabi-live/data";
import { defaultSettings } from "@hanabi-live/data";
import { escapeHTMLCharacters, getObjectKeys } from "complete-common";
import { models } from "../models";
import { parseFloatStrict } from "../sharedMissingScores";
import { wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";

export async function commandSetting(
  user: WSUser,
  data: ClientCommandData["setting"],
): Promise<void> {
  const wsUser = user;
  if (data.name === "") {
    wsWarning(wsUser.connection, "The settings name cannot be blank.");
    return;
  }
  const name = getObjectKeys(defaultSettings).find((key) => key === data.name);
  if (name === undefined) {
    wsWarning(
      wsUser.connection,
      `The settings name of "${escapeHTMLCharacters(data.name)}" is invalid.`,
    );
    return;
  }

  let value: string | number | boolean = data.setting;
  if (typeof defaultSettings[name] === "boolean") {
    if (value !== "true" && value !== "false") {
      wsWarning(
        wsUser.connection,
        `The setting of "${name}" must have a value of "true" or "false".`,
      );
      return;
    }
    value = value === "true";
  } else if (name === "createTableTimeBaseMinutes") {
    const number = value === value.trim() ? parseFloatStrict(value) : undefined;
    if (number === undefined) {
      wsWarning(
        wsUser.connection,
        `The setting of "${name}" must be an float64.`,
      );
      return;
    }
    if (number <= 0 || number > 86_400) {
      wsWarning(wsUser.connection, `The setting of "${name}" is too large.`);
      return;
    }
    value = number;
  } else if (typeof defaultSettings[name] === "number") {
    if (!/^[+-]?\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) {
      wsWarning(
        wsUser.connection,
        `The setting of "${name}" must be an integer.`,
      );
      return;
    }
    value = Number(value);
    if (value < 0 || value > 604_800) {
      wsWarning(wsUser.connection, `The setting of "${name}" is too large.`);
      return;
    }
    if (name === "volume" && value > 100) {
      wsWarning(
        wsUser.connection,
        'The setting of "volume" must be between 0 and 100.',
      );
      return;
    }
  }
  await models.userSettings.set(wsUser.userID, name, value);
  if (name === "hyphenatedConventions") {
    wsUser.hyphenated = value === true;
  }
}
