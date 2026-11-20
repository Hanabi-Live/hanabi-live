// The "Settings" page. Each change goes to the server at once, and "Saved" shows beside it.

import type { Settings } from "@hanabi-live/data";
import {
  MAX_H_GROUP_LEVEL,
  MAX_VOLUME,
  soundMoveSchema,
} from "@hanabi-live/data";
import { iRange, parseIntSafe } from "complete-common";
import { Fragment, useEffect, useRef, useState } from "react";
import { globals } from "../../Globals.ts";
import { Select } from "../../Select.tsx";
import {
  getFadeStyle,
  useReducedMotion,
  useRevealClassName,
} from "../../fade.ts";
import { SoundType } from "../../game/types/SoundType.ts";
import * as notifications from "../../notifications.ts";
import { settingsChanged } from "../../sessionSlice.ts";
import { SOUNDS_PATH } from "../../sounds.ts";
import { store, useAppSelector } from "../../store.ts";
import * as theme from "../../theme.ts";
import { PageTitle } from "../PageTitle.tsx";

/** How long "Saved" stays beside a setting before it fades out. */
export const SAVED_STATUS_MILLISECONDS = 1000;

type BooleanSetting = {
  [Key in keyof Settings]-?: Settings[Key] extends boolean ? Key : never;
}[keyof Settings];

export function SettingsPage(): React.JSX.Element {
  const hGroupConventions = useAppSelector(
    (state) => state.session.settings.hGroupConventions,
  );

  return (
    <>
      <PageTitle>Settings</PageTitle>

      <div className="lobby-group">
        <h3>Notifications &amp; Sound</h3>
        <ul className="lobby-rows">
          <CheckboxRow icon="fa-bell" setting="desktopNotification">
            Show a desktop notification when it reaches your turn
          </CheckboxRow>
          <SoundMoveRow />
          <CheckboxRow icon="fa-stopwatch" setting="soundTimer">
            Play a sound when a timer is below 10 seconds
          </CheckboxRow>
          <VolumeRow />
        </ul>
      </div>

      <div className="lobby-group">
        <h3>Appearance</h3>
        <ul className="lobby-rows">
          <CheckboxRow icon="fa-circle-half-stroke" setting="darkMode">
            Dark mode
          </CheckboxRow>
          <CheckboxRow icon="fa-table-columns" setting="keldonMode">
            Keldon mode (hands spread around the table)
          </CheckboxRow>
          <CheckboxRow icon="fa-shapes" setting="newUi">
            New UI (redesigned game screen, in testing)
          </CheckboxRow>
          <CheckboxRow icon="fa-eye" setting="colorblindMode">
            Colorblind mode
          </CheckboxRow>
          <CheckboxRow icon="fa-hand" setting="realLifeMode">
            Real-life mode (no extra UI elements)
          </CheckboxRow>
          <CheckboxRow icon="fa-right-left" setting="reverseHands">
            Reverse hand direction (new cards go on the right)
          </CheckboxRow>
          <CheckboxRow icon="fa-paintbrush" setting="styleNumbers">
            Make numbers on cards match the art style
          </CheckboxRow>
          <CheckboxRow icon="fa-clock" setting="showTimerInUntimed">
            Show turn timers in untimed games
          </CheckboxRow>
          <CheckboxRow icon="fa-wind" setting="reducedMotion">
            Reduced motion (less animations)
          </CheckboxRow>
        </ul>
      </div>

      <div className="lobby-group">
        <h3>Expert Features</h3>
        <ul className="lobby-rows">
          <CheckboxRow icon="fa-chess" setting="hGroupConventions">
            Enable{" "}
            <a
              href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md#h-group-conventions"
              rel="noopener noreferrer"
              target="_blank"
            >
              H-Group
            </a>{" "}
            features
          </CheckboxRow>
          {/* The level only matters to people who use the H-Group features. */}
          <HGroupLevelRow shown={hGroupConventions} />
          <CheckboxRow icon="fa-forward" setting="preplay">
            Enable pre-playing cards
          </CheckboxRow>
          <CheckboxRow icon="fa-person-running" setting="speedrunFeatures">
            Enable speedrun features in non-speedrun games
          </CheckboxRow>
        </ul>
      </div>
    </>
  );
}

function CheckboxRow({
  children,
  icon,
  setting,
}: {
  readonly children: React.ReactNode;
  readonly icon: string;
  readonly setting: BooleanSetting;
}) {
  const checked = useAppSelector((state) => state.session.settings[setting]);
  const [status, showSaved] = useSavedStatus();

  return (
    <li className="lobby-row">
      <RowLabel htmlFor={setting} icon={icon}>
        {children}
      </RowLabel>
      {status}
      <span className="lobby-row-checkbox">
        <input
          checked={checked}
          id={setting}
          onChange={(event) => {
            const value = event.target.checked;
            changeSetting({ [setting]: value });
            showSaved();
            if (setting === "desktopNotification" && value) {
              notifications.test();
            } else if (setting === "darkMode") {
              theme.setDarkMode(value);
            }
          }}
          type="checkbox"
        />
        <label htmlFor={setting} />
      </span>
    </li>
  );
}

function SoundMoveRow() {
  const soundMove = useAppSelector((state) => state.session.settings.soundMove);
  const [status, showSaved] = useSavedStatus();

  return (
    <li className="lobby-row">
      <RowLabel htmlFor="soundMove" icon="fa-music">
        Move sounds
      </RowLabel>
      {status}
      <Select
        id="soundMove"
        onChange={(event) => {
          changeSetting({
            soundMove: soundMoveSchema.parse(event.target.value),
          });
          showSaved();
        }}
        value={soundMove}
      >
        <option value="all">Play a sound when a move is made</option>
        <option value="onlyOwn">Play a sound when it's my turn</option>
        <option value="none">No Sound</option>
      </Select>
    </li>
  );
}

function VolumeRow() {
  const volume = useAppSelector((state) => state.session.settings.volume);
  const [status, showSaved] = useSavedStatus();
  // While the slider moves, it shows a volume that it saves only when it is released.
  const [movingVolume, setMovingVolume] = useState<number>();
  const sliderRef = useRef<HTMLInputElement>(null);
  const shownVolume = movingVolume ?? volume;

  // React's "onChange" fires on every move, so listen for the native "change" event instead.
  useEffect(() => {
    const slider = sliderRef.current!;
    function onRelease() {
      changeSetting({ volume: slider.valueAsNumber });
      setMovingVolume(undefined);
      showSaved();
    }
    slider.addEventListener("change", onRelease);
    return () => {
      slider.removeEventListener("change", onRelease);
    };
  }, [showSaved]);

  return (
    <li className="lobby-row tw:narrow-640:flex-col tw:narrow-640:items-stretch tw:narrow-640:gap-2">
      <RowLabel htmlFor="settings-volume-slider" icon="fa-volume-high">
        Volume
      </RowLabel>
      {status}
      <span className="tw:flex tw:shrink-0 tw:items-center tw:gap-4">
        <input
          className="tw:h-[0.25em] tw:w-[10em] tw:rounded-[3px] tw:border-none tw:bg-(--border) tw:accent-(--button-primary-bg) tw:narrow-640:min-w-0 tw:narrow-640:flex-1"
          id="settings-volume-slider"
          max={MAX_VOLUME}
          min="0"
          onChange={(event) => {
            setMovingVolume(event.target.valueAsNumber);
          }}
          ref={sliderRef}
          step="5"
          type="range"
          value={shownVolume}
        />
        <span className="tw:min-w-[2.75em] tw:text-right">{shownVolume}%</span>
        <button
          className="button alt small"
          onClick={() => {
            const audio = new Audio(`${SOUNDS_PATH}/${SoundType.Us}.mp3`);
            audio.volume = shownVolume / MAX_VOLUME;
            audio.play().catch((error: unknown) => {
              console.error("Failed to play the test sound:", error);
            });
          }}
          type="button"
        >
          Test
        </button>
      </span>
    </li>
  );
}

function HGroupLevelRow({ shown }: { readonly shown: boolean }) {
  const hGroupLevel = useAppSelector(
    (state) => state.session.settings.hGroupLevel,
  );
  const reducedMotion = useReducedMotion();
  const [status, showSaved] = useSavedStatus();

  return (
    <li
      className={`lobby-row ${useRevealClassName(shown)}`}
      style={getFadeStyle(reducedMotion)}
    >
      <RowLabel htmlFor="hGroupLevel" icon="fa-signal">
        My highest{" "}
        <a
          href="https://hanabi.github.io/learning-path"
          rel="noopener noreferrer"
          target="_blank"
        >
          H-Group level
        </a>
      </RowLabel>
      {status}
      <Select
        className={LEVEL_PICKER_CLASS}
        id="hGroupLevel"
        onChange={(event) => {
          const level = parseIntSafe(event.target.value);
          if (level === undefined) {
            // A level that we did not choose is absent from our settings.
            const { hGroupLevel: _cleared, ...settings } =
              store.getState().session.settings;
            store.dispatch(settingsChanged(settings));
            globals.connection.send("settings", {
              settings: {},
              cleared: ["hGroupLevel"],
            });
          } else {
            changeSetting({ hGroupLevel: level });
          }
          showSaved();
        }}
        onKeyDown={moveInLevelGrid}
        style={LEVEL_PICKER_STYLE}
        value={hGroupLevel ?? ""}
      >
        {[...iRange(1, MAX_H_GROUP_LEVEL)].map((level) => (
          <option className={LEVEL_CLASS} key={level} value={level}>
            {/* The closed dropdown shows the whole text, and the grid shows only the number. */}
            <span className="tw:hidden">Level </span>
            {level}
          </option>
        ))}
        <hr className="tw:col-span-full" />
        <option className={`${LEVEL_CLASS} tw:col-span-full`} value="">
          Not set
        </option>
      </Select>
    </li>
  );
}

/** The number of levels in each row of the list of levels. */
const LEVEL_COLUMNS = 5;

/** The list of levels is a grid of numbers, so that it shows every level without a scroll bar. */
const LEVEL_PICKER_CLASS = [
  "tw:[&:open::picker(select)]:grid",
  "tw:[&::picker(select)]:grid-cols-[repeat(var(--level-columns),2.5em)]",
  "tw:[&::picker(select)]:gap-1",
  // On a phone, the dropdown and its list fill the row, and the grid is in the middle of the list.
  "tw:[&::picker(select)]:justify-center",
  // The grid is wider than the dropdown, so it lines up with the dropdown's right edge.
  "tw:[&::picker(select)]:[position-area:block-end_span-inline-start]",
  "tw:[&::picker(select)]:[position-try-fallbacks:flip-block]",
].join(" ");

const LEVEL_PICKER_STYLE = {
  "--level-columns": LEVEL_COLUMNS,
} as React.CSSProperties;

/** A cell of the grid. The chosen level is filled, instead of having a check mark. */
const LEVEL_CLASS = [
  "tw:justify-center",
  "tw:tabular-nums",
  "tw:[&::checkmark]:hidden",
  "tw:checked:bg-green",
  "tw:checked:text-text-on-accent",
  "tw:checked:hover:bg-green",
].join(" ");

/** The arrow keys move through the grid of levels in rows and columns. */
function moveInLevelGrid(event: React.KeyboardEvent<HTMLSelectElement>) {
  const option = event.target;
  if (!(option instanceof HTMLOptionElement)) {
    return;
  }

  const step = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -LEVEL_COLUMNS,
    ArrowDown: LEVEL_COLUMNS,
  }[event.key];
  if (step === undefined) {
    return;
  }
  event.preventDefault();

  // Down from the last row goes to "Not set", which fills the row under the grid.
  const { options } = event.currentTarget;
  const index = Math.min(option.index + step, options.length - 1);
  if (index >= 0 && index !== option.index) {
    options[index]?.focus();
  }
}

function RowLabel({
  children,
  htmlFor,
  icon,
}: {
  readonly children: React.ReactNode;
  readonly htmlFor: string;
  readonly icon: string;
}) {
  return (
    <label htmlFor={htmlFor}>
      <i className={`fas ${icon} fa-fw`} />
      {children}
    </label>
  );
}

/** Changes our settings here and on the server. */
function changeSetting(changed: Partial<Settings>) {
  store.dispatch(
    settingsChanged({
      ...store.getState().session.settings,
      ...changed,
    }),
  );
  globals.connection.send("settings", { settings: changed });
}

/**
 * Returns the "Saved" status of a row, which goes before its control, and a function that shows it.
 * The status takes no room until the first save.
 */
function useSavedStatus(): [React.ReactNode, () => void] {
  const reducedMotion = useAppSelector(
    (state) => state.session.settings.reducedMotion,
  );
  const [saves, setSaves] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (saves === 0) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setVisible(false);
    }, SAVED_STATUS_MILLISECONDS);
    return () => {
      clearTimeout(timer);
    };
  }, [saves]);

  const showSaved = useRef(() => {
    setSaves((count) => count + 1);
    setVisible(true);
  }).current;

  const status =
    saves === 0 ? undefined : (
      <span
        className={[
          "tw:shrink-0 tw:text-[0.9em] tw:whitespace-nowrap tw:text-green-text",
          visible
            ? "tw:visible tw:opacity-100"
            : `tw:invisible tw:opacity-0 ${reducedMotion ? "" : "tw:transition-[opacity,visibility] tw:duration-[0.4s] tw:ease-[ease]"}`,
        ].join(" ")}
        role="status"
      >
        {/* New nodes for each save, so that screen readers announce every one. */}
        <Fragment key={saves}>
          <i className="fas fa-check tw:mr-[0.4em]" />
          Saved
        </Fragment>
      </span>
    );

  return [status, showSaved];
}
