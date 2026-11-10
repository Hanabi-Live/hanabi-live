// The "Settings" nav button.

import {
  MAX_H_GROUP_LEVEL,
  MAX_VOLUME,
  SoundMove,
  defaultSettings,
} from "@hanabi-live/data";
import {
  assertDefined,
  assertEnumValue,
  iRange,
  isKeyOf,
  parseIntSafe,
} from "complete-common";
import { globals } from "../Globals";
import { SoundType } from "../game/types/SoundType";
import * as notifications from "../notifications";
import { SOUNDS_PATH } from "../sounds";
import * as theme from "../theme";

export function init(): void {
  $("#settings-volume-slider")
    .attr("max", MAX_VOLUME)
    .val(defaultSettings.volume);
  $("#settings-volume-slider").change(function settingsVolumeSliderChange(
    this: HTMLElement,
  ) {
    const element = $(this);
    const volumeString = element.val();
    if (typeof volumeString !== "string") {
      throw new TypeError(
        `The value of the "#settings-volume-slider" element is not a string: ${volumeString}`,
      );
    }

    const volume = parseIntSafe(volumeString);
    assertDefined(
      volume,
      `The value of the "#settings-volume-slider" element could not be converted to a number: ${volumeString}`,
    );

    globals.settings = {
      ...globals.settings,
      volume,
    };

    $("#settings-volume-slider-value").html(`${volume}%`);
    globals.conn!.send("setting", { settings: { volume } });
    showSaved(this);
  });

  $("#settings-volume-test").click(() => {
    const audio = new Audio(`${SOUNDS_PATH}/${SoundType.Us}.mp3`);
    const element = $("#settings-volume-slider");
    const volumeString = element.val();
    if (typeof volumeString !== "string") {
      throw new TypeError(
        `The value of the "#settings-volume-slider" element is not a string: ${volumeString}`,
      );
    }

    const volume = parseIntSafe(volumeString);
    assertDefined(
      volume,
      `The value of the "#settings-volume-slider" element could not be converted to a number: ${volumeString}`,
    );

    audio.volume = volume / MAX_VOLUME;
    audio.play().catch((error: unknown) => {
      console.error("Failed to play the test sound:", error);
    });
  });

  $("#soundMove").change(function settingsSoundMoveChange(this: HTMLElement) {
    const element = $(this);
    const soundMoveString = element.val();
    if (typeof soundMoveString !== "string") {
      throw new TypeError(
        `The value of the "#soundMove" element is not a string: ${soundMoveString}`,
      );
    }

    const soundMove = parseIntSafe(soundMoveString);
    assertDefined(
      soundMove,
      `The value of the "#soundMove" element could not be converted to a number: ${soundMoveString}`,
    );

    assertEnumValue(
      soundMove,
      SoundMove,
      `The value of "#soundMove" element was not a valid SoundMove enum: ${soundMove}`,
    );

    globals.settings = {
      ...globals.settings,
      soundMove,
    };

    globals.conn!.send("setting", { settings: { soundMove } });
    showSaved(this);
  });

  const hGroupLevelSelect = $("#hGroupLevel");
  hGroupLevelSelect.append($("<option>").val(0).text("Not set"));
  for (const level of iRange(1, MAX_H_GROUP_LEVEL)) {
    hGroupLevelSelect.append($("<option>").val(level).text(`Level ${level}`));
  }
  hGroupLevelSelect.change(function settingsHGroupLevelChange(
    this: HTMLElement,
  ) {
    const hGroupLevelString = $(this).val();
    if (typeof hGroupLevelString !== "string") {
      throw new TypeError(
        `The value of the "#hGroupLevel" element is not a string: ${hGroupLevelString}`,
      );
    }

    const hGroupLevel = parseIntSafe(hGroupLevelString);
    assertDefined(
      hGroupLevel,
      `The value of the "#hGroupLevel" element could not be converted to a number: ${hGroupLevelString}`,
    );

    globals.settings = {
      ...globals.settings,
      hGroupLevel,
    };

    globals.conn!.send("setting", { settings: { hGroupLevel } });
    showSaved(this);
  });
}

export function setPlayerSettings(): void {
  // The server has delivered to us a list of all of our settings. Check the checkboxes for the
  // settings that we have enabled (and adjust the volume slider).
  for (const [setting, value] of Object.entries(globals.settings)) {
    if (setting.startsWith("createTable")) {
      // Settings for the "Create Game" nav button are handled when the user clicks on it.
      continue;
    }
    if (setting === "volume") {
      if (typeof value !== "number") {
        throw new TypeError("The volume setting is not stored as a number.");
      }
      $("#settings-volume-slider").val(value);
      $("#settings-volume-slider-value").html(`${value}%`);
    } else if (setting === "soundMove" || setting === "hGroupLevel") {
      // These settings are drop-down menus whose element has the same ID as the setting.
      if (typeof value !== "number") {
        throw new TypeError(
          `The "${setting}" setting is not stored as a number.`,
        );
      }
      $(`#${setting}`).val(value);
    } else {
      const element = $(`#${setting}`);
      if (typeof value !== "boolean") {
        throw new TypeError(
          `The "${setting}" setting is not stored as a boolean.`,
        );
      }
      element.prop("checked", value);
      element.change(changeSetting);
    }
  }
  showHGroupLevel(globals.settings.hGroupConventions);
}

/** How long "Saved" stays beside a setting before it fades out. */
const SAVED_STATUS_MILLISECONDS = 2000;

const savedStatusTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

/** Shows "Saved" on the row of the control that the user just changed. */
function showSaved(control: HTMLElement) {
  const row = control.closest<HTMLElement>(".lobby-row");
  if (row === null) {
    return;
  }

  let status = row.querySelector<HTMLElement>(".setting-status");
  if (status === null) {
    status = document.createElement("span");
    status.className = "setting-status";
    status.setAttribute("role", "status");
    // The status goes just before the control, at the end of the description.
    row.lastElementChild!.before(status);
  }

  // Write the text again each time, so that screen readers announce every save.
  const icon = document.createElement("i");
  icon.className = "fas fa-check";
  status.replaceChildren(icon, "Saved");
  status.classList.add("visible");
  const oldTimer = savedStatusTimers.get(row);
  if (oldTimer !== undefined) {
    clearTimeout(oldTimer);
  }
  savedStatusTimers.set(
    row,
    setTimeout(() => {
      status.classList.remove("visible");
      savedStatusTimers.delete(row);
    }, SAVED_STATUS_MILLISECONDS),
  );
}

/** The H-Group level only matters to people who use the H-Group features. */
function showHGroupLevel(hGroupConventions: boolean) {
  $("#hGroupLevel-row").toggle(hGroupConventions);
}

function changeSetting(this: HTMLElement) {
  const element = $(this);
  const settingName = element.attr("id");
  if (settingName === undefined || settingName === "") {
    throw new Error(
      "Failed to get the ID of the element when changing a setting.",
    );
  }
  if (!isKeyOf(settingName, globals.settings)) {
    throw new Error(
      `The setting of ${settingName} does not exist in the Settings class.`,
    );
  }
  const setting = globals.settings[settingName];

  const checked = element.is(":checked");
  if (setting === checked) {
    return;
  }

  // Write the new value to our local variable. We must cast the settings to any since this
  // assignment violates type safety.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globals.settings[settingName] as any) = checked;

  // Send the new value to the server.
  globals.conn!.send("setting", { settings: { [settingName]: checked } });
  showSaved(this);

  switch (settingName) {
    case "desktopNotification": {
      if (checked) {
        notifications.test();
      }
      break;
    }

    case "hGroupConventions": {
      showHGroupLevel(checked);
      break;
    }

    case "darkMode": {
      theme.setDarkMode(checked);
      break;
    }

    default: {
      break;
    }
  }
}
