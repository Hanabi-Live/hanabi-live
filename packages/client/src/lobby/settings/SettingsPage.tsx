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
import { SoundType } from "../../game/types/SoundType.ts";
import * as notifications from "../../notifications.ts";
import { SOUNDS_PATH } from "../../sounds.ts";
import { useAppSelector } from "../../store.ts";
import * as theme from "../../theme.ts";

/** How long "Saved" stays beside a setting before it fades out. */
const SAVED_STATUS_MILLISECONDS = 2000;

type BooleanSetting = {
  [Key in keyof Settings]-?: Settings[Key] extends boolean ? Key : never;
}[keyof Settings];

export function SettingsPage(): React.JSX.Element {
  const hGroupConventions = useAppSelector(
    (state) => state.session.settings.hGroupConventions,
  );

  return (
    <>
      <h2>Settings</h2>

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
          <CheckboxRow icon="fa-adjust" setting="darkMode">
            Dark mode
          </CheckboxRow>
          <CheckboxRow icon="fa-users" setting="keldonMode">
            Keldon mode (hands spread around the table)
          </CheckboxRow>
          <CheckboxRow icon="fa-flask" setting="newUi">
            New UI (redesigned game screen, in testing)
          </CheckboxRow>
          <CheckboxRow icon="fa-eye" setting="colorblindMode">
            Colorblind mode
          </CheckboxRow>
          <CheckboxRow icon="fa-hand-paper" setting="realLifeMode">
            Real-life mode (no extra UI elements)
          </CheckboxRow>
          <CheckboxRow icon="fa-exchange-alt" setting="reverseHands">
            Reverse hand direction (new cards go on the right)
          </CheckboxRow>
          <CheckboxRow icon="fa-paint-brush" setting="styleNumbers">
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
          {hGroupConventions && <HGroupLevelRow />}
          <CheckboxRow icon="fa-forward" setting="preplay">
            Enable pre-playing cards
          </CheckboxRow>
          <CheckboxRow icon="fa-running" setting="speedrunFeatures">
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
      <select
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
      </select>
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
      <RowLabel htmlFor="settings-volume-slider" icon="fa-volume-up">
        Volume
      </RowLabel>
      {status}
      <span className="tw:flex tw:shrink-0 tw:items-center tw:gap-4">
        <input
          className="tw:h-[0.25em] tw:w-[10em] tw:rounded-[3px] tw:border-none tw:bg-(--slider-track) tw:narrow-640:flex-1"
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

function HGroupLevelRow() {
  const hGroupLevel = useAppSelector(
    (state) => state.session.settings.hGroupLevel,
  );
  const [status, showSaved] = useSavedStatus();

  return (
    <li className="lobby-row">
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
      <select
        id="hGroupLevel"
        onChange={(event) => {
          const level = parseIntSafe(event.target.value);
          if (level === undefined) {
            // A level that we did not choose is absent from our settings.
            const { hGroupLevel: _cleared, ...settings } = globals.settings;
            globals.settings = settings;
            globals.conn!.send("settings", {
              settings: {},
              cleared: ["hGroupLevel"],
            });
          } else {
            changeSetting({ hGroupLevel: level });
          }
          showSaved();
        }}
        value={hGroupLevel ?? ""}
      >
        <option value="">Not set</option>
        {[...iRange(1, MAX_H_GROUP_LEVEL)].map((level) => (
          <option key={level} value={level}>
            Level {level}
          </option>
        ))}
      </select>
    </li>
  );
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
  globals.settings = { ...globals.settings, ...changed };
  globals.conn!.send("settings", { settings: changed });
}

/**
 * Returns the "Saved" status of a row, which goes before its control, and a function that shows it.
 * The status takes no room until the first save.
 */
function useSavedStatus(): [React.ReactNode, () => void] {
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
            : "tw:invisible tw:opacity-0 tw:transition-[opacity,visibility] tw:duration-[0.4s] tw:ease-[ease]",
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
