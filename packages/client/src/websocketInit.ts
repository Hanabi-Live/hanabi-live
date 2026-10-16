// Communication with the server is done through the WebSocket protocol. The client uses a slightly
// modified version of the Golem WebSocket library.

import { commands } from "./commands";
import { Connection } from "./Connection";
import { gameCommands } from "./game/ui/gameCommands";
import { globals } from "./Globals";
import { lobbyCommands } from "./lobby/lobbyCommands";
import { Screen } from "./lobby/types/Screen";
import * as modals from "./modals";
import { ReconnectBackoff } from "./reconnect";

const reconnectBackoff = new ReconnectBackoff();
let activeConnection: Connection | undefined;
let websocketURL = "";
let recovering = false;
let stopped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let wakeListenersRegistered = false;
let welcomeTimer: ReturnType<typeof setTimeout> | undefined;
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

function stopRecovery() {
  stopped = true;
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
    const response = await fetch("/test-cookie", { cache: "no-store" });
    if (!isRecoveryCurrent(oldConnection)) {
      return;
    }
    if (
      response.status === 204
      || response.status === 401
      || response.status === 403
    ) {
      // The cookie is gone: loading the page afresh restores normal sign-in.
      stopRecovery();
      globalThis.location.reload();
      return;
    }
    if (!response.ok) {
      shouldRetry = true;
      return;
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

function openConnection(isReconnect: boolean) {
  const url = isReconnect ? `${websocketURL}?reconnect=1` : websocketURL;
  const conn = new Connection(url, true, !isReconnect);
  activeConnection = conn;
  globals.conn = conn;

  conn.on("open", () => {
    if (activeConnection !== conn || stopped) {
      return;
    }
    console.log("WebSocket connection established.");
    if (isReconnect) {
      // Close an authenticated probe that stalls before the welcome message.
      clearWelcomeTimer();
      welcomeTimer = setTimeout(() => {
        if (isRecoveryCurrent(conn)) {
          conn.close();
        }
      }, 15_000);
    }
  });
  conn.on("close", () => {
    if (activeConnection !== conn || stopped) {
      return;
    }
    clearWelcomeTimer();
    console.log("WebSocket closed unexpectedly; attempting to reconnect.");
    recovering = true;
    scheduleReconnect();
  });
  conn.on("socketError", (error: unknown) => {
    console.error("WebSocket error:", error);
  });

  if (isReconnect) {
    // Resume probes never apply snapshots to the old game UI.
    conn.on("welcome", () => {
      if (activeConnection !== conn || stopped) {
        return;
      }
      stopRecovery();
      globalThis.location.reload();
    });
    conn.on("error", (data: unknown) => {
      if (activeConnection !== conn || stopped) {
        return;
      }
      stopRecovery();
      commands.get("error")?.(data);
    });
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

function commonCallback(
  conn: Connection,
  commandName: string,
  commandFunction: (data: unknown) => void,
) {
  return (data: unknown) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    if (commandName === "error") {
      // Application errors are deliberate disconnects, not transport outages.
      stopRecovery();
    }
    commandFunction(data);
  };
}

function lobbyCallback(
  conn: Connection,
  commandName: string,
  commandFunction: (data: unknown) => void,
) {
  return (data: unknown) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    if (commandName === "welcome") {
      reconnectBackoff.reset();
    }
    commandFunction(data);
  };
}

function gameCallback(
  conn: Connection,
  commandName: string,
  commandFunction: (data: unknown) => void,
) {
  return (data: unknown) => {
    if (!isCurrentConnection(conn)) {
      return;
    }
    // Ignore game events outside a loaded game, or while the UI is loading.
    if (globals.currentScreen !== Screen.Game || globals.ui === null) {
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
  for (const [commandName, commandFunction] of commands) {
    conn.on(commandName, commonCallback(conn, commandName, commandFunction));
  }
  for (const [commandName, commandFunction] of lobbyCommands) {
    conn.on(commandName, lobbyCallback(conn, commandName, commandFunction));
  }
  for (const [commandName, commandFunction] of gameCommands) {
    conn.on(commandName, gameCallback(conn, commandName, commandFunction));
  }
}
