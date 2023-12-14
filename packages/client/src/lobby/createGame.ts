// The "Create Game" nav button.

import {
  DEFAULT_VARIANT_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  VARIANT_NAMES,
  doesVariantExist,
} from "@hanabi/data";
import type { Options } from "@hanabi/game";
import {
  ReadonlySet,
  getRandomArrayElement,
  parseFloatSafe,
  parseIntSafe,
} from "@hanabi/utils";
import * as KeyCode from "keycode-js";
import { globals } from "../Globals";
import { SHUTDOWN_TIMEOUT } from "../constants";
import * as debug from "../debug";
import * as modals from "../modals";
import * as tooltips from "../tooltips";
import { getHTMLInputElement } from "../utils";
import { Screen } from "./types/Screen";
import type { Settings } from "./types/Settings";
import { DEFAULT_CREATE_TABLE_MAX_PLAYERS } from "./types/Settings";

const BASIC_VARIANT_NAMES = [
  "No Variant",
  "6 Suits",
  "Black (6 Suits)",
  "Rainbow (6 Suits)",
] as const;

const BASIC_VARIANT_NAMES_SET = new ReadonlySet<string>(BASIC_VARIANT_NAMES);

let dropdown1: JQuery<Element>;
let dropdown2: JQuery<Element>;

export function init(): void {
  dropdown1 = $("#create-game-variant-dropdown1");
  dropdown2 = $("#create-game-variant-dropdown2");

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
      maxPlayers === undefined ||
      maxPlayers < MIN_PLAYERS ||
      maxPlayers > MAX_PLAYERS
    ) {
      element.val(DEFAULT_CREATE_TABLE_MAX_PLAYERS);
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
      $("#create-game-timed-option-1").show();
      $("#create-game-timed-option-2").show();
      $("#create-game-timed-option-3").show();
      $("#create-game-timed-option-4").show();
    } else {
      $("#create-game-timed-option-1").hide();
      $("#create-game-timed-option-2").hide();
      $("#create-game-timed-option-3").hide();
      $("#create-game-timed-option-4").hide();
    }

    // Remember the new setting.
    getCheckbox("createTableTimed");
  });

  $("#createTableSpeedrun").on("change", () => {
    if ($("#createTableSpeedrun").prop("checked") === true) {
      $("#create-game-timed-row").hide();
      $("#create-game-timed-row-spacing").hide();
    } else {
      $("#create-game-timed-row").show();
      $("#create-game-timed-row-spacing").show();
    }

    // Remember the new setting.
    getCheckbox("createTableSpeedrun");
  });

  // The "Show Extra Options" button.
  $("#create-game-show-extra-options").on("click", () => {
    $("#create-game-extra-options").show();
    $("#create-game-show-extra-options-row").hide();

    // Redraw the tooltip so that the new elements will fit better.
    tooltips.reposition("#nav-buttons-lobby-create-game");
    tooltips.reposition("#nav-buttons-pregame-change-options");
  });

  // Disable some checkboxes if a checkbox is checked.
  $("#createTableOneExtraCard").on("change", () => {
    if ($("#createTableOneExtraCard").is(":checked")) {
      $("#createTableOneLessCardRow").fadeTo(0, 0.3);
      $("#createTableOneLessCard").prop("disabled", true);
      $("#createTableOneLessCardLabel").css("cursor", "auto");
    } else {
      $("#createTableOneLessCardRow").fadeTo(0, 1);
      $("#createTableOneLessCard").prop("disabled", false);
      $("#createTableOneLessCardLabel").css("cursor", "pointer");
    }

    // Remember the new setting.
    getCheckbox("createTableOneLessCard");
  });

  $("#createTableOneLessCard").on("change", () => {
    if ($("#createTableOneLessCard").is(":checked")) {
      $("#createTableOneExtraCardRow").fadeTo(0, 0.3);
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
    getVariantName("createTableVariant");
  });
  $("#create-game-variant-dropdown2").on("change", () => {
    getVariantName("createTableVariant");
  });
  $("#createTableTimeBaseMinutes").on("change", () => {
    getTextboxForTimeBase("createTableTimeBaseMinutes");
  });
  $("#createTableTimePerTurnSeconds").on("change", () => {
    getTextboxForTimePerTurn("createTableTimePerTurnSeconds");
  });
  $("#createTableCardCycle").on("change", () => {
    getCheckbox("createTableCardCycle");
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

  // Pressing enter anywhere will submit the form.
  $("#create-game-tooltip").on("keypress", (event) => {
    if (event.which === KeyCode.KEY_RETURN) {
      event.preventDefault();
      $("#create-game-submit").trigger("click");
    }
  });

  $("#create-game-submit").on("click", submit);

  // Add delegate handler for new options buttons.
  $("#lobby-chat-pregame").on("click", "button.new-options", (e) => {
    const data = String($(e.target).data("new-options"));
    const regExp = /'/g;
    const textWithDoubleQuotes = data.replaceAll(regExp, '"');
    const options = JSON.parse(textWithDoubleQuotes) as Options;
    acceptOptionsFromGuest(options);
    $(e.target).text("sent").prop("disabled", true);
  });
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
  // Populate the full datalist/dropdown in the "Create Game" tooltip.
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

  // Get timer values
  const timed = getCheckbox("createTableTimed");
  let timeBaseSeconds = 0;
  let timePerTurn = 0;

  // Try getting the user's values. If they are invalid, leave the dialog open.
  if (timed) {
    let timeValue: number;
    let foundErrors = false;

    try {
      timeValue = getTextboxForTimeBase("createTableTimeBaseMinutes");
      timeBaseSeconds = Math.round(timeValue * 60);
    } catch {
      // Invalid value, inform the UI and do not close the tooltip.
      $("#createTableTimeBaseMinutes").addClass("wrongInput");
      foundErrors = true;
    }

    try {
      timePerTurn = getTextboxForTimePerTurn("createTableTimePerTurnSeconds");
    } catch {
      // Invalid value, inform the UI and do not close the tooltip.
      $("#createTableTimePerTurnSeconds").addClass("wrongInput");
      foundErrors = true;
    }

    if (foundErrors) {
      return;
    }
  }

  // Table names are not saved.
  const name = $("#createTableName").val();

  // Passwords are not stored on the server; instead, they are stored locally as cookies.
  const password = $("#createTablePassword").val();
  if (typeof password !== "string") {
    throw new TypeError(
      'The value of the "createTablePassword" element was not a string.',
    );
  }
  if (isNew) {
    localStorage.setItem("createTablePassword", password);
  }

  // Max players must be a valid number.
  const maxPlayersString = $("#createTableMaxPlayers").val();
  if (typeof maxPlayersString !== "string") {
    throw new TypeError(
      'The value of the "createTableMaxPlayers" element was not a string.',
    );
  }
  let maxPlayers = parseIntSafe(maxPlayersString);
  if (
    maxPlayers === undefined ||
    maxPlayers < MIN_PLAYERS ||
    maxPlayers > MAX_PLAYERS
  ) {
    maxPlayers = 5;
  }
  checkSettingChanged("createTableMaxPlayers", maxPlayers);

  // Game JSON is not saved.
  const gameJSONString = $("#createTableJSON").val();
  if (typeof gameJSONString !== "string") {
    throw new TypeError(
      'The value of the "createTableJSON" element is not a string.',
    );
  }
  let gameJSON: unknown;
  if (gameJSONString !== "") {
    try {
      gameJSON = JSON.parse(gameJSONString);
    } catch {
      modals.showError("That is not a valid JSON object.");
      return;
    }
    if (typeof gameJSON !== "object") {
      modals.showError("That is not a valid JSON object.");
      return;
    }
  }

  const options = {
    variantName: getVariantName("createTableVariant"), // This is a hidden span field.
    timed,
    timeBase: timeBaseSeconds,
    timePerTurn,
    speedrun: getCheckbox("createTableSpeedrun"),
    cardCycle: getCheckbox("createTableCardCycle"),
    deckPlays: getCheckbox("createTableDeckPlays"),
    emptyClues: getCheckbox("createTableEmptyClues"),
    oneExtraCard: getCheckbox("createTableOneExtraCard"),
    oneLessCard: getCheckbox("createTableOneLessCard"),
    allOrNothing: getCheckbox("createTableAllOrNothing"),
    detrimentalCharacters: getCheckbox("createTableDetrimentalCharacters"),
  };

  // Fast close modals first - the server might reply with a modal warning.
  modals.closeModals(true);

  if (isNew) {
    globals.conn!.send("tableCreate", {
      name,
      options,
      password,
      gameJSON,
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

  // Remove error indications
  $("#createTableTimeBaseMinutes").removeClass("wrongInput");
  $("#createTableTimePerTurnSeconds").removeClass("wrongInput");
}

function acceptOptionsFromGuest(options: Options) {
  const name = options.tableName;
  const { maxPlayers } = options;

  globals.conn!.send("tableUpdate", {
    tableID: globals.tableID,
    name,
    options,
    maxPlayers,
  });
}

function getCheckbox(setting: keyof Settings): boolean {
  const selector = `#${setting}`;
  const element = getHTMLInputElement(selector);
  const value = element.checked;
  checkSettingChanged(setting, value);
  return value;
}

function getTextboxValue(setting: keyof Settings): string {
  const selector = `#${setting}`;
  const element = getHTMLInputElement(selector);
  return element.value.trim();
}

function getTextboxForTimePerTurn(setting: keyof Settings): number {
  const element = $(`#${setting}`);
  const valueString = getTextboxValue(setting);
  let value = parseIntSafe(valueString);
  if (value === undefined) {
    // They have entered an invalid amount of seconds, so revert to using the default value.
    value = 20;

    // Also change the value of the actual element on the page.
    element.val(value.toString());
  }

  checkSettingChanged(setting, value);
  return value;
}

function getTextboxForTimeBase(setting: keyof Settings): number {
  const element = $(`#${setting}`);
  const valueString = getTextboxValue(setting);
  let value = parseFloatSafe(valueString);
  if (value === undefined) {
    // They have entered an invalid amount of minutes, so revert to using the default value.
    value = 2;

    // Also change the value of the actual element on the page.
    element.val(value.toString());
  }

  checkSettingChanged(setting, value);
  return value;
}

function getVariantName(setting: keyof Settings): string {
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

// This function is executed every time the "Create Game" button is clicked (before the tooltip is
// added to the DOM).
export function before(): boolean {
  if (globals.shuttingDown) {
    const now = new Date();
    const elapsedTimeMilliseconds =
      now.getTime() - globals.datetimeShutdownInit.getTime();
    // SHUTDOWN_TIMEOUT is in minutes.
    const shutdownTimeoutMilliseconds = SHUTDOWN_TIMEOUT * 60 * 1000;
    const millisecondsLeft =
      shutdownTimeoutMilliseconds - elapsedTimeMilliseconds;
    const minutesLeft = new Date(millisecondsLeft).getMinutes();
    if (minutesLeft <= 5) {
      let msg = "The server is shutting down ";
      if (minutesLeft <= 0) {
        msg += "momentarily";
      } else if (minutesLeft === 1) {
        msg += "in 1 minute";
      } else {
        msg += `in ${minutesLeft} minutes`;
      }
      msg += ". You cannot start any new games for the time being.";
      modals.showWarning(msg);
      return false;
    }
  }

  if (globals.maintenanceMode) {
    modals.showWarning(
      "The server is currently in maintenance mode. You cannot start any new games for the time being.",
    );
    return false;
  }

  return true;
}

// This function is executed every time the "Create Game" button is clicked (after the tooltip is
// added to the DOM).
export function ready(): boolean {
  // Change the UI if we are in a pre-game screen.
  let dialogTitle = "Create a New Game";
  let buttonTitle = "Create";
  let gameName = "";
  let dialogOptions: Options | Settings | null = null;

  if (globals.game === null || globals.currentScreen === Screen.Lobby) {
    // Create New Game
    if (debug.amTestUser(globals.username)) {
      gameName = "test game";
    } else {
      gameName = globals.randomTableName;

      // Get a new random name from the server for the next time we click the button.
      globals.conn!.send("getName");
    }
    dialogOptions = globals.settings;

    // Show the password row.
    $("#password-row").removeClass("hidden");

    // Ensure create-game-table-number is empty.
    $("#create-game-table-number").val("");

    // Show JSON row
    $("#create-game-json-row").removeClass("hidden");
  } else {
    // Change Options
    dialogTitle = "Change Game Options";
    buttonTitle = "Change";
    gameName = globals.game.name;
    dialogOptions = globals.game.options;

    // Can't change the password once the game is created.
    $("#password-row").addClass("hidden");

    // Ensure create-game-table-number has a value.
    $("#create-game-table-number").val(globals.tableID);

    // Hide JSON row
    $("#create-game-json-row").addClass("hidden");
  }

  // Set UI Elements and values.
  $("#create-game-modal-title").text(dialogTitle);
  $("#create-game-submit").text(buttonTitle);
  $("#createTableName").val(gameName);

  // Fill in the rest of form with the settings that we used last time (which is stored on the
  // server).

  // eslint-disable-next-line isaacscript/no-object-any
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
  const password = localStorage.getItem("createTablePassword");
  if (password !== null && password !== "") {
    $("#createTablePassword").val(password);
  }

  let maxPlayers = globals.settings.createTableMaxPlayers;
  if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) {
    maxPlayers = DEFAULT_CREATE_TABLE_MAX_PLAYERS;
  }
  $("#createTableMaxPlayers").val(maxPlayers);

  // Hide the extra options if we do not have any selected.
  if (
    !globals.settings.createTableSpeedrun &&
    !globals.settings.createTableCardCycle &&
    !globals.settings.createTableDeckPlays &&
    !globals.settings.createTableEmptyClues &&
    !globals.settings.createTableOneExtraCard &&
    !globals.settings.createTableOneLessCard &&
    !globals.settings.createTableAllOrNothing &&
    !globals.settings.createTableDetrimentalCharacters
  ) {
    $("#create-game-extra-options").hide();
    $("#create-game-show-extra-options-row").show();
  } else {
    $("#create-game-extra-options").show();
    $("#create-game-show-extra-options-row").hide();
  }

  // Hide the JSON field if we are not in a development environment.
  if (window.location.hostname !== "localhost") {
    $("#create-game-json-row").hide();
  }

  return true;
}

function readyVariant(value: string) {
  // Validate the variant name that we got from the server.
  let variantName: string;
  if (doesVariantExist(value)) {
    variantName = value;
  } else {
    variantName = DEFAULT_VARIANT_NAME;
    globals.settings.createTableVariant = variantName;
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
