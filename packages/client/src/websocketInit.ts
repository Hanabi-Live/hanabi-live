// Communication with the server is done through the WebSocket protocol. `Connection` sends the
// requests and passes on the server's messages and replies.

import type { ServerEvent, ServerEventData } from "@hanabi-live/data";
import { VERSION, errorDetails, withTabAccount } from "@hanabi-live/data";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { commands } from "./commands.ts";
import { Connection } from "./Connection.ts";
import { sendErrorReports } from "./errors.ts";
import { gameCommands } from "./game/gameCommands.ts";
import * as gameSession from "./game/gameSession.ts";
import * as gameMain from "./game/main.ts";
import { SoundType } from "./game/types/SoundType.ts";
import { globals } from "./Globals.ts";
import { lobbyCommands } from "./lobby/lobbyCommands.ts";
import { loginFailed, loginStageChanged } from "./lobby/login/loginSlice.ts";
import { returnedTableIdChanged } from "./lobby/pregame/pregameSlice.ts";
import { tablesListed } from "./lobby/tables/tablesSlice.ts";
import { Screen } from "./lobby/types/Screen.ts";
import { usersListed } from "./lobby/users/usersSlice.ts";
import * as modals from "./modals.ts";
import { reloadOutdatedClient } from "./outdatedClient.ts";
import { ReconnectBackoff } from "./reconnect.ts";
import {
  blockedChanged,
  friendsChanged,
  reconnectingChanged,
  settingsChanged,
} from "./sessionSlice.ts";
import * as sounds from "./sounds.ts";
import { store } from "./store.ts";
import * as theme from "./theme.ts";
import { escapeHtml, textToHtml } from "./utils.ts";

const reconnectBackoff = new ReconnectBackoff();
const CONNECT_TIMEOUT_MS = 15 * SECOND_IN_MILLISECONDS;
const WELCOME_TIMEOUT_MS = 15 * SECOND_IN_MILLISECONDS;
/**
 * How many times the page tries to connect before the server first welcomes it. Then it shows an
 * error, from which the player can try again.
 */
const MAX_ATTEMPTS_BEFORE_WELCOME = 3;
let activeConnection: Connection | undefined;
let websocketUrl = "";
let recovering = false;
let stopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let wakeListenersRegistered = false;
let welcomeTimer: ReturnType<typeof setTimeout> | undefined;
let connectTimer: ReturnType<typeof setTimeout> | undefined;
/** Whether the server has welcomed this page, which means that it is past the login screen. */
let welcomed = false;
/** The failed attempts to connect before the server first welcomed the page. */
let failedAttemptsBeforeWelcome = 0;
/**
 * The server stopped for maintenance. The client keeps trying to connect, and reloads the page when
 * the server welcomes it again.
 */
let reloadWhenBack = false;

function clearWelcomeTimer() {
  if (welcomeTimer === undefined) {
    return;
  }

  clearTimeout(welcomeTimer);
  welcomeTimer = undefined;
}

function clearConnectTimer() {
  if (connectTimer === undefined) {
    return;
  }

  clearTimeout(connectTimer);
  connectTimer = undefined;
}

/**
 * The connection dropped, and the client is getting it back. The game screen shows this until the
 * new connection is ready (see `finishReconnecting`), because the server receives nothing that the
 * player sends until then.
 */
function setRecovering(value: boolean) {
  recovering = value;
  // After maintenance, the error modal already covers the page until it reloads.
  if (value && !reloadWhenBack) {
    store.dispatch(reconnectingChanged(true));
  }
}

/** The new connection is ready, so what the player sends reaches the server again. */
function finishReconnecting(conn: Connection) {
  conn.setReady(true);
  store.dispatch(reconnectingChanged(false));
}

function stopRecovery() {
  stopped = true;
  clearConnectTimer();
  recovering = false;
  clearWelcomeTimer();
  if (reconnectTimer === undefined) {
    return;
  }

  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}

function canRetryNow() {
  return navigator.onLine && document.visibilityState !== "hidden";
}

function scheduleReconnect(immediate = false) {
  if (
    !recovering
    || stopped
    || reconnectTimer !== undefined
    || !canRetryNow()
  ) {
    return;
  }
  // Browsers pause timers in background. A foreground/online event will wake us.
  const delay = immediate ? 0 : reconnectBackoff.nextDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    if (recovering && !stopped && canRetryNow()) {
      openConnection(true);
    }
  }, delay);
}

function wakeReconnect() {
  if (!recovering || stopped) {
    return;
  }
  const readyState = activeConnection?.ws.readyState;
  if (readyState === WebSocket.CONNECTING || readyState === WebSocket.OPEN) {
    return;
  }
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  scheduleReconnect(true);
}

function registerReconnectWakeListeners() {
  if (wakeListenersRegistered) {
    return;
  }
  wakeListenersRegistered = true;
  globalThis.addEventListener("online", wakeReconnect);
  document.addEventListener("visibilitychange", wakeReconnect);
  globalThis.addEventListener("pageshow", wakeReconnect);
}

function reconnectAfterTimeout(conn: Connection, timeoutMs: number) {
  if (activeConnection !== conn || stopped) {
    return;
  }

  clearConnectTimer();
  clearWelcomeTimer();
  console.warn(
    `WebSocket handshake exceeded its ${timeoutMs / SECOND_IN_MILLISECONDS}-second deadline; attempting to reconnect.`,
  );
  // Do not depend on a browser emitting close for a stalled CONNECTING socket.
  activeConnection = undefined;
  conn.close();
  retryConnection();
}

/**
 * Tries to connect again after a connection failed, unless the page failed to connect too often.
 */
function retryConnection() {
  if (!welcomed) {
    failedAttemptsBeforeWelcome++;
    if (failedAttemptsBeforeWelcome >= MAX_ATTEMPTS_BEFORE_WELCOME) {
      stopRecovery();
      store.dispatch(
        loginFailed({
          message:
            "Connecting to the server failed. Check your network, and then try again.",
          retry: true,
        }),
      );
      store.dispatch(loginStageChanged("signIn"));
      return;
    }
  }
  setRecovering(true);
  scheduleReconnect();
}

function openConnection(isReconnect: boolean) {
  const url = withTabAccount(
    `${websocketUrl}?version=${encodeURIComponent(VERSION)}`,
  );
  const conn = new Connection(url, true);
  conn.setReady(!isReconnect);
  clearConnectTimer();
  activeConnection = conn;
  if (!isReconnect) {
    globals.conn = conn;
  }

  connectTimer = setTimeout(() => {
    if (conn.ws.readyState === WebSocket.CONNECTING) {
      reconnectAfterTimeout(conn, CONNECT_TIMEOUT_MS);
    }
  }, CONNECT_TIMEOUT_MS);

  conn.on("open", () => {
    if (activeConnection !== conn || stopped) {
      return;
    }
    clearConnectTimer();
    console.log("WebSocket connection established.");
    sendErrorReports(conn);
    // Even an open socket can be stuck before the server sends "welcome".
    clearWelcomeTimer();
    welcomeTimer = setTimeout(() => {
      reconnectAfterTimeout(conn, WELCOME_TIMEOUT_MS);
    }, WELCOME_TIMEOUT_MS);
  });
  conn.on("close", () => {
    if (activeConnection !== conn || stopped) {
      return;
    }
    clearConnectTimer();
    clearWelcomeTimer();
    console.log("WebSocket closed unexpectedly; attempting to reconnect.");
    conn.setReady(false);
    retryConnection();
  });
  conn.on("socketError", (error: unknown) => {
    console.error("WebSocket error:", error);
  });
  conn.invalidMessage = (command, error) => {
    if (activeConnection !== conn || stopped) {
      return;
    }
    modals.showError(
      escapeHtml(
        errorDetails(error, `Processing the server's "${command}" message`),
      ),
    );
  };
  conn.on("serverShutdown", ({ message }) => {
    if (activeConnection !== conn) {
      return;
    }

    conn.setReady(false);
    reconnectBackoff.reset();
    sounds.play(SoundType.Shutdown);
    // An administrator's reason for the downtime stays open through the reconnect.
    if (message !== undefined) {
      modals.showDowntime(textToHtml(message));
    }
  });

  if (isReconnect) {
    initCommands(conn);
    conn.on("welcome", (data) => {
      if (activeConnection !== conn || stopped) {
        return;
      }
      if (reloadWhenBack) {
        stopRecovery();
        globalThis.location.reload();
        return;
      }
      clearWelcomeTimer();
      reconnectBackoff.reset();
      welcomed = true;
      setRecovering(false);
      globals.conn = conn;
      store.dispatch(usersListed(data.users));
      store.dispatch(tablesListed(data.tables));
      if (
        store.getState().session.screen === Screen.Game
        && gameSession.isOpen()
        && data.userId === store.getState().session.userId
      ) {
        globals.muted = data.muted;
        store.dispatch(settingsChanged(data.settings));
        theme.setDarkMode(data.settings.darkMode);
        store.dispatch(friendsChanged(data.friends));
        store.dispatch(blockedChanged(data.blocked));
        const retained = globals.joinedTableId;
        conn.on("tableJoined", (table) => {
          if (!isCurrentConnection(conn)) {
            return;
          }
          if (table.stage === "pregame") {
            lobbyCommands.get("tableJoined")?.(table);
          } else if (
            table.tableId === retained
            && table.stage !== "replay"
            && gameSession.isOpen()
            && store.getState().game.current?.finished === false
          ) {
            resumeGame(conn, retained);
          } else {
            gameMain.closeGame();
            lobbyCommands.get("tableJoined")?.(table);
          }
        });
        conn.on("gameState", (state) => {
          if (!isCurrentConnection(conn) || !gameSession.isOpen()) {
            return;
          }
          // The game can open again while we reconnect, such as for another table. Then this state
          // does not fit it, and the game asks for its own state once the server describes it.
          if (
            state.tableId !== globals.tableId
            || store.getState().game.current === undefined
          ) {
            finishReconnecting(conn);
            initCommands(conn);
            return;
          }
          if (endedAfterDescribed(state)) {
            reopenGame();
            finishReconnecting(conn);
            initCommands(conn);
            return;
          }
          const rebuilding = gameSession.isLoading();
          gameCommands.get("gameState")?.(state);
          finishReconnecting(conn);
          if (!rebuilding) {
            conn.send("gameLoaded", { tableId: globals.joinedTableId });
          }
          initCommands(conn);
        });
        if (data.playingAtTables.includes(retained)) {
          store.dispatch(returnedTableIdChanged(retained));
        }
        conn.send(
          data.playingAtTables.includes(retained)
            ? "tableReattend"
            : "tableSpectate",
          {
            tableId: retained,
            ...(!data.playingAtTables.includes(retained) && {
              // A replay keeps the seat that we chose in the client.
              shadowingPlayerIndex:
                store.getState().game.current?.shadowing === true
                || store.getState().game.current?.finished === true
                  ? store.getState().game.current?.metadata.ourPlayerIndex
                  : undefined,
            }),
          },
        );
      } else {
        gameMain.closeGame();
        finishReconnecting(conn);
        lobbyCommands.get("welcome")?.(data);
      }
    });
    conn.on("error", errorCallback(conn));
    return;
  }

  initCommands(conn);
}

export function websocketInit(): void {
  // Never launch a second handshake while one is already in progress.
  if (
    activeConnection !== undefined
    && (activeConnection.ws.readyState === WebSocket.CONNECTING
      || activeConnection.ws.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  // Ensure that we are connecting to the right URL.
  const domain = document.querySelector("#domain")?.textContent;
  if (globalThis.location.hostname !== domain) {
    modals.showError(`You are supposed to connect using the URL of: ${domain}`);
    return;
  }

  const websocketProtocol =
    globalThis.location.protocol === "https:" ? "wss" : "ws";
  let websocketHost = globalThis.location.hostname;
  if (globalThis.location.port !== "") {
    websocketHost += `:${globalThis.location.port}`;
  }
  websocketUrl = `${websocketProtocol}://${websocketHost}/ws`;

  stopped = false;
  recovering = false;
  reloadWhenBack = false;
  welcomed = false;
  failedAttemptsBeforeWelcome = 0;
  reconnectBackoff.reset();
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  registerReconnectWakeListeners();
  console.log("Connecting to websocket URL:", websocketUrl);
  openConnection(false);
}

// Only callbacks from the currently active connection can affect the browser.
function isCurrentConnection(conn: Connection) {
  return activeConnection === conn && !stopped;
}

/** Handles an error, after which the server closes the connection. */
function errorCallback(conn: Connection) {
  return (data: ServerEventData["error"]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    // The connection closes after this error, and the "close" handler starts to reconnect.
    if (data.code === "maintenance") {
      reloadWhenBack = true;
      commands.get("error")?.(data);
      return;
    }
    // Application errors are deliberate disconnects, not transport outages.
    stopRecovery();
    // Our session is gone. On the login screen, we sign in. Later, loading the page afresh shows
    // the sign-in form.
    if (data.code === "signInRequired") {
      if (welcomed) {
        globalThis.location.reload();
      } else {
        store.dispatch(loginStageChanged("signIn"));
      }
      return;
    }
    // A reload that served the same client again shows the error, which explains how to update.
    if (data.code === "outdatedClient" && reloadOutdatedClient()) {
      return;
    }
    commands.get("error")?.(data);
  };
}

function commonCallback<Command extends ServerEvent>(
  conn: Connection,
  commandFunction: (data: ServerEventData[Command]) => void,
) {
  return (data: ServerEventData[Command]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    commandFunction(data);
  };
}

function lobbyCallback<Command extends ServerEvent>(
  conn: Connection,
  commandName: Command,
  commandFunction: (data: ServerEventData[Command]) => void,
) {
  return (data: ServerEventData[Command]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    if (commandName === "welcome") {
      clearWelcomeTimer();
      reconnectBackoff.reset();
      welcomed = true;
    }
    commandFunction(data);
  };
}

function gameCallback<Command extends ServerEvent>(
  conn: Connection,
  commandName: Command,
  commandFunction: (data: ServerEventData[Command]) => void,
) {
  return (data: ServerEventData[Command]) => {
    // Ignore game events outside a loaded game, or while the UI is loading.
    if (
      !isCurrentConnection(conn)
      || store.getState().session.screen !== Screen.Game
      || !gameSession.isOpen()
    ) {
      return;
    }
    // A message from a table that we left can arrive after we open another game. Its events do not
    // fit this game, such as a clue to a seat that this game does not have.
    if ("tableId" in data && data.tableId !== globals.tableId) {
      return;
    }
    if (commandName !== "gameState" && gameSession.isLoading()) {
      return;
    }
    // The state can arrive after the server refused to describe the game.
    if (
      commandName === "gameState"
      && store.getState().game.current === undefined
    ) {
      return;
    }
    if (
      commandName === "gameState"
      && endedAfterDescribed(data as ServerEventData["gameState"])
    ) {
      reopenGame();
      return;
    }
    commandFunction(data);
  };
}

/**
 * Whether the game ended after the server described it to us as a game in progress. We skip game
 * events while the game loads, so we can miss the "gameFinished" event.
 */
function endedAfterDescribed(state: ServerEventData["gameState"]): boolean {
  return (
    state.phase.type === "replay"
    && store.getState().game.current?.finished === false
  );
}

/**
 * Loads the state of the game that we had open before we lost the connection. A table keeps its ID
 * when its players play again, so the table can play another game now, maybe in another variant.
 * Then we open that game, since the state that we have describes the old one.
 */
function resumeGame(conn: Connection, tableId: number) {
  conn.send("gameInitLoad", { tableId }, (reply) => {
    // A connection that closes also fails its requests. The next connection tries again.
    if (
      !isCurrentConnection(conn)
      || !gameSession.isOpen()
      || conn.ws.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    if (
      reply.ok
      && reply.data.startedAt === store.getState().game.current?.startedAt
    ) {
      conn.send("gameStateLoad", { tableId });
      return;
    }
    reopenGame();
    finishReconnecting(conn);
    initCommands(conn);
  });
}

/** Opens the game again, so that the server describes the table's game as it is now. */
function reopenGame() {
  gameMain.closeGame();
  gameMain.show(false);
}

// Install the ordinary initial-connection protocol handlers.
function initCommands(conn: Connection) {
  for (const [commandName, commandFunction] of commands.entries()) {
    conn.on(commandName, commonCallback(conn, commandFunction));
  }
  for (const [commandName, commandFunction] of lobbyCommands.entries()) {
    conn.on(commandName, lobbyCallback(conn, commandName, commandFunction));
  }
  for (const [commandName, commandFunction] of gameCommands.entries()) {
    conn.on(commandName, gameCallback(conn, commandName, commandFunction));
  }
  conn.on("error", errorCallback(conn));
}
