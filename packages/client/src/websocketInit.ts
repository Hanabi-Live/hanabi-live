// Communication with the server is done through the WebSocket protocol. The client uses a slightly
// modified version of the Golem WebSocket library.

import type { ServerCommand, ServerCommandData } from "@hanabi-live/data";
import {
  VERSION,
  errorDetails,
  httpError,
  tableIdSchema,
  withTabAccount,
} from "@hanabi-live/data";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import { commands } from "./commands";
import { Connection } from "./Connection";
import { HTTP_STATUS } from "./constants";
import { gameCommands } from "./game/ui/gameCommands";
import { globals } from "./Globals";
import { fetchCookieOnce } from "./lobby/cookieProbe";
import { lobbyCommands } from "./lobby/lobbyCommands";
import { tablesCleared } from "./lobby/tables/tablesSlice";
import { Screen } from "./lobby/types/Screen";
import { usersCleared } from "./lobby/users/usersSlice";
import * as modals from "./modals";
import { reloadOutdatedClient } from "./outdatedClient";
import { ReconnectBackoff } from "./reconnect";
import { store } from "./store";
import * as theme from "./theme";
import { escapeHtml } from "./utils";

const reconnectBackoff = new ReconnectBackoff();
const CONNECT_TIMEOUT_MS = 15 * SECOND_IN_MILLISECONDS;
const WELCOME_TIMEOUT_MS = 15 * SECOND_IN_MILLISECONDS;
let activeConnection: Connection | undefined;
let websocketURL = "";
let recovering = false;
let stopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let wakeListenersRegistered = false;
let welcomeTimer: ReturnType<typeof setTimeout> | undefined;
let connectTimer: ReturnType<typeof setTimeout> | undefined;
let cookieProbeInFlight = false;

function isRecoveryCurrent(connection: Connection | undefined) {
  return recovering && !stopped && activeConnection === connection;
}

function clearWelcomeTimer() {
  if (welcomeTimer !== undefined) {
    clearTimeout(welcomeTimer);
    welcomeTimer = undefined;
  }
}

function clearConnectTimer() {
  if (connectTimer !== undefined) {
    clearTimeout(connectTimer);
    connectTimer = undefined;
  }
}

function stopRecovery() {
  stopped = true;
  clearConnectTimer();
  recovering = false;
  clearWelcomeTimer();
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
}

function canRetryNow() {
  return navigator.onLine && document.visibilityState !== "hidden";
}

function scheduleReconnect(immediate = false) {
  if (
    !recovering
    || stopped
    || reconnectTimer !== undefined
    || cookieProbeInFlight
    || !canRetryNow()
  ) {
    return;
  }
  // Browsers pause timers in background. A foreground/online event will wake us.
  const delay = immediate ? 0 : reconnectBackoff.nextDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    attemptReconnect().catch((error: unknown) => {
      console.error("WebSocket reconnect attempt failed:", error);
      scheduleReconnect();
    });
  }, delay);
}

async function attemptReconnect() {
  if (!recovering || stopped || !canRetryNow() || cookieProbeInFlight) {
    return;
  }
  cookieProbeInFlight = true;
  const oldConnection = activeConnection;
  let shouldRetry = false;
  try {
    const response = await fetchCookieOnce();
    if (!isRecoveryCurrent(oldConnection)) {
      return;
    }
    if (
      response.status === HTTP_STATUS.NO_CONTENT
      || response.status === HTTP_STATUS.UNAUTHORIZED
      || response.status === HTTP_STATUS.FORBIDDEN
    ) {
      // The cookie is gone: loading the page afresh restores normal sign-in.
      stopRecovery();
      globalThis.location.reload();
      return;
    }
    if (!response.ok) {
      throw await httpError(
        response,
        "Checking the live session before reconnecting",
      );
    }
    if (canRetryNow()) {
      openConnection(true);
    }
  } catch (error: unknown) {
    console.warn(
      "Unable to check the WebSocket session before reconnect:",
      error,
    );
    shouldRetry = true;
  } finally {
    cookieProbeInFlight = false;
    if (shouldRetry) {
      scheduleReconnect();
    }
  }
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
  recovering = true;
  conn.close();
  scheduleReconnect();
}

function openConnection(isReconnect: boolean) {
  const url = withTabAccount(
    `${websocketURL}?version=${encodeURIComponent(VERSION)}`,
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
    recovering = true;
    scheduleReconnect();
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
  conn.on("outdatedClient", () => {
    // Otherwise, the error that the server sends next explains how to update.
    if (isCurrentConnection(conn) && reloadOutdatedClient()) {
      stopRecovery();
    }
  });
  conn.on("restart", ({ message }) => {
    if (activeConnection === conn) {
      conn.setReady(false);
      reconnectBackoff.reset();
      // An administrator's reason for the downtime stays open through the reconnect.
      if (message !== undefined) {
        modals.showDowntime(message);
      }
    }
  });

  if (isReconnect) {
    initCommands(conn);
    conn.on("welcome", (data) => {
      if (activeConnection !== conn || stopped) {
        return;
      }
      clearWelcomeTimer();
      reconnectBackoff.reset();
      recovering = false;
      globals.conn = conn;
      globals.userMap.clear();
      store.dispatch(usersCleared());
      store.dispatch(tablesCleared());
      if (
        globals.currentScreen === Screen.Game
        && globals.ui !== undefined
        && data.userID === globals.userID
      ) {
        globals.muted = data.muted;
        globals.settings = data.settings;
        globals.friends = data.friends;
        globals.blocked = data.blocked;
        theme.setDarkMode(globals.settings.darkMode);
        const retained = tableIdSchema.parse(globals.tableID);
        conn.on("tableStarted", (table) => {
          if (!isCurrentConnection(conn)) {
            return;
          }
          if (
            table.tableID === retained
            && table.stage !== "replay"
            && globals.ui !== undefined
            && globals.ui.globals.store !== undefined
            && !globals.ui.globals.state.finished
          ) {
            conn.send("getGameState", { tableID: retained });
          } else {
            globals.ui?.destroy();
            globals.ui = undefined;
            lobbyCommands.get("tableStarted")?.(table);
          }
        });
        conn.on("gameActionList", (actionList) => {
          if (!isCurrentConnection(conn) || globals.ui === undefined) {
            return;
          }
          const rebuilding = globals.ui.globals.loading;
          gameCommands.get("gameActionList")?.(actionList);
          conn.setReady(true);
          if (!rebuilding) {
            conn.send("loaded", { tableID: globals.tableID });
          }
          initCommands(conn);
        });
        conn.send(
          data.playingAtTables.includes(retained)
            ? "tableReattend"
            : "tableSpectate",
          {
            tableID: retained,
            ...(!data.playingAtTables.includes(retained) && {
              shadowingPlayerIndex:
                globals.ui.globals.store !== undefined
                && globals.ui.globals.state.shadowing
                  ? globals.ui.globals.metadata.ourPlayerIndex
                  : undefined,
            }),
          },
        );
      } else {
        if (globals.ui !== undefined) {
          globals.ui.destroy();
          globals.ui = undefined;
        }
        conn.setReady(true);
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
  const domain = $("#domain").html();
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
  websocketURL = `${websocketProtocol}://${websocketHost}/ws`;

  stopped = false;
  recovering = false;
  reconnectBackoff.reset();
  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  registerReconnectWakeListeners();
  console.log("Connecting to websocket URL:", websocketURL);
  openConnection(false);
}

// Only callbacks from the currently active connection can affect the browser.
function isCurrentConnection(conn: Connection) {
  return activeConnection === conn && !stopped;
}

/** Handles an error, after which the server closes the connection. */
function errorCallback(conn: Connection) {
  return (data: ServerCommandData["error"]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    // Application errors are deliberate disconnects, not transport outages.
    stopRecovery();
    commands.get("error")?.(data);
  };
}

function commonCallback<Command extends ServerCommand>(
  conn: Connection,
  commandFunction: (data: ServerCommandData[Command]) => void,
) {
  return (data: ServerCommandData[Command]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    commandFunction(data);
  };
}

function lobbyCallback<Command extends ServerCommand>(
  conn: Connection,
  commandName: Command,
  commandFunction: (data: ServerCommandData[Command]) => void,
) {
  return (data: ServerCommandData[Command]) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    if (commandName === "welcome") {
      clearWelcomeTimer();
      reconnectBackoff.reset();
    }
    commandFunction(data);
  };
}

function gameCallback<Command extends ServerCommand>(
  conn: Connection,
  commandName: Command,
  commandFunction: (data: ServerCommandData[Command]) => void,
) {
  return (data: ServerCommandData[Command]) => {
    // Ignore game events outside a loaded game, or while the UI is loading.
    if (
      !isCurrentConnection(conn)
      || globals.currentScreen !== Screen.Game
      || globals.ui === undefined
    ) {
      return;
    }
    if (
      globals.ui.globals.loading
      && commandName !== "init"
      && commandName !== "gameActionList"
    ) {
      return;
    }
    commandFunction(data);
  };
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
