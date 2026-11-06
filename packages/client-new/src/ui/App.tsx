import { errorDetails, validationErrorDetails } from "@hanabi-live/data";
import { options } from "@hanabi-live/game";
import { ArrowRight, X } from "lucide-react";
import type { SubmitEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { z } from "zod";
import type { LobbyConnection } from "../connection";
import type { Table } from "../protocol";
import type { LobbyState } from "../store";
import type { ChatChannel } from "./ChatPanel";
import { ChatPanel } from "./ChatPanel";
import { ClassicHeader } from "./ClassicHeader";
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
const resources = [
  [
    "The Hanab Live Manual & List of Features",
    "Get answers to the most common questions.",
    "https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md",
  ],
  [
    "The Rules / How to Play",
    "This website does not have a tutorial on how to play, so watch this video instead.",
    "https://www.youtube.com/watch?v=VrFCekQb4nY",
  ],
  [
    "The H-Group Discord Server",
    "A place to find teammates and discuss strategy.",
    "https://discord.gg/FADvkJp",
  ],
  [
    "Strategies and Conventions",
    "This is a document that lists the strategies and conventions used by the H-Group.\n(You don't have to use them if you don't want to.)",
    "https://hanabi.github.io/",
  ],
  [
    "Hanabi Central Wiki",
    "This wiki contains even more convention systems.",
    "https://hanabi.wiki/",
  ],
  [
    "The Code Repository",
    "This client and server are open-source, hosted on GitHub.",
    "https://github.com/Hanabi-Live/hanabi-live",
  ],
  [
    "File a Bug Report",
    "Report bugs by opening a new issue on GitHub.\n(You will need to create a free GitHub account.)\nMake sure that someone else has not already opened the same issue.",
    "https://github.com/Hanabi-Live/hanabi-live/issues",
  ],
  [
    "Speedrun.com Leaderboards",
    "The fastest times in the world are tracked here.",
    "https://www.speedrun.com/hanabi",
  ],
  [
    "Make the World a Better Place",
    "Hanab Live is hosted free of charge and does not have any advertisements.\nIf you enjoy the website and want to help out, consider donating to effective charities recommended by GiveWell.",
    "https://www.givewell.org/charities/top-charities",
  ],
] as const;
const additionalResources = [
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
] as const;

function resourceLinks(
  items: ReadonlyArray<readonly [string, string, string]>,
) {
  return (
    <ul className="resource-grid">
      {items.map(([title, description, href]) => (
        <li key={title}>
          <a href={href} rel="noreferrer" target="_blank">
            {title}
          </a>
          <span className="resource-description">{description}</span>
        </li>
      ))}
    </ul>
  );
}

function themePreference(): "light" | "dark" | "system" {
  try {
    const stored = localStorage.getItem("darkMode");
    if (stored === "system") {
      return "system";
    }
    return (
      stored === null
        ? localStorage.getItem("hanabi-new-theme") === "dark"
        : stored === "true"
    )
      ? "dark"
      : "light";
  } catch (error) {
    console.warn("Unable to read theme preference", error);
    return "light";
  }
}

export function App({ connection }: { connection: LobbyConnection }) {
  const state = useSelector(
    (value: LobbyState) => ({
      welcome: value.welcome,
      connection: value.connection,
      notice: value.notice,
      lobbyError: value.lobbyError,
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
  const [channel, setChannel] = useState<ChatChannel>("lobby");
  const [mobilePanel, setMobilePanel] = useState<
    "main" | "people" | "chat" | "game-chat"
  >("main");
  const [theme, setTheme] = useState(themePreference);
  const [systemDark, setSystemDark] = useState(false);
  const light = theme === "light" || (theme === "system" && !systemDark);
  useEffect(() => {
    if (typeof globalThis.matchMedia !== "function") {
      return undefined;
    }
    const preference = globalThis.matchMedia("(prefers-color-scheme: dark)");
    function update() {
      setSystemDark(preference.matches);
    }
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  const [wide, setWide] = useState(
    globalThis.innerWidth > 620 && globalThis.innerHeight > 530,
  );
  useEffect(() => {
    function resize() {
      setWide(globalThis.innerWidth > 620 && globalThis.innerHeight > 530);
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
    setChannel("lobby");
  }, [state.welcome?.userID]);

  useEffect(() => {
    function keyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented
        || document.querySelector('[role="dialog"]') !== null
        || event.ctrlKey
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
            if (table && state.pending === null) {
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
    state.pending,
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
    if (!online) {
      return;
    }
    if (state.tableID !== null) {
      handledInvitation.current = String(state.tableID);
      return;
    }
    const match = /^\/table\/(\d+)$/u.exec(pathname);
    if (!match?.[1]) {
      handledInvitation.current = "";
      return;
    }
    if (handledInvitation.current === match[1]) {
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
    setChannel("private");
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
    } catch (error) {
      connection.notice(
        error instanceof z.ZodError
          ? `Cannot accept suggested options: ${validationErrorDetails(error)}`
          : errorDetails(error, "Parsing suggested options"),
      );
    }
  }

  if (!state.welcome) {
    return (
      <div className="client-new-classic" id="page-wrapper">
        <ClassicHeader
          connection={connection}
          create={() => setDialog("create")}
          edit={() => setDialog("edit")}
          join={join}
        />
        <main className="container signin-shell" id="main-login">
          <header className="login-header">
            <h2 className="align-center-v">
              <img
                alt="Hanab Live"
                className="login-logo"
                src="/public/img/logos/header.svg"
              />
            </h2>
            <p id="title-sub">
              A place to play <strong>Hanab</strong> online,
              <br />a cooperative card game of logic and reasoning
            </p>
          </header>
          <div className="row">
            <div className="col-8 off-2 login-box">
              <section className="signin-panel box align-center">
                <h3>
                  {changingPassword
                    ? "Change Password"
                    : "Sign In / Create Account"}
                </h3>
                <p>
                  To create a new account, simply login with a new username and
                  select a password.
                  <br />
                  Do <strong>NOT</strong> reuse any of your{" "}
                  <a
                    href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/passwords.md"
                    rel="noreferrer"
                    target="_blank"
                  >
                    previous passwords
                  </a>
                  !
                </p>
                <form onSubmit={signIn}>
                  <label className="login-field">
                    <i
                      aria-hidden="true"
                      className="fas fa-user fa-2x login-icon"
                    />
                    <span className="sr-only">Username</span>
                    <input
                      autoComplete="username"
                      autoFocus
                      maxLength={15}
                      onChange={(event) => setUsername(event.target.value)}
                      placeholder="Username"
                      required
                      type="text"
                      value={username}
                    />
                  </label>
                  <label className="login-field">
                    <i
                      aria-hidden="true"
                      className="fas fa-key fa-2x login-icon"
                    />
                    <span className="sr-only">
                      {changingPassword ? "Current password" : "Password"}
                    </span>
                    <input
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={
                        changingPassword ? "Current password" : "Password"
                      }
                      required
                      type="password"
                      value={password}
                    />
                  </label>
                  {changingPassword && (
                    <label className="login-field">
                      <i
                        aria-hidden="true"
                        className="fas fa-sync fa-2x login-icon"
                      />
                      <span className="sr-only">New password</span>
                      <input
                        autoComplete="new-password"
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="New Password"
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
                    className="button login-submit"
                    disabled={
                      state.connection === "connecting"
                      || state.connection === "checking"
                    }
                  >
                    <i aria-hidden="true" className="fas fa-sign-in-alt" />{" "}
                    {state.connection === "connecting"
                      ? "Signing in..."
                      : changingPassword
                        ? "Sign in & change password"
                        : "Sign In"}
                  </button>
                </form>
                <div className="signin-links">
                  <button
                    className="text-button"
                    onClick={() => setChangingPassword(!changingPassword)}
                  >
                    {changingPassword ? "Back to sign in" : "Change password"}
                  </button>
                  <span aria-hidden="true"> | </span>
                  <a href="/password-reset">Forgot password?</a>
                </div>
                {state.notice && (
                  <button
                    className="text-button"
                    onClick={() => connection.retryNow()}
                  >
                    Retry saved session
                  </button>
                )}
              </section>
            </div>
          </div>
          <div className="row">
            <div className="col-8 off-2 login-text">
              <p>
                This site has no affiliation with the card game Hanabi, no
                affiliation with Antoine Bauza (the creator of Hanabi), and no
                affiliation with any of the real-life publishers of Hanabi (of
                which there are many).
              </p>
              <p>
                This website is free of charge, has no advertisements, and is
                not monetized in any way. Since this website is inspired by
                Hanabi, we urge you to purchase a physical copy of that game if
                you enjoy playing the variants of it online.
              </p>
              <p>
                Discord is a voice and text chat application that you can run in
                a browser.
                <br />
                If the server is down, you can probably find out why in{" "}
                <a
                  href="https://discord.gg/FADvkJp"
                  rel="noreferrer"
                  target="_blank"
                >
                  the Discord server
                </a>
                .
              </p>
              <a
                href="https://discord.gg/FADvkJp"
                rel="noreferrer"
                target="_blank"
              >
                <img
                  alt="Discord community"
                  id="title-discord"
                  src="/public/img/discord.png"
                />
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }
  const pregameOpen = pathname.startsWith("/table/") && state.pregame !== null;
  return (
    <div className="client-new-classic" id="page-wrapper">
      <ClassicHeader
        connection={connection}
        create={() => setDialog("create")}
        edit={() => setDialog("edit")}
        join={join}
      />
      <div
        className={`container max app-shell panel-${mobilePanel} ${pregameOpen ? "in-pregame" : ""} ${pathname === "/history" ? "classic-full-page" : ""}`}
        id="lobby"
      >
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="row lobby-half toggle-active" id="lobby-top-half">
          <div className="col-12">
            <section
              className="box main-panel"
              id={pregameOpen ? "lobby-pregame" : "lobby-games"}
            >
              <main id="main-content">
                <div
                  className={online ? "sr-only" : "notice connection-status"}
                >
                  <span aria-label="Connection status" role="status">
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
                </div>
                {state.welcome.maintenanceMode && (
                  <div className="notice" role="status">
                    The server is in maintenance mode. New games are temporarily
                    unavailable.
                  </div>
                )}
                {state.welcome.shuttingDown && (
                  <div className="notice" role="status">
                    The server is preparing for maintenance. Finish your current
                    game; new games may be unavailable.
                  </div>
                )}
                {state.lobbyError && (
                  <div className="notice" role="alert">
                    {state.lobbyError}
                    <button
                      onClick={() => connection.send("lobbyLoad", {})}
                      type="button"
                    >
                      Retry statistics
                    </button>
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
                      <button onClick={() => connection.retryNow()}>
                        Reconnect
                      </button>
                    )}
                  </div>
                )}
                {["/replays", "/resources", "/settings"].includes(pathname) && (
                  <TablesPanel
                    connection={connection}
                    create={() => setDialog("create")}
                    join={join}
                  />
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
                    element={<PregamePanel connection={connection} />}
                    path="table/:id"
                  />
                  <Route
                    element={<HistoryPanel connection={connection} />}
                    path="history"
                  />
                  <Route
                    element={
                      <Modal
                        close={() => {
                          void navigate("/");
                        }}
                        description="Open an existing game or import a replay."
                        title="Watch a Replay"
                      >
                        <ReplayPanel
                          connection={connection}
                          disabled={!online || state.pending !== null}
                        />
                      </Modal>
                    }
                    path="replays"
                  />
                  <Route
                    element={
                      <Modal
                        close={() => {
                          void navigate("/");
                        }}
                        description="Account and game preferences."
                        id="settings-modal"
                        title="Settings"
                      >
                        <SettingsPanel
                          connection={connection}
                          onTheme={(value) => {
                            setTheme(value);
                            try {
                              localStorage.setItem(
                                "darkMode",
                                value === "system"
                                  ? "system"
                                  : String(value === "dark"),
                              );
                            } catch (error) {
                              console.warn(
                                "Unable to save theme preference",
                                error,
                              );
                            }
                          }}
                          theme={theme}
                        />
                      </Modal>
                    }
                    path="settings"
                  />
                  <Route
                    element={
                      <Modal
                        close={() => {
                          void navigate("/");
                        }}
                        description="Rules, references, and community links."
                        title="Resources"
                      >
                        {resourceLinks(resources)}
                        <details>
                          <summary>Additional references</summary>
                          {resourceLinks(additionalResources)}
                        </details>
                      </Modal>
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
            </section>
          </div>
        </div>
        <div className="row" id="lobby-separator" />
        <div
          aria-label="Community"
          className="row lobby-half community-panel"
          id="lobby-bottom-half"
        >
          <div
            className={pregameOpen ? "col-4" : "col-8"}
            id="lobby-chat-container"
          >
            <ChatPanel
              channel={channel === "private" ? "private" : "lobby"}
              connection={connection}
              key={state.welcome.userID}
              onChannel={setChannel}
              onOptions={acceptOptions}
              onRecipient={message}
              recipient={recipient}
              visible={
                pathname !== "/history" && (wide || mobilePanel === "chat")
              }
            />
          </div>
          <div
            className={`col-4 ${pregameOpen ? "" : "hidden"}`}
            hidden={!pregameOpen}
            id="lobby-chat-pregame-container"
          >
            <ChatPanel
              channel="table"
              connection={connection}
              onChannel={setChannel}
              onOptions={acceptOptions}
              onRecipient={message}
              recipient={recipient}
              visible={pregameOpen && (wide || mobilePanel === "game-chat")}
            />
          </div>
          <div
            className="col-4 lobby-users-box-container"
            id="lobby-online-users"
          >
            <PeoplePanel connection={connection} message={message} />
          </div>
        </div>
        <nav aria-label="Mobile panels" className="mobile-tabs">
          <button
            aria-pressed={mobilePanel === "main"}
            onClick={() => setMobilePanel("main")}
          >
            Tables
          </button>
          <button
            aria-pressed={mobilePanel === "people"}
            onClick={() => setMobilePanel("people")}
          >
            Who's Online
          </button>
          <button
            aria-pressed={mobilePanel === "chat"}
            onClick={() => setMobilePanel("chat")}
          >
            Chat{" "}
            {Object.values(state.unreadPMs).reduce(
              (sum, count) => sum + count,
              0,
            ) > 0 && (
              <span className="unread-badge">
                {Object.values(state.unreadPMs).reduce(
                  (sum, count) => sum + count,
                  0,
                )}
              </span>
            )}
          </button>
          {pregameOpen && (
            <button
              aria-pressed={mobilePanel === "game-chat"}
              onClick={() => setMobilePanel("game-chat")}
            >
              Game Chat
            </button>
          )}
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
    </div>
  );
}
