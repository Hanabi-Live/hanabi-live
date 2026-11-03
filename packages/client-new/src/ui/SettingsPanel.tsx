import type { Settings } from "@hanabi-live/data";
import { ArrowUpRight, Volume2 } from "lucide-react";
import { useSelector } from "react-redux";
import type { LobbyConnection } from "../connection";
import type { LobbyState } from "../store";

const toggles = [
  [
    "desktopNotification",
    "Desktop notifications",
    "Get a notification when it is your turn.",
  ],
  ["soundTimer", "Timer sounds", "Hear a warning when time is running low."],
  [
    "colorblindMode",
    "Colorblind-friendly cards",
    "Use additional visual cues for suit colors.",
  ],
  ["styleNumbers", "Numbers instead of pips", "Show numeric ranks on cards."],
  [
    "reverseHands",
    "Reverse hand order",
    "Display hands in the opposite direction.",
  ],
  [
    "realLifeMode",
    "Real-life mode",
    "Hide extra information for a tabletop-like experience.",
  ],
  [
    "showTimerInUntimed",
    "Show the untimed-game clock",
    "Keep track of time even without a timer.",
  ],
  ["keldonMode", "Keldon mode", "Use the alternative game layout."],
  [
    "hyphenatedConventions",
    "Hyphenated conventions",
    "Display your convention preference to other players.",
  ],
  [
    "speedrunPreplay",
    "Speedrun preplays",
    "Enable preplays in speedrun games.",
  ],
  ["speedrunMode", "Speedrun controls", "Use speedrun-friendly game controls."],
] as const satisfies ReadonlyArray<readonly [keyof Settings, string, string]>;

export function SettingsPanel({ connection }: { connection: LobbyConnection }) {
  const welcome = useSelector((state: LobbyState) => state.welcome);
  const online = useSelector(
    (state: LobbyState) => state.connection === "online",
  );
  if (!welcome) {
    return null;
  }
  const { settings } = welcome;
  return (
    <section>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF COMFORTABLE</span>
          <h1>Your kind of table.</h1>
          <p>Preferences follow your account into every game.</p>
        </div>
      </div>
      <fieldset className="panel settings-panel" disabled={!online}>
        <legend>Sound &amp; atmosphere</legend>
        <label>
          Game sounds
          <select
            onChange={(event) =>
              connection.setting("soundMove", Number(event.target.value))
            }
            value={settings.soundMove}
          >
            <option value={0}>All turns</option>
            <option value={1}>Only my turn</option>
            <option value={2}>No turn sounds</option>
          </select>
        </label>
        <label>
          Volume: {settings.volume}%
          <input
            max={100}
            min={0}
            onChange={(event) =>
              connection.setting("volume", Number(event.target.value))
            }
            type="range"
            value={settings.volume}
          />
        </label>
        <button
          onClick={() => {
            const audio = new Audio("/public/sounds/us.mp3");
            audio.volume = settings.volume / 100;
            void audio
              .play()
              .catch(() =>
                connection.notice("The browser could not play the sound."),
              );
          }}
          type="button"
        >
          <Volume2 size={16} /> Test sound
        </button>
      </fieldset>
      <fieldset className="panel settings-panel" disabled={!online}>
        <legend>At the table</legend>
        {toggles.map(([key, title, description]) => (
          <label className="check setting-row" key={key}>
            <span>
              {title}
              <small>{description}</small>
            </span>
            <input
              checked={settings[key]}
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
                    .catch(() =>
                      connection.notice(
                        "Unable to request notification permission.",
                      ),
                    );
                } else {
                  connection.setting(key, checked);
                }
              }}
              type="checkbox"
            />
          </label>
        ))}
      </fieldset>
      <section className="panel account-panel">
        <h2>Your account</h2>
        <p>
          Signed in as <strong>{welcome.username}</strong>.
        </p>
        <div className="actions">
          <a
            className="button-link"
            href={`/scores/${encodeURIComponent(welcome.username)}`}
            rel="noreferrer"
            target="_blank"
          >
            Public profile <ArrowUpRight size={16} />
          </a>
          <button
            onClick={() => {
              void connection.logout();
            }}
          >
            Sign out
          </button>
        </div>
        <p>
          To change your password, sign out and choose "Change password" on the
          sign-in screen.
        </p>
      </section>
    </section>
  );
}
