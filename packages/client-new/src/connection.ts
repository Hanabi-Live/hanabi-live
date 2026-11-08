import type {
  ClientCommand,
  NewLobbyNavigation,
  Settings,
} from "@hanabi-live/data";
import {
  CLIENT_COMMAND_SCHEMAS,
  clearTabAccount,
  errorDetails,
  httpError,
  packWSMessageOnClient,
  setTabAccount,
  setTabAccountFromLogin,
  settings,
  validationErrorDetails,
  withTabAccount,
} from "@hanabi-live/data";
import { decodeEvent } from "./protocol";
import type { LobbyStore } from "./store";
import { actions } from "./store";

function isClientCommand(command: string): command is ClientCommand {
  return Object.hasOwn(CLIENT_COMMAND_SCHEMAS, command);
}
const unconfirmedRequest =
  "The request may have succeeded. Check the table after reconnecting before trying again.";

interface Confirmation {
  command: string;
  complete: () => void;
  fail: (message: string) => void;
  warning?: string;
}

export class LobbyConnection {
  private socket: WebSocket | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private controller: AbortController | undefined;
  private generation = 0;
  private attempts = 0;
  private stopped = false;
  private destination: number | null = null;
  private handoffTableID: number | null = null;
  private preferenceVersion = 0;
  private readonly syncBarriers: Array<number | Confirmation> = [];
  private confirmation: Confirmation | undefined;
  private confirmationTimeout: ReturnType<typeof setTimeout> | undefined;
  private preferenceFailed = false;
  private preferenceTimeout: ReturnType<typeof setTimeout> | undefined;
  private navigationAfterPreferences: NewLobbyNavigation | undefined;
  private readonly store: LobbyStore;
  private readonly enterGame: (target: NewLobbyNavigation) => boolean;

  constructor(
    store: LobbyStore,
    enterGame: (target: NewLobbyNavigation) => boolean,
  ) {
    this.store = store;
    this.enterGame = enterGame;
  }

  async checkSession(): Promise<void> {
    this.stopped = false;
    this.generation++;
    const { generation } = this;
    this.controller?.abort();
    this.controller = new AbortController();
    try {
      const response = await fetch(withTabAccount("/test-cookie"), {
        cache: "no-store",
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(10_000),
        ]),
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      if (response.status === 200) {
        this.connect();
      } else if ([204, 401, 403].includes(response.status)) {
        this.store.dispatch(actions.signedOut());
      } else {
        throw await httpError(response, "Checking your saved session");
      }
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.notice(errorDetails(error, "Checking your saved session"));
      this.scheduleReconnect();
    }
  }

  async login(
    username: string,
    password: string,
    newPassword = "",
  ): Promise<void> {
    this.stop();
    this.stopped = false;
    const { generation } = this;
    this.store.dispatch(actions.connectionChanged("connecting"));
    this.controller = new AbortController();
    try {
      const response = await fetch("/login", {
        method: "POST",
        body: new URLSearchParams({
          username,
          password,
          newPassword,
          version: CLIENT_VERSION,
        }),
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(30_000),
        ]),
      });
      if (!this.isCurrent(generation)) {
        return;
      }
      if (!response.ok) {
        throw await httpError(response, "Signing in");
      }
      setTabAccountFromLogin(await response.json());
      if (!this.isCurrent(generation)) {
        return;
      }
      this.connect();
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.store.dispatch(actions.connectionChanged("signed-out"));
      this.store.dispatch(
        actions.notify({
          text: errorDetails(error, "Signing in"),
        }),
      );
    }
  }

  attend(tableID: number): void {
    this.destination = tableID;
    this.send("tableReattend", { tableID });
  }

  send(
    command: string,
    data: object,
    onError?: (message: string) => void,
    onComplete?: () => void,
  ): boolean {
    const fail = (message: string): false => {
      this.notice(message);
      onError?.(message);
      return false;
    };
    if (
      this.store.getState().connection !== "online"
      || this.socket?.readyState !== WebSocket.OPEN
    ) {
      return fail(
        "You are offline. Wait for reconnection, then try again. Nothing was sent.",
      );
    }
    if (onComplete !== undefined && this.confirmation !== undefined) {
      return fail(
        "Wait for the current request to be confirmed. Nothing else was sent.",
      );
    }
    if (!isClientCommand(command)) {
      return fail(
        `Unrecognized client command: ${command.slice(0, 80)}. Nothing was sent.`,
      );
    }
    const validated = CLIENT_COMMAND_SCHEMAS[command].safeParse(data);
    if (!validated.success) {
      return fail(
        `Cannot send ${command}: ${validationErrorDetails(validated.error)}`,
      );
    }
    if (command === "replayCreate") {
      const parsed = CLIENT_COMMAND_SCHEMAS.replayCreate.safeParse(data);
      if (!parsed.success) {
        return fail(
          `Cannot open replay: ${validationErrorDetails(parsed.error)}`,
        );
      }
      // A solo replay is retired when its last viewer disconnects. Create it after handoff.
      return this.navigateToGame({ kind: "replay", request: parsed.data });
    }
    const frame = packWSMessageOnClient(command, data);
    if (new TextEncoder().encode(frame).length > 4 * 1024 * 1024) {
      return fail(
        `Cannot send ${command}: the request exceeds the 4 MB server limit.`,
      );
    }
    try {
      this.socket.send(frame);
    } catch (error) {
      return fail(errorDetails(error, `Sending ${command}`));
    }
    if (command === "sync") {
      this.syncBarriers.push(this.preferenceVersion);
    }
    this.store.dispatch(actions.requestSent(command));
    if (command === "tableUnattend" || command === "tableLeave") {
      this.destination = null;
      this.handoffTableID = null;
      this.navigationAfterPreferences = undefined;
    }
    if (command === "tableUnattend") {
      this.store.dispatch(actions.tableUnattended());
    }
    if (onComplete !== undefined) {
      this.confirmation = {
        command,
        complete: onComplete,
        fail: (message) => {
          fail(message);
        },
      };
      this.syncBarriers.push(this.confirmation);
      try {
        // Confirm ordered mutations, not unrelated table broadcasts.
        this.socket.send(packWSMessageOnClient("sync", {}));
      } catch (error) {
        this.finishConfirmation(
          `${errorDetails(error, `Confirming ${command}`)} ${unconfirmedRequest}`,
        );
        this.socket.close();
        return false;
      }
      this.confirmationTimeout = setTimeout(() => {
        this.finishConfirmation(
          `The server did not confirm the request in time. ${unconfirmedRequest}`,
        );
        this.socket?.close();
      }, 10_000);
    }
    return true;
  }

  private finishConfirmation(error?: string): void {
    const { confirmation } = this;
    if (confirmation === undefined) {
      return;
    }
    this.confirmation = undefined;
    clearTimeout(this.confirmationTimeout);
    this.store.dispatch(actions.requestFinished(confirmation.command));
    if (error === undefined) {
      confirmation.complete();
    } else {
      const { notice } = this.store.getState();
      confirmation.fail(error);
      if (notice?.fatal === true) {
        this.store.dispatch(actions.notify(notice));
      }
    }
  }

  setting(name: keyof Settings, value: Settings[keyof Settings]): boolean {
    const current = this.store.getState().welcome?.settings;
    if (!current) {
      return false;
    }
    const next = settings.safeParse({ ...current, [name]: value });
    if (!next.success) {
      this.notice(`Cannot save ${name}: ${validationErrorDetails(next.error)}`);
      return false;
    }
    if (!this.send("setting", { name, setting: String(value) })) {
      return false;
    }
    if (this.store.getState().preferenceStatus !== "saving") {
      this.preferenceFailed = false;
    }
    this.preferenceVersion++;
    this.store.dispatch(actions.settingsChanged(next.data));
    this.store.dispatch(actions.preferenceStatusChanged("saving"));
    // The server acknowledges sync only after preceding commands have completed.
    this.send("sync", {});
    clearTimeout(this.preferenceTimeout);
    this.preferenceTimeout = setTimeout(() => {
      this.preferenceFailed = true;
      this.navigationAfterPreferences = undefined;
      this.store.dispatch(actions.preferenceStatusChanged("failed"));
      this.notice(
        "Preferences could not be confirmed. Reconnect before trying again.",
      );
    }, 10_000);
    return true;
  }

  notice(text: string): void {
    this.store.dispatch(actions.notify({ text }));
  }

  dismiss(): void {
    this.store.dispatch(actions.dismissNotice());
  }

  dismissDowntime(): void {
    this.store.dispatch(actions.dismissDowntime());
  }

  async logout(): Promise<void> {
    this.stop();
    try {
      const response = await fetch(withTabAccount("/logout"), {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw await httpError(response, "Signing out");
      }
      clearTabAccount();
      this.store.dispatch(actions.signedOut());
    } catch (error) {
      this.store.dispatch(actions.connectionChanged("stopped"));
      this.notice(errorDetails(error, "Signing out"));
    }
  }

  retryNow(): void {
    this.stop();
    void this.checkSession();
  }

  offline(): void {
    this.socket?.close();
  }

  stop(): void {
    this.handoffTableID = null;
    this.clearPreferenceRequests();
    this.stopped = true;
    this.generation++;
    this.controller?.abort();
    clearTimeout(this.retry);
    clearTimeout(this.timeout);
    this.socket?.close();
    this.socket = undefined;
  }

  private connect(): void {
    if (this.stopped) {
      return;
    }
    this.handoffTableID = null;
    this.generation++;
    const { generation } = this;
    this.socket?.close();
    this.store.dispatch(
      actions.connectionChanged(
        this.store.getState().welcome ? "reconnecting" : "connecting",
      ),
    );
    const socket = new WebSocket(
      `${globalThis.location.protocol === "https:" ? "wss:" : "ws:"}//${globalThis.location.host}${withTabAccount(`/ws?version=${encodeURIComponent(CLIENT_VERSION)}`)}`,
    );
    let welcomed = false;
    this.socket = socket;
    this.timeout = setTimeout(() => {
      socket.close();
    }, 15_000);
    socket.addEventListener("message", ({ data }: MessageEvent<unknown>) => {
      if (!this.isCurrent(generation) || typeof data !== "string") {
        return;
      }
      try {
        const event = decodeEvent(data);
        if (!event) {
          return;
        }
        if (
          event.command === "welcome"
          && this.store.getState().welcome?.userID !== event.data.userID
        ) {
          this.destination = null;
        }
        this.store.dispatch(actions.received(event));
        if (event.command === "warning") {
          const barrier = this.syncBarriers[0];
          if (typeof barrier === "number") {
            this.preferenceFailed = true;
          } else if (barrier !== undefined) {
            barrier.warning = event.data.warning;
          }
        } else if (event.command === "synced") {
          const barrier = this.syncBarriers.shift();
          if (
            typeof barrier === "number"
            && barrier === this.preferenceVersion
            && this.store.getState().preferenceStatus === "saving"
          ) {
            clearTimeout(this.preferenceTimeout);
            this.store.dispatch(
              actions.preferenceStatusChanged(
                this.preferenceFailed ? "failed" : "saved",
              ),
            );
            const target = this.navigationAfterPreferences;
            this.navigationAfterPreferences = undefined;
            if (target !== undefined && !this.preferenceFailed) {
              this.navigateToGame(target);
            }
          } else if (barrier !== undefined && barrier === this.confirmation) {
            this.finishConfirmation(
              barrier.warning === undefined
                ? undefined
                : `${barrier.warning} Check the table before trying again.`,
            );
          }
        }
        switch (event.command) {
          case "welcome": {
            welcomed = true;
            setTabAccount(event.data.userID);
            clearTimeout(this.timeout);
            this.attempts = 0;
            if (this.destination !== null) {
              this.send("tableReattend", { tableID: this.destination });
            }

            break;
          }

          case "joined":
          case "game": {
            this.destination = event.data.tableID;

            break;
          }

          case "left":
          case "boot":
          case "tableGone": {
            const { tableID } = event.data;
            if (this.destination === tableID) {
              this.destination = null;
            }
            if (this.handoffTableID === tableID) {
              this.handoffTableID = null;
            }
            if (
              this.navigationAfterPreferences?.kind === "table"
              && this.navigationAfterPreferences.tableID === tableID
            ) {
              this.navigationAfterPreferences = undefined;
            }

            break;
          }

          case "restart": {
            this.attempts = 0;
            this.store.dispatch(actions.connectionChanged("reconnecting"));
            break;
          }

          case "soundLobby": {
            const preferences = this.store.getState().welcome?.settings;
            if (
              preferences
              && preferences.volume > 0
              && /^[\w-]+$/iu.test(event.data.file)
            ) {
              const audio = new Audio(`/public/sounds/${event.data.file}.mp3`);
              audio.volume = preferences.volume / 100;
              void audio.play().catch((error: unknown) => {
                console.info("Browser did not allow lobby sound", error);
              });
            }

            break;
          }

          case "tableStart": {
            this.handoffTableID = event.data.tableID;
            this.send("getGameInfo1", { tableID: event.data.tableID });
            break;
          }

          case "init": {
            if (this.handoffTableID !== event.data.tableID) {
              break;
            }
            this.handoffTableID = null;
            this.navigateToGame({
              kind: "table",
              tableID: event.data.tableID,
              shadowingPlayerIndex: event.data.shadowing
                ? event.data.ourPlayerIndex
                : -1,
            });

            break;
          }

          case "error": {
            this.stop();
            this.store.dispatch(actions.connectionChanged("stopped"));

            break;
          }
          // No default
        }
      } catch (error) {
        console.error(
          "Invalid server message",
          error instanceof Error ? error.message : error,
        );
        this.store.dispatch(
          actions.notify({
            text: errorDetails(error, "Processing a server message"),
            fatal: true,
          }),
        );
        this.stop();
        this.store.dispatch(actions.connectionChanged("stopped"));
      }
    });
    socket.addEventListener("close", (event) => {
      if (!this.isCurrent(generation)) {
        return;
      }
      clearTimeout(this.timeout);
      if (!welcomed) {
        this.notice(
          `The live connection closed before the server welcome (WebSocket code ${event.code || 1006}). The browser did not expose the server's handshake response; check the /ws request in browser network diagnostics.`,
        );
      }
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => {
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped) {
      return;
    }
    this.clearPreferenceRequests();
    clearTimeout(this.retry);
    this.store.dispatch(actions.connectionChanged("reconnecting"));
    const ceiling = Math.min(20_000, 100 * 2 ** Math.min(this.attempts, 9));
    const delay =
      this.attempts === 0
        ? 0
        : Math.floor(ceiling / 2 + (Math.random() * ceiling) / 2);
    this.attempts++;
    this.retry = setTimeout(() => {
      void this.checkSession();
    }, delay);
  }

  private isCurrent(generation: number): boolean {
    return !this.stopped && generation === this.generation;
  }

  private navigateToGame(target: NewLobbyNavigation): boolean {
    if (this.store.getState().preferenceStatus === "saving") {
      this.navigationAfterPreferences = target;
      return true;
    }
    if (!this.enterGame(target)) {
      return false;
    }
    this.stop();
    return true;
  }

  private clearPreferenceRequests(): void {
    const { notice } = this.store.getState();
    this.finishConfirmation(
      `The connection closed before the request was confirmed. ${unconfirmedRequest}${notice?.fatal === true ? ` ${notice.text}` : ""}`,
    );
    clearTimeout(this.preferenceTimeout);
    this.syncBarriers.length = 0;
    this.navigationAfterPreferences = undefined;
    if (this.store.getState().preferenceStatus === "saving") {
      this.store.dispatch(actions.preferenceStatusChanged("failed"));
      if (notice?.fatal !== true) {
        this.notice(
          "The connection closed before preferences were confirmed. Check them after reconnecting.",
        );
      }
    }
  }
}
