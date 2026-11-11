// The "Watch Specific Replay" screen.

import { assertDefined, parseIntSafe } from "complete-common";
import { LOCAL_STORAGE_KEY } from "../constants";
import { globals } from "../Globals";
import { escapeHtml } from "../utils";
import type { GameJSON } from "./gameJSON";
import { parseGameJSON } from "./gameJSON";
import * as lobbyPage from "./lobbyPage";

export function init(): void {
  // Make the text box appear and disappear depending on which source is selected.
  $("#replay-source-id").change(replaySourceChange);
  $("#replay-source-json").change(replaySourceChange);

  // Only shared replays can be spoiler-free reviews.
  $("#replay-visibility-solo").change(replayVisibilityChange);
  $("#replay-visibility-shared").change(replayVisibilityChange);

  $("#replay-submit").on("click", submit);
}

function replaySourceChange() {
  if ($("#replay-source-id").prop("checked") === true) {
    $("#replay-json-row").hide();
    $("#replay-id-row").show();
    setTimeout(() => {
      $("#replay-id").select(); // Automatically highlight the ID field
      // (This has to be in a timeout in order to work properly.)
    }, 0);
  } else if ($("#replay-source-json").prop("checked") === true) {
    $("#replay-id-row").hide();
    $("#replay-json-row").show();
    setTimeout(() => {
      $("#replay-json").select(); // Automatically highlight the JSON field
      // (This has to be in a timeout in order to work properly.)
    }, 0);
  } else {
    throw new Error('Invalid value for "replay-source".');
  }
}

function replayVisibilityChange() {
  $("#replay-spoiler-free-row").toggle(
    $("#replay-visibility-shared").prop("checked") === true,
  );
}

function submit() {
  // Source
  const sourceID = $("input[type=radio][name=replay-source]:checked")[0]!.id;

  let source: string;
  switch (sourceID) {
    case "replay-source-id": {
      source = "id";
      break;
    }

    case "replay-source-json": {
      source = "json";
      break;
    }

    default: {
      throw new Error('Invalid value for "replay-source".');
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SOURCE, source);

  // Error
  $("#replay-error-row").hide();

  // ID
  const gameIDString = $("#replay-id").val();
  if (typeof gameIDString !== "string") {
    throw new TypeError(
      'The value of the "replay-id" element is not a string.',
    );
  }
  let gameID: number | undefined;
  if (source === "id") {
    gameID = parseIntSafe(gameIDString);
    if (gameID === undefined) {
      showReplayError("Error: The database ID must be a number.");
      return;
    }
    if (gameID < 1) {
      showReplayError("Error: The database ID must be a positive number.");
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_ID, gameIDString);
  }

  // JSON
  const gameJSONString = $("#replay-json").val();
  if (typeof gameJSONString !== "string") {
    throw new TypeError(
      'The value of the "replay-json" element is not a string.',
    );
  }
  let gameJSON: GameJSON | undefined;
  if (source === "json") {
    const parsed = parseGameJSON(gameJSONString);
    if ("error" in parsed) {
      showReplayError(escapeHtml(parsed.error));
      return;
    }
    ({ gameJSON } = parsed);
    localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON, gameJSONString);
  }

  // Visibility
  const visibilityIDElement = $(
    "input[type=radio][name=replay-visibility]:checked",
  )[0];
  assertDefined(
    visibilityIDElement,
    "Failed to get the replay visibility element.",
  );
  const visibilityID = visibilityIDElement.id;

  let visibility: "solo" | "shared";
  switch (visibilityID) {
    case "replay-visibility-solo": {
      visibility = "solo";
      break;
    }

    case "replay-visibility-shared": {
      visibility = "shared";
      break;
    }

    default: {
      throw new Error('Invalid value for "replay-visibility".');
    }
  }

  localStorage.setItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY, visibility);

  // Spoiler-Free Review
  const spoilerFreeChecked = $("#replay-spoiler-free").prop("checked") === true;
  localStorage.setItem(
    LOCAL_STORAGE_KEY.WATCH_REPLAY_SPOILER_FREE,
    spoilerFreeChecked.toString(),
  );
  const spoilerFree = visibility === "shared" && spoilerFreeChecked;

  if (source === "id" && gameID !== undefined) {
    globals.conn!.send("replayCreate", {
      type: source,
      gameID,
      visibility,
      spoilerFree,
    });
  } else if (source === "json" && gameJSON !== undefined) {
    globals.conn!.send("replayCreate", {
      type: source,
      gameJSON,
      visibility,
      spoilerFree,
    });
  }

  lobbyPage.hide();
}

function showReplayError(text: string) {
  $("#replay-error-row").show();
  $("#replay-error-row-text").text(text);
}

export function show(): void {
  ready();
  lobbyPage.show("#lobby-replay", "#replay-submit");
  $(
    $("#replay-source-json").prop("checked") === true
      ? "#replay-json"
      : "#replay-id",
  ).trigger("focus");
}

/** Fills in the form with what was used last time. */
function ready() {
  // Set the "Source" radio button.
  const source = localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SOURCE);
  let sourceBox: string;
  if (source === "id") {
    sourceBox = "#replay-source-id";
  } else if (source === "json") {
    sourceBox = "#replay-source-json";
  } else {
    // Default to ID
    sourceBox = "#replay-source-id";
  }
  $(sourceBox).prop("checked", true);
  $(sourceBox).change();

  // Set the "ID" field.
  let gameID = localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_ID);
  if (typeof gameID !== "string") {
    gameID = "";
  }
  $("#replay-id").val(gameID);

  // Set the "JSON" field.
  let json = localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_JSON);
  if (typeof json !== "string") {
    json = "";
  }
  $("#replay-json").val(json);

  // Hide the error row.
  $("#replay-error-row").hide();

  // Set the "Visibility" radio button.
  const visibility = localStorage.getItem(
    LOCAL_STORAGE_KEY.WATCH_REPLAY_VISIBILITY,
  );
  let visibilityBox: string;
  if (visibility === "solo") {
    visibilityBox = "#replay-visibility-solo";
  } else if (visibility === "shared") {
    visibilityBox = "#replay-visibility-shared";
  } else {
    // Default to solo
    visibilityBox = "#replay-visibility-solo";
  }
  $(visibilityBox).prop("checked", true);
  $(visibilityBox).change();

  // Set the "Spoiler-Free Review" checkbox.
  $("#replay-spoiler-free").prop(
    "checked",
    localStorage.getItem(LOCAL_STORAGE_KEY.WATCH_REPLAY_SPOILER_FREE)
      === "true",
  );
}
