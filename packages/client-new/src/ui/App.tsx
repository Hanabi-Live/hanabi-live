import { options } from "@hanabi-live/game";
import {
  ArrowRight,
  BookOpen,
  History,
  LogOut,
  MessageCircle,
  Moon,
  Play,
  Settings2,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { z } from "zod";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import { ChatPanel } from "./ChatPanel";
import { GameDialog } from "./GameDialog";
import { HistoryPanel } from "./HistoryPanel";
import { Modal } from "./Modal";
import { PeoplePanel } from "./PeoplePanel";
import { PregamePanel } from "./PregamePanel";
import { ReplayPanel } from "./ReplayPanel";
import { RichText } from "./RichText";
import { SettingsPanel } from "./SettingsPanel";
import { TablesPanel } from "./TablesPanel";

const suggestedOptions = options
  .unwrap()
  .extend({ numPlayers: z.number().int().min(0).max(6) });
const navigation = [
  ["/", "Play", Play],
  ["/history", "History", History],
  ["/replays", "Replays", Play],
  ["/settings", "Settings", Settings2],
  ["/resources", "Learn & connect", BookOpen],
] as const;
const resources = [
  [
    "Learn the rules",
    "Everything you need for your first good game.",
    "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/rules.md",
  ],
  [
    "Beginner's guide",
    "Build confidence, one clue at a time.",
    "https://hanabi.github.io/beginner",
  ],
  [
    "Community conventions",
    "Discover the language behind the clues.",
    "https://hanabi.github.io/",
  ],
  [
    "Variant reference",
    "A different puzzle for every kind of team.",
    "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/variants.md",
  ],
  [
    "Card and pip reference",
    "Learn how the different suits look and behave.",
    "/public/standalone/pips-reference.html",
  ],
  [
    "Characters",
    "Meet your next interesting restriction.",
    "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/characters.md",
  ],
  [
    "Join the Discord",
    "Find teammates, ask questions, and share a great solve.",
    "https://discord.gg/FADvkJp",
  ],
  [
    "Hanabi wiki",
    "Community knowledge for curious players.",
    "https://hanabi.wiki/",
  ],
  [
    "Features & shortcuts",
    "Get more out of your time at the table.",
    "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md",
  ],
  [
    "Watch a tutorial",
    "See a game explained from the first clue.",
    "https://www.youtube.com/watch?v=VrFCekQb4nY",
  ],
  [
    "Speedrun community",
    "A little faster, together.",
    "https://www.speedrun.com/hanabi",
  ],
  [
    "Contribute & report a bug",
    "Help make this a better place to play.",
    "https://github.com/Hanabi-Live/hanabi-live",
  ],
] as const;

function classic() {
  sessionStorage.removeItem("hanabi-lobby");
}

function lightPreference(): boolean {
  try {
    return localStorage.getItem("hanabi-new-theme") === "light";
  } catch (error) {
    console.warn("Unable to read theme preference", error);
    return false;
  }
}

export function App({ connection }: { connection: LobbyConnection }) {
  const state = useSelector(
    (value: LobbyState) => ({
      welcome: value.welcome,
      connection: value.connection,
      notice: value.notice,
      tables: value.tables,
      users: value.users,
      pregame: value.pregame,
      tableID: value.tableID,
      roomNavigation: value.roomNavigation,
      directoryReady: value.directoryReady,
      pending: value.pending,
      unreadPMs: value.unreadPMs,
    }),
    shallowEqual,
  );
  const navigate = useNavigate();
  const { pathname }: { pathname: string } = useLocation();
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [passwordTable, setPasswordTable] = useState<Table | null>(null);
  const [tablePassword, setTablePassword] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [mobilePanel, setMobilePanel] = useState<"main" | "people" | "chat">(
    "main",
  );
  const [light, setLight] = useState(lightPreference);
  const [wide, setWide] = useState(globalThis.innerWidth > 1200);
  useEffect(() => {
    function resize() {
      setWide(globalThis.innerWidth > 1200);
    }
    globalThis.addEventListener("resize", resize);
    return () => globalThis.removeEventListener("resize", resize);
  }, []);
  const previousTable = useRef<number | null>(null);
  const previousNavigation = useRef(0);
  const handledInvitation = useRef("");
  const online = state.connection === "online";
  useEffect(() => {
    setPassword("");
    setNewPassword("");
    setDialog(null);
    setPasswordTable(null);
    setTablePassword("");
    setRecipient("");
  }, [state.welcome?.userID]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey
        || event.shiftKey
        || event.metaKey
        || dialog
        || passwordTable
        || !online
      ) {
        return;
      }
      if (
        event.target instanceof HTMLElement
        && (event.target.matches("input,textarea,select")
          || event.target.isContentEditable)
        && !event.altKey
      ) {
        return;
      }
      if (event.code === "Escape" || (event.altKey && event.code === "KeyR")) {
        event.preventDefault();
        if (state.tableID !== null && pathname.startsWith("/table/")) {
          connection.send("tableUnattend", { tableID: state.tableID });
        } else {
          void navigate("/");
        }
      } else if (event.altKey) {
        const table = state.pregame;
        switch (event.code) {
          case "KeyN": {
            if (!table && state.welcome?.maintenanceMode === false) {
              setDialog("create");
            }
            break;
          }

          case "KeyH": {
            void navigate("/history");
            break;
          }

          case "KeyA": {
            void navigate("/replays");
            break;
          }

          case "KeyO": {
            void connection.logout();
            break;
          }

          case "KeyC": {
            if (table) {
              setDialog("edit");
            }
            break;
          }

          case "KeyL": {
            if (table) {
              connection.send(
                table.players.some((player) => player.you)
                  ? "tableLeave"
                  : "tableUnattend",
                { tableID: table.tableID },
              );
            }
            break;
          }

          case "KeyS": {
            if (
              table
              && table.owner === state.welcome?.userID
              && table.players.length >= 2
            ) {
              connection.send("tableStart", {
                tableID: table.tableID,
                intendedPlayers: table.players.map((player) => player.name),
              });
            }
            break;
          }

          case "KeyJ": {
            const open = Object.values(state.tables).find(
              (value) =>
                !value.running
                && !value.sharedReplay
                && value.numPlayers < value.maxPlayers,
            );
            if (open) {
              if (open.passwordProtected) {
                setPasswordTable(open);
                setTablePassword("");
              } else {
                connection.send("tableJoin", { tableID: open.id });
              }
            }
            break;
          }

          default: {
            return;
          }
        }
        event.preventDefault();
      }
    }
    globalThis.addEventListener("keydown", keyDown);
    return () => globalThis.removeEventListener("keydown", keyDown);
  }, [
    online,
    dialog,
    passwordTable,
    state.tableID,
    state.tables,
    state.pregame,
    state.welcome,
    pathname,
    connection,
    navigate,
  ]);

  useEffect(() => {
    if (
      previousTable.current === state.tableID
      && previousNavigation.current === state.roomNavigation
    ) {
      return;
    }
    previousTable.current = state.tableID;
    previousNavigation.current = state.roomNavigation;
    if (state.tableID !== null) {
      if (pathname !== `/table/${state.tableID}`) {
        void navigate(`/table/${state.tableID}`);
      }
    } else if (pathname.startsWith("/table/") && state.directoryReady) {
      void navigate("/");
    }
  }, [
    state.tableID,
    state.roomNavigation,
    state.directoryReady,
    pathname,
    navigate,
  ]);

  useEffect(() => {
    if (!online || state.tableID !== null) {
      return;
    }
    const match = /^\/table\/(\d+)$/u.exec(pathname);
    if (!match?.[1] || handledInvitation.current === match[1]) {
      return;
    }
    const table = state.tables[Number(match[1])];
    if (!table) {
      return;
    }
    handledInvitation.current = match[1];
    if (table.joined) {
      connection.attend(table.id);
    } else if (table.running || table.sharedReplay) {
      connection.send("tableSpectate", {
        tableID: table.id,
        shadowingPlayerIndex: -1,
      });
    } else if (table.passwordProtected) {
      setPasswordTable(table);
      setTablePassword("");
    } else {
      connection.send("tableJoin", { tableID: table.id });
    }
  }, [online, state.tableID, state.tables, pathname, connection]);

  useEffect(() => {
    setMobilePanel("main");
    const titles: Record<string, string> = {
      "/": "Play",
      "/history": "History",
      "/replays": "Replays",
      "/settings": "Settings",
      "/resources": "Learn & connect",
    };
    document.title = `${titles[pathname] ?? "Your table"} | Hanab Live`;
  }, [pathname]);

  useEffect(() => {
    let activeAt = Date.now();
    let inactive = false;
    function activity() {
      activeAt = Date.now();
    }
    const timer = setInterval(() => {
      const next = document.hidden || Date.now() - activeAt > 60_000;
      if (online && next !== inactive) {
        inactive = next;
        connection.send("inactive", { inactive });
      }
    }, 10_000);
    globalThis.addEventListener("pointerdown", activity);
    globalThis.addEventListener("keydown", activity);
    return () => {
      clearInterval(timer);
      globalThis.removeEventListener("pointerdown", activity);
      globalThis.removeEventListener("keydown", activity);
    };
  }, [online, connection]);

  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
    try {
      localStorage.setItem("hanabi-new-theme", light ? "light" : "dark");
    } catch (error) {
      console.warn("Unable to save theme preference", error);
    }
  }, [light]);

  function signIn(event: SubmitEvent) {
    event.preventDefault();
    connection.dismiss();
    void connection.login(
      username,
      password,
      changingPassword ? newPassword : "",
    );
  }

  function join(table: Table) {
    if (table.passwordProtected) {
      setTablePassword("");
      setPasswordTable(table);
    } else {
      connection.send("tableJoin", { tableID: table.id });
    }
  }

  function message(name: string) {
    setRecipient(name);
    setMobilePanel("chat");
  }

  function acceptOptions(raw: string) {
    if (!state.pregame || state.pregame.owner !== state.welcome?.userID) {
      connection.notice("Only the table host can accept suggested options.");
      return;
    }
    try {
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = JSON.parse(raw.replaceAll("'", '"'));
      }
      const parsed = suggestedOptions.parse(value);
      connection.send("tableUpdate", {
        tableID: state.pregame.tableID,
        name: parsed.tableName ?? state.pregame.name,
        maxPlayers: parsed.maxPlayers ?? state.pregame.maxPlayers,
        options: parsed,
      });
    } catch {
      connection.notice("The suggested options are invalid.");
    }
  }

  if (!state.welcome) {
    return (
      <main className="signin-shell">
        <section className="signin-story">
          <div className="brand">
            <Sparkles /> hanab<span>live</span>
          </div>
          <span className="eyebrow">A LITTLE TRUST. A LITTLE MAGIC.</span>
          <h1>
            Better
            <br />
            together.
          </h1>
          <p>
            You can see everyone's cards except your own.
            <br />
            Find your people. Build something brilliant.
          </p>
          <div aria-hidden="true" className="card-fan">
            {["red", "yellow", "green", "blue", "purple"].map((color, i) => (
              <div className={`hanabi-card ${color}`} key={color}>
                <Sparkles />
                <b>{i + 1}</b>
              </div>
            ))}
          </div>
          <a href="https://hanabi.github.io/" rel="noreferrer" target="_blank">
            New to Hanabi? Learn to play <ArrowRight size={16} />
          </a>
        </section>
        <section className="signin-panel">
          <span className="eyebrow">WELCOME TO THE TABLE</span>
          <h2>{changingPassword ? "A fresh password." : "Let's play."}</h2>
          <p>Sign in, or choose a new username to create your account.</p>
          <form onSubmit={signIn}>
            <label>
              Username
              <input
                autoComplete="username"
                maxLength={15}
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </label>
            <label>
              {changingPassword ? "Current password" : "Password"}
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {changingPassword && (
              <label>
                New password
                <input
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
            )}
            {state.notice && (
              <div className="notice" role="alert">
                <RichText html={state.notice.text} />
              </div>
            )}
            <button
              className="primary"
              disabled={
                state.connection === "connecting"
                || state.connection === "checking"
              }
            >
              {state.connection === "connecting"
                ? "Signing in..."
                : changingPassword
                  ? "Sign in & change password"
                  : "Take a seat"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="signin-links">
            <button
              className="text-button"
              onClick={() => setChangingPassword(!changingPassword)}
            >
              {changingPassword ? "Back to sign in" : "Change password"}
            </button>
            <a href="/password-reset">Forgot password?</a>
          </div>
          <button className="text-button" onClick={() => connection.retryNow()}>
            Retry saved session
          </button>
          <a href="/lobby" onClick={classic}>
            Use the classic lobby
          </a>
        </section>
      </main>
    );
  }
  return (
    <div className={`app-shell panel-${mobilePanel}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside aria-label="Navigation" className="sidebar">
        <Link className="brand" to="/">
          <Sparkles /> hanab<span>live</span>
        </Link>
        <span className="eyebrow">YOUR NEXT GOOD GAME</span>
        <nav aria-label="Main navigation">
          {navigation.map(([to, label, Icon]) => (
            <NavLink
              className={({ isActive }) => (isActive ? "nav-active" : "")}
              end={to === "/"}
              key={to}
              to={to}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <a className="classic-link" href="/lobby" onClick={classic}>
          Back to classic lobby <ArrowRight size={13} />
        </a>
        <div className="sidebar-bottom">
          <span className="avatar">{state.welcome.username.slice(0, 1)}</span>
          <strong>{state.welcome.username}</strong>
          <button
            aria-label="Sign out"
            className="icon-button"
            onClick={() => {
              void connection.logout();
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main-panel" id="main-content">
        <header className="top-bar">
          <span>
            <span className={`status-dot ${online ? "online" : ""}`} />
            <span role="status">
              {online
                ? "Connected"
                : state.connection === "stopped"
                  ? "Disconnected"
                  : "Reconnecting..."}
            </span>
            {!online && (
              <button
                className="text-button"
                onClick={() => connection.retryNow()}
              >
                Retry
              </button>
            )}
          </span>
          <div className="top-bar-actions">
            <span>{Object.keys(state.users).length} online</span>
            <button
              aria-label={
                light ? "Switch to dark theme" : "Switch to light theme"
              }
              className="icon-button"
              onClick={() => setLight(!light)}
            >
              {light ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>
        {state.welcome.maintenanceMode && (
          <div className="notice" role="status">
            The server is in maintenance mode. New games are temporarily
            unavailable.
          </div>
        )}
        {state.welcome.shuttingDown && (
          <div className="notice" role="status">
            The server is preparing for maintenance. Finish your current game;
            new games may be unavailable.
          </div>
        )}
        {state.notice && (
          <div className="notice global-notice" role="alert">
            <RichText html={state.notice.text} />
            <button
              aria-label="Dismiss notice"
              className="icon-button"
              onClick={() => connection.dismiss()}
            >
              <X size={16} />
            </button>
            {state.notice.fatal && (
              <button onClick={() => connection.retryNow()}>Reconnect</button>
            )}
          </div>
        )}
        <Routes>
          <Route
            element={
              <TablesPanel
                connection={connection}
                create={() => setDialog("create")}
                join={join}
              />
            }
            index
          />
          <Route
            element={
              <PregamePanel
                connection={connection}
                edit={() => setDialog("edit")}
                join={join}
              />
            }
            path="table/:id"
          />
          <Route
            element={<HistoryPanel connection={connection} />}
            path="history"
          />
          <Route
            element={
              <ReplayPanel
                connection={connection}
                disabled={!online || state.pending !== null}
              />
            }
            path="replays"
          />
          <Route
            element={<SettingsPanel connection={connection} />}
            path="settings"
          />
          <Route
            element={
              <section>
                <div className="page-heading">
                  <div>
                    <span className="eyebrow">
                      THERE'S ALWAYS MORE TO DISCOVER
                    </span>
                    <h1>Grow your game.</h1>
                    <p>
                      A welcoming community, a clever convention, a new favorite
                      variant.
                    </p>
                  </div>
                </div>
                <div className="resource-grid">
                  {resources.map(([title, description, href]) => (
                    <a
                      className="panel resource"
                      href={href}
                      key={title}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <BookOpen size={22} />
                      <h2>{title}</h2>
                      <p>{description}</p>
                      <ArrowRight size={16} />
                    </a>
                  ))}
                </div>
              </section>
            }
            path="resources"
          />
          <Route
            element={
              <div className="empty">
                <h1>This seat doesn't exist.</h1>
                <Link to="/">Return to the lobby</Link>
              </div>
            }
            path="*"
          />
        </Routes>
      </main>
      <aside aria-label="Community" className="community-panel">
        <PeoplePanel connection={connection} message={message} />
        <ChatPanel
          connection={connection}
          key={state.welcome.userID}
          onOptions={acceptOptions}
          onRecipient={setRecipient}
          recipient={recipient}
          visible={wide || mobilePanel === "chat"}
        />
      </aside>
      <nav aria-label="Mobile panels" className="mobile-tabs">
        <button
          aria-pressed={mobilePanel === "main"}
          onClick={() => setMobilePanel("main")}
        >
          <Play size={18} />
          Tables
        </button>
        <button
          aria-pressed={mobilePanel === "people"}
          onClick={() => setMobilePanel("people")}
        >
          <Users size={18} />
          People
        </button>
        <button
          aria-pressed={mobilePanel === "chat"}
          onClick={() => setMobilePanel("chat")}
        >
          <MessageCircle size={18} />
          Chat{" "}
          {Object.values(state.unreadPMs).reduce((sum, count) => sum + count, 0)
            > 0 && (
            <span className="unread-badge">
              {Object.values(state.unreadPMs).reduce(
                (sum, count) => sum + count,
                0,
              )}
            </span>
          )}
        </button>
        <Link onClick={() => setMobilePanel("main")} to="/settings">
          <Settings2 size={18} />
          Settings
        </Link>
      </nav>
      {dialog && (
        <GameDialog
          connection={connection}
          welcome={state.welcome}
          {...(dialog === "edit" && state.pregame
            ? { game: state.pregame }
            : {})}
          close={() => setDialog(null)}
        />
      )}
      {passwordTable && (
        <Modal
          close={() => setPasswordTable(null)}
          description={`Enter the password for ${passwordTable.name}.`}
          title="A seat at a private table"
        >
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                connection.send("tableJoin", {
                  tableID: passwordTable.id,
                  password: tablePassword,
                })
              ) {
                setPasswordTable(null);
              }
            }}
          >
            <label>
              Table password
              <input
                autoComplete="off"
                onChange={(event) => setTablePassword(event.target.value)}
                required
                type="password"
                value={tablePassword}
              />
            </label>
            <button className="primary" disabled={!online}>
              Join table <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
