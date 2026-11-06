import type { Settings } from "@hanabi-live/data";
import { errorDetails } from "@hanabi-live/data";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";

const toggles = [
  [
    "desktopNotification",
    "Desktop notifications",
    "Show a desktop notification when it reaches your turn",
  ],
  [
    "soundTimer",
    "Timer sounds",
    "Play a sound when a timer is below 10 seconds",
  ],
  ["keldonMode", "Keldon mode", "Keldon mode (hands spread around the table)"],
  ["colorblindMode", "Colorblind-friendly cards", "Colorblind mode"],
  ["realLifeMode", "Real-life mode", "Real-life mode (no extra UI elements)"],
  [
    "reverseHands",
    "Reverse hand order",
    "Reverse hand direction (new cards go on the right)",
  ],
  [
    "styleNumbers",
    "Numbers instead of pips",
    "Make numbers on cards match the art style",
  ],
  [
    "showTimerInUntimed",
    "Show the untimed-game clock",
    "Show turn timers in untimed games",
  ],
  ["speedrunPreplay", "Speedrun preplays", "Enable pre-playing cards"],
  [
    "speedrunMode",
    "Speedrun controls",
    "Enable speedrun features in non-speedrun games",
  ],
  [
    "hyphenatedConventions",
    "Hyphenated conventions",
    "Enable H-Group features",
  ],
] as const satisfies ReadonlyArray<readonly [keyof Settings, string, string]>;

export function SettingsPanel({
  connection,
  theme,
  onTheme,
}: {
  connection: LobbyConnection;
  theme: "light" | "dark" | "system";
  onTheme: (theme: "light" | "dark" | "system") => void;
}) {
  const welcome = useSelector((state: LobbyState) => state.welcome);
  const online = useSelector(
    (state: LobbyState) => state.connection === "online",
  );
  const preferenceStatus = useSelector(
    (state: LobbyState) => state.preferenceStatus,
  );
  const [volume, setVolume] = useState(welcome?.settings.volume ?? 50);
  useEffect(() => {
    setVolume(welcome?.settings.volume ?? 50);
  }, [welcome?.settings.volume]);
  function saveVolume(value: number) {
    if (value !== welcome?.settings.volume) {
      connection.setting("volume", value);
    }
  }
  if (!welcome) {
    return null;
  }
  const { settings } = welcome;
  function toggle([key, title, label]: (typeof toggles)[number]) {
    return (
      <p key={key}>
        <label className="check">
          <input
            aria-label={title}
            checked={settings[key]}
            disabled={!online}
            onChange={(event) => {
              const { checked } = event.target;
              if (key === "desktopNotification" && checked) {
                if (!("Notification" in globalThis)) {
                  connection.notice(
                    "This browser does not support desktop notifications.",
                  );
                  return;
                }
                void Notification.requestPermission()
                  .then((permission) => {
                    if (permission === "granted") {
                      connection.setting(key, true);
                    } else {
                      connection.notice(
                        "Notifications were not enabled. You can change browser permissions and try again.",
                      );
                    }
                  })
                  .catch((error: unknown) =>
                    connection.notice(
                      errorDetails(error, "Requesting notification permission"),
                    ),
                  );
              } else {
                connection.setting(key, checked);
              }
            }}
            type="checkbox"
          />
          <span>{label}</span>
        </label>
      </p>
    );
  }
  return (
    <section className="classic-settings">
      <p
        aria-label="Preference saving status"
        className={
          preferenceStatus === "saved" && online ? "sr-only" : "notice"
        }
        role="status"
      >
        {online
          ? volume === settings.volume
            ? preferenceStatus === "saving"
              ? "Saving preferences..."
              : preferenceStatus === "failed"
                ? "Preferences could not be confirmed."
                : "Preferences saved"
            : "Finish adjusting the slider to save."
          : "Offline. Changes cannot be saved."}
      </p>
      <div className="settings-content">
        <div>
          <h5>Notifications</h5>
          {toggles.filter(([key]) => key === "desktopNotification").map(toggle)}
          <p>
            <select
              aria-label="Game sounds"
              disabled={!online}
              onChange={(event) =>
                connection.setting("soundMove", Number(event.target.value))
              }
              value={settings.soundMove}
            >
              <option value={0}>Play a sound when a move is made</option>
              <option value={1}>Play a sound when it's my turn</option>
              <option value={2}>No Sound</option>
            </select>
          </p>
          {toggles.filter(([key]) => key === "soundTimer").map(toggle)}
        </div>
        <div>
          <h5>Appearance</h5>
          <p>
            <select
              aria-label="Appearance"
              onChange={(event) => {
                const { value } = event.target;
                if (
                  value === "light"
                  || value === "dark"
                  || value === "system"
                ) {
                  onTheme(value);
                } else {
                  connection.notice(
                    "Choose Light, Dark, or System appearance.",
                  );
                }
              }}
              value={theme}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System (follow OS)</option>
            </select>
          </p>
          {toggles.slice(2, 8).map(toggle)}
        </div>
        <div>
          <h5>Expert Features</h5>
          {toggles.slice(8).map(toggle)}
        </div>
        <div>
          <h5>Volume</h5>
          <div className="classic-volume">
            <input
              aria-label="Volume"
              disabled={!online}
              max={100}
              min={0}
              onBlur={(event) => saveVolume(Number(event.currentTarget.value))}
              onChange={(event) => setVolume(Number(event.target.value))}
              onKeyUp={(event) => saveVolume(Number(event.currentTarget.value))}
              onPointerUp={(event) =>
                saveVolume(Number(event.currentTarget.value))
              }
              step={5}
              type="range"
              value={volume}
            />
            <span>{volume}%</span>
            <button
              onClick={() => {
                const audio = new Audio("/public/sounds/us.mp3");
                audio.volume = settings.volume / 100;
                void audio
                  .play()
                  .catch((error: unknown) =>
                    connection.notice(
                      errorDetails(error, "Playing the test sound"),
                    ),
                  );
              }}
              type="button"
            >
              Test
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
