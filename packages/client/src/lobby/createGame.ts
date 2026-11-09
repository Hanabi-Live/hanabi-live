// The "Create Game" screen, which also changes the options of an unstarted game.

import type { Settings } from "@hanabi-live/data";
import {
  DEFAULT_TABLE_NAME_SUFFIX,
  MAX_SEED_LENGTH,
  MAX_TIME_BASE_SECONDS,
  MAX_TIME_PER_TURN_SECONDS,
  SECONDS_PER_MINUTE,
  defaultSettings,
} from "@hanabi-live/data";
import type { Options } from "@hanabi-live/game";
import {
  DEFAULT_VARIANT_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  VARIANT_NAMES,
  doesVariantExist,
  isValidNumPlayers,
} from "@hanabi-live/game";
import {
  ReadonlySet,
  getRandomArrayElement,
  parseFloatSafe,
  parseIntSafe,
} from "complete-common";
import { DIMMED_OPACITY, LOCAL_STORAGE_KEY } from "../constants";
import { globals } from "../Globals";
import { Tooltip } from "../Tooltip";
import { escapeHtml, getHTMLInputElement } from "../utils";
import * as lobbyPage from "./lobbyPage";
import { Screen } from "./types/Screen";

const BASIC_VARIANT_NAMES = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
] as const;

const BASIC_VARIANT_NAMES_SET = new ReadonlySet<string>(BASIC_VARIANT_NAMES);

/** A character that the server accepts in a seed. */
const SEED_CHARACTER_REGEX = /^[\d\-A-Za-z]$/u;

/** The largest database ID, and the latest turn, that the server accepts. */
const MAX_INTEGER_FIELD = 2_147_483_647;

/** A text box that turns red and explains why while its value is invalid. */
interface CheckedInput {
  readonly element: HTMLInputElement;
  readonly tooltip: Tooltip;
  /** Returns why the value is invalid, if it is. */
  readonly getError: () => string | undefined;
}

const checkedInputs: CheckedInput[] = [];

/**
 * The checkboxes under "Extra Options", which stay collapsed unless one of them is selected, a seed
 * is entered, or a game is replayed.
 */
const EXTRA_OPTIONS = [
  "createTableSpeedrun",
  "createTableDeckPlays",
  "createTableEmptyClues",
  "createTableOneExtraCard",
  "createTableOneLessCard",
  "createTableAllOrNothing",
  "createTableDetrimentalCharacters",
] as const satisfies ReadonlyArray<keyof Settings>;

let dropdown1: JQuery<Element>;
let dropdown2: JQuery<Element>;

export function init(): void {
  dropdown1 = $("#create-game-variant-dropdown1");
  dropdown2 = $("#create-game-variant-dropdown2");

  $("#createTableMaxPlayers").attr({
    min: MIN_PLAYERS,
    max: MAX_PLAYERS,
    placeholder: defaultSettings.createTableMaxPlayers,
  });

  getHTMLInputElement("#create-game-seed").maxLength = MAX_SEED_LENGTH;
  addCheckedInput("#createTableTimeBaseMinutes", getTimeBaseError);
  addCheckedInput("#createTableTimePerTurnSeconds", getTimePerTurnError);
  addCheckedInput("#create-game-seed", getSeedError);
  addCheckedInput("#create-game-replay-game-id", getReplayGameIDError);
  addCheckedInput("#create-game-replay-turn", getReplayTurnError);

  firstVariantDropdownInit();
  secondVariantDropdownInit();

  // If max players was set to an invalid value, restore it to the default when the element is
  // deselected.
  $("#createTableMaxPlayers").on("blur", () => {
    const element = $("#createTableMaxPlayers");

    const value = element.val();
    if (typeof value !== "string") {
      return;
    }

    const maxPlayers = parseIntSafe(value);
    if (
      maxPlayers === undefined
      || maxPlayers < MIN_PLAYERS
      || maxPlayers > MAX_PLAYERS
    ) {
      element.val(defaultSettings.createTableMaxPlayers);
    }
  });

  // The "dice" button will select a random variant from the list.
  $("#dice").on("click", () => {
    const randomVariant = getRandomArrayElement(VARIANT_NAMES);
    $("#createTableVariant").text(randomVariant);
    dropdown2.val(randomVariant);
  });

  // Make the extra time fields appear and disappear depending on whether the checkbox is checked.
  $("#createTableTimed").on("change", () => {
    if ($("#createTableTimed").prop("checked") === true) {
      $(".create-game-timed-option").show();
    } else {
      $(".create-game-timed-option").hide();
    }

    // Remember the new setting.
    getCheckbox("createTableTimed");
    checkInputs();
  });

  $("#createTableSpeedrun").on("change", () => {
    $("#create-game-timed-row").toggle(
      $("#createTableSpeedrun").prop("checked") !== true,
    );

    // Remember the new setting.
    getCheckbox("createTableSpeedrun");
    checkInputs();
  });

  $("#create-game-show-extra-options").on("click", () => {
    const button = $("#create-game-show-extra-options");
    showExtraOptions(button.attr("aria-expanded") !== "true");
  });

  // Disable some checkboxes if a checkbox is checked.
  $("#createTableOneExtraCard").on("change", () => {
    if ($("#createTableOneExtraCard").is(":checked")) {
      $("#createTableOneLessCardRow").fadeTo(0, DIMMED_OPACITY);
      $("#createTableOneLessCard").prop("disabled", true);
      $("#createTableOneLessCardLabel").css("cursor", "auto");
    } else {
      $("#createTableOneLessCardRow").fadeTo(0, 1);
      $("#createTableOneLessCard").prop("disabled", false);
      $("#createTableOneLessCardLabel").css("cursor", "pointer");
    }

    // Remember the new setting.
    getCheckbox("createTableOneExtraCard");
  });

  $("#createTableOneLessCard").on("change", () => {
    if ($("#createTableOneLessCard").is(":checked")) {
      $("#createTableOneExtraCardRow").fadeTo(0, DIMMED_OPACITY);
      $("#createTableOneExtraCard").prop("disabled", true);
      $("#createTableOneExtraCardLabel").css("cursor", "auto");
    } else {
      $("#createTableOneExtraCardRow").fadeTo(0, 1);
      $("#createTableOneExtraCard").prop("disabled", false);
      $("#createTableOneExtraCardLabel").css("cursor", "pointer");
    }

    // Remember the new setting.
    getCheckbox("createTableOneLessCard");
  });

  // Check for changes in the various input fields so that we can remember their respective
  // settings.
  $("#create-game-variant-dropdown1").on("change", () => {
    getVariantName();
  });
  $("#create-game-variant-dropdown2").on("change", () => {
    getVariantName();
  });
  $("#createTableTimeBaseMinutes").on("change", () => {
    getTimeBaseMinutes();
  });
  $("#createTableTimePerTurnSeconds").on("change", () => {
    getTimePerTurnSeconds();
  });
  $("#createTableDeckPlays").on("change", () => {
    getCheckbox("createTableDeckPlays");
  });
  $("#createTableEmptyClues").on("change", () => {
    getCheckbox("createTableEmptyClues");
  });
  $("#createTableAllOrNothing").on("change", () => {
    getCheckbox("createTableAllOrNothing");
  });
  $("#createTableDetrimentalCharacters").on("change", () => {
    getCheckbox("createTableDetrimentalCharacters");
  });

  $("#create-game-submit").on("click", submit);
}

/**
 * The website offers over 1000+ variants. To prevent confusion, only show the basic variants to the
 * user by default. They can select "Search custom variants" if they want access to the "full"
 * dropdown.
 *
 * - "createTableVariant" is a hidden element that contains the value of the chosen element.
 * - "create-game-variant-dropdown1" contains the basic variants.
 * - "create-game-variant-dropdown2" is the full (datalist) dropdown.
 */
function firstVariantDropdownInit() {
  // Initialize the 1st variant dropdown with the basic variants.
  for (const variantName of BASIC_VARIANT_NAMES) {
    // As a sanity check, ensure that this variant actually exists in the variants JSON.
    if (!doesVariantExist(variantName)) {
      throw new Error(
        `The "basic" variant of "${variantName}" does not exist in the "variants.json" file.`,
      );
    }

    const option = new Option(variantName, variantName);
    dropdown1.append(option);
  }
  // eslint-disable-next-line complete/require-ascii
  const spacing = new Option("───────────────");
  spacing.disabled = true;
  dropdown1.append(spacing);
  const searchText = "Search custom variants...";
  const loadCustom = new Option(searchText);
  dropdown1.append(loadCustom);

  // Specify functionality when the user selects an option from this dropdown.
  dropdown1.change(() => {
    let selection = dropdown1.val();
    if (typeof selection !== "string") {
      selection = "No Variant";
    }

    if (selection === searchText) {
      dropdown1.hide();
      dropdown2.show();
      dropdown2.val("");
      dropdown2.trigger("focus");
      $("#create-game-variant-dropdown2-icon").show();
      $("#dice").show();
    } else {
      // Update the hidden field with what the user selected.
      $("#createTableVariant").text(selection);
    }
  });
}

function secondVariantDropdownInit() {
  // Populate the full datalist/dropdown on the "Create Game" screen.
  for (const variantName of VARIANT_NAMES) {
    const option = new Option(variantName, variantName);
    $("#create-game-variant-dropdown2-list").append($(option));
  }

  dropdown2.on("input", () => {
    // Get what they are searching for.
    let search = dropdown2.val();
    if (typeof search === "number") {
      search = search.toString();
    }
    if (typeof search !== "string") {
      search = "No Variant";
    }

    // Update the hidden field with what the user selected.
    $("#createTableVariant").text(search);

    // If they chose a basic variant, revert back to the basic dropdown.
    if (BASIC_VARIANT_NAMES_SET.has(search)) {
      dropdown1.show();
      dropdown1.val(search);
      dropdown2.hide();
      $("#create-game-variant-dropdown2-icon").hide();
      $("#dice").hide();
    }
  });
}

function submit() {
  // Check the data attribute of the submit button to see if this is a new game or a change of
  // options.
  const isNew = $("#create-game-table-number").val() === "";

  // Leave the dialog open while any value is invalid, showing the extra options only when the
  // problem is among them.
  if (!checkInputs()) {
    if (
      getTimeBaseError() === undefined
      && getTimePerTurnError() === undefined
    ) {
      showExtraOptions(true);
    }
    return;
  }

  const timed = getCheckbox("createTableTimed");
  const timeBaseMinutes = timed ? getTimeBaseMinutes() : undefined;
  const timeBaseSeconds =
    timeBaseMinutes === undefined ? 0 : toSeconds(timeBaseMinutes);
  const timePerTurn = (timed ? getTimePerTurnSeconds() : undefined) ?? 0;

  // Seeds and replays are not saved, so that a new game does not accidentally repeat a deal.
  const seed = getText("#create-game-seed");
  const replayGameID = parseIntSafe(getText("#create-game-replay-game-id"));
  const replayTurn =
    replayGameID === undefined
      ? undefined
      : parseIntSafe(getText("#create-game-replay-turn"));

  // Table names are not saved.
  const name = $("#createTableName").val();
  if (typeof name !== "string") {
    throw new TypeError(
      'The value of the "createTableName" element was not a string.',
    );
  }

  // Passwords are not stored on the server; instead, they are stored locally as cookies.
  const password = $("#createTablePassword").val();
  if (typeof password !== "string") {
    throw new TypeError(
      'The value of the "createTablePassword" element was not a string.',
    );
  }
  if (isNew) {
    localStorage.setItem(LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD, password);
  }

  // Max players must be a valid number.
  const maxPlayersString = $("#createTableMaxPlayers").val();
  if (typeof maxPlayersString !== "string") {
    throw new TypeError(
      'The value of the "createTableMaxPlayers" element was not a string.',
    );
  }
  const maxPlayersInt = parseIntSafe(maxPlayersString);
  const maxPlayers = isValidNumPlayers(maxPlayersInt)
    ? maxPlayersInt
    : defaultSettings.createTableMaxPlayers;
  checkSettingChanged("createTableMaxPlayers", maxPlayers);

  const options = {
    variantName: getVariantName(), // This is a hidden span field.
    timed,
    timeBase: timeBaseSeconds,
    timePerTurn,
    speedrun: getCheckbox("createTableSpeedrun"),
    deckPlays: getCheckbox("createTableDeckPlays"),
    emptyClues: getCheckbox("createTableEmptyClues"),
    oneExtraCard: getCheckbox("createTableOneExtraCard"),
    oneLessCard: getCheckbox("createTableOneLessCard"),
    allOrNothing: getCheckbox("createTableAllOrNothing"),
    detrimentalCharacters: getCheckbox("createTableDetrimentalCharacters"),
    ...(seed !== "" && { seed }),
    ...(replayGameID !== undefined && { replayGameID }),
    ...(replayTurn !== undefined && { replayTurn }),
  };

  lobbyPage.hide();

  if (isNew) {
    globals.conn!.send("tableCreate", {
      name,
      options,
      password,
      maxPlayers,
    });
    $("#nav-buttons-lobby-create-game").addClass("disabled");
  } else {
    globals.conn!.send("tableUpdate", {
      tableID: globals.tableID,
      name,
      options,
      maxPlayers,
    });
  }
}

export function acceptOptionsFromGuest(options: Options): void {
  const name = options.tableName;
  const { maxPlayers } = options;

  globals.conn!.send("tableUpdate", {
    tableID: globals.tableID,
    name,
    options,
    maxPlayers,
  });
}

function addCheckedInput(selector: string, getError: () => string | undefined) {
  const element = getHTMLInputElement(selector);
  checkedInputs.push({
    element,
    tooltip: new Tooltip(element, { content: "" }),
    getError,
  });

  // The fields depend on each other, so a change to one checks them all.
  element.addEventListener("input", () => {
    checkInputs();
  });
}

/**
 * Marks each checked text box red and explains why while it is invalid. Returns whether they are
 * all valid.
 */
function checkInputs(): boolean {
  // The turn only applies to a replay.
  const replaying = getText("#create-game-replay-game-id") !== "";
  $("#create-game-replay-turn").prop("disabled", !replaying);
  $("#create-game-replay-turn-label").fadeTo(0, replaying ? 1 : DIMMED_OPACITY);

  let valid = true;
  for (const { element, tooltip, getError } of checkedInputs) {
    const error = getError();
    element.classList.toggle("wrongInput", error !== undefined);
    if (error === undefined) {
      tooltip.close();
    } else {
      valid = false;
      tooltip.setContent(escapeHtml(error));
      tooltip.open();
    }
  }
  return valid;
}

function closeInputErrors() {
  for (const { tooltip } of checkedInputs) {
    tooltip.close();
  }
}

function getText(selector: string): string {
  return getHTMLInputElement(selector).value.trim();
}

/** Whether the clock options apply, since a speedrun is never timed. */
function isTimed(): boolean {
  return (
    getHTMLInputElement("#createTableTimed").checked
    && !getHTMLInputElement("#createTableSpeedrun").checked
  );
}

function toSeconds(minutes: number): number {
  return Math.round(minutes * SECONDS_PER_MINUTE);
}

function getTimeBaseError(): string | undefined {
  if (!isTimed()) {
    return undefined;
  }
  const minutes = parseFloatSafe(getText("#createTableTimeBaseMinutes"));
  if (minutes === undefined || toSeconds(minutes) <= 0) {
    return "The base time must be a positive number of minutes.";
  }
  if (toSeconds(minutes) > MAX_TIME_BASE_SECONDS) {
    return `The base time cannot be more than ${MAX_TIME_BASE_SECONDS / SECONDS_PER_MINUTE} minutes.`;
  }
  return undefined;
}

function getTimePerTurnError(): string | undefined {
  if (!isTimed()) {
    return undefined;
  }
  const seconds = parseIntSafe(getText("#createTableTimePerTurnSeconds"));
  if (seconds === undefined || seconds <= 0) {
    return "The time per turn must be a positive whole number of seconds.";
  }
  if (seconds > MAX_TIME_PER_TURN_SECONDS) {
    return `The time per turn cannot be more than ${MAX_TIME_PER_TURN_SECONDS} seconds.`;
  }
  return undefined;
}

function getSeedError(): string | undefined {
  const invalidCharacters = new Set(
    [...new Intl.Segmenter().segment(getText("#create-game-seed"))]
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

function getReplayGameIDError(): string | undefined {
  const text = getText("#create-game-replay-game-id");
  if (text === "") {
    return undefined;
  }
  if (!isPositiveInteger(text)) {
    return "The game ID must be a positive number.";
  }
  if (getText("#create-game-seed") !== "") {
    return "A replay uses its game's seed, so the custom seed must be blank.";
  }
  return undefined;
}

function getReplayTurnError(): string | undefined {
  const text = getText("#create-game-replay-turn");
  return getText("#create-game-replay-game-id") === ""
    || text === ""
    || isPositiveInteger(text)
    ? undefined
    : "The turn must be a positive number.";
}

function isPositiveInteger(text: string): boolean {
  const value = /^\d+$/u.test(text) ? parseIntSafe(text) : undefined;
  return value !== undefined && value > 0 && value <= MAX_INTEGER_FIELD;
}

function getCheckbox(setting: keyof Settings): boolean {
  const selector = `#${setting}`;
  const element = getHTMLInputElement(selector);
  const value = element.checked;
  checkSettingChanged(setting, value);
  return value;
}

/** Returns the base time and remembers it, if it is valid. */
function getTimeBaseMinutes(): number | undefined {
  const minutes = parseFloatSafe(getText("#createTableTimeBaseMinutes"));
  if (minutes === undefined || getTimeBaseError() !== undefined) {
    return undefined;
  }
  checkSettingChanged("createTableTimeBaseMinutes", minutes);
  return minutes;
}

/** Returns the time per turn and remembers it, if it is valid. */
function getTimePerTurnSeconds(): number | undefined {
  const seconds = parseIntSafe(getText("#createTableTimePerTurnSeconds"));
  if (seconds === undefined || getTimePerTurnError() !== undefined) {
    return undefined;
  }
  checkSettingChanged("createTableTimePerTurnSeconds", seconds);
  return seconds;
}

function getVariantName(): string {
  const setting = "createTableVariant";
  const element = $(`#${setting}`);
  let value = element.text();
  value = value.trim(); // Remove all leading and trailing whitespace
  if (value === "") {
    value = "No Variant";
  }
  checkSettingChanged(setting, value);
  return value;
}

export function checkSettingChanged<T extends keyof Settings>(
  settingName: T,
  value: Settings[T],
): void {
  if (value !== globals.settings[settingName]) {
    globals.settings[settingName] = value;
    globals.conn!.send("setting", {
      name: settingName,
      setting: value.toString(), // The server expects the value of all settings as strings.
    });
  }
}

/**
 * Shows the screen from the lobby (to create a game) or the pre-game screen (to change options).
 */
export function show(): void {
  ready();
  lobbyPage.show("#lobby-create-game", "#create-game-submit", closeInputErrors);
  $("#create-game-variant-dropdown1").trigger("focus");
}

/** Fills in the form for a new game or for the options of the current game. */
export function ready(): void {
  // Change the UI if we are in a pre-game screen.
  let dialogTitle = "Create a New Game";
  let buttonTitle = "Create";
  let gameName: string;
  let dialogOptions: Options | Settings;
  let seed = "";
  let replayGameID = "";
  let replayTurn = "";

  if (globals.game === null || globals.currentScreen === Screen.Lobby) {
    // Create New Game
    gameName = `${globals.username}${DEFAULT_TABLE_NAME_SUFFIX}`;
    dialogOptions = globals.settings;

    // Show the password row.
    $("#password-row").removeClass("hidden");

    // Ensure create-game-table-number is empty.
    $("#create-game-table-number").val("");
  } else {
    // Change Options
    dialogTitle = "Change Game Options";
    buttonTitle = "Change";
    gameName = globals.game.name;
    dialogOptions = globals.game.options;
    seed = globals.game.options.seed ?? "";
    replayGameID = globals.game.options.replayGameID?.toString() ?? "";
    replayTurn = globals.game.options.replayTurn?.toString() ?? "";

    // Can't change the password once the game is created.
    $("#password-row").addClass("hidden");

    // Ensure create-game-table-number has a value.
    $("#create-game-table-number").val(globals.tableID);
  }

  // Set UI Elements and values.
  $("#create-game-title").text(dialogTitle);
  $("#create-game-submit").text(buttonTitle);
  $("#createTableName").val(gameName);
  $("#create-game-seed").val(seed);
  $("#create-game-replay-game-id").val(replayGameID);
  $("#create-game-replay-turn").val(replayTurn);

  // Fill in the rest of form with the settings that we used last time (which is stored on the
  // server).
  for (const [key, value] of Object.entries(dialogOptions)) {
    const element = $(`#${key}`);
    if (key === "createTableVariant") {
      // Setting the variant dropdown is a special case; it is more complicated than simply filling
      // in the value with what we used last time.
      readyVariant(value as string);
    } else if (typeof value === "boolean") {
      // Checkboxes
      element.prop("checked", value);
      element.change();
    } else {
      // Input fields and text fields.
      element.val(value as string);
    }
  }

  // Fill in the "Password" box. (This is not stored on the server so we have to retrieve the last
  // password from a cookie.)
  const password = localStorage.getItem(
    LOCAL_STORAGE_KEY.CREATE_TABLE_PASSWORD,
  );
  if (password !== null && password !== "") {
    $("#createTablePassword").val(password);
  }

  let maxPlayers = globals.settings.createTableMaxPlayers;
  if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    maxPlayers = defaultSettings.createTableMaxPlayers;
  }
  $("#createTableMaxPlayers").val(maxPlayers);
  checkInputs();

  // Only show the extra options when one of them is selected or when the user asks for them.
  showExtraOptions(
    seed !== ""
      || replayGameID !== ""
      || EXTRA_OPTIONS.some(
        (setting) => getHTMLInputElement(`#${setting}`).checked,
      ),
  );
}

function showExtraOptions(visible: boolean) {
  $("#create-game-extra-options").toggleClass("hidden", !visible);
  const button = $("#create-game-show-extra-options");
  button.attr("aria-expanded", visible.toString());
  button
    .find("i")
    .toggleClass("fa-plus", !visible)
    .toggleClass("fa-minus", visible);
  button
    .find("span")
    .text(visible ? "Hide Extra Options" : "Show Extra Options");
}

function readyVariant(value: string) {
  // Validate the variant name that we got from the server.
  let variantName: string;
  if (doesVariantExist(value)) {
    variantName = value;
  } else {
    variantName = DEFAULT_VARIANT_NAME;

    // Since the variant name is not valid, update our settings.
    globals.settings = {
      ...globals.settings,
      createTableVariant: variantName,
    };
  }

  // Update the hidden field.
  $("#createTableVariant").text(variantName);

  if (BASIC_VARIANT_NAMES_SET.has(variantName)) {
    // If this is one of the basic variants, set it in the first dropdown.
    dropdown1.show();
    dropdown1.val(variantName);
    dropdown2.hide();
    $("#create-game-variant-dropdown2-icon").hide();
    $("#dice").hide();
  } else {
    // If this is not one of the basic variants, set it in the second dropdown.
    dropdown1.hide();
    dropdown2.show();
    dropdown2.val(variantName);
    $("#create-game-variant-dropdown2-icon").show();
    $("#dice").show();
  }
}
