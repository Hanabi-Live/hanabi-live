import type { NewLobbyNavigation, Settings } from "@hanabi-live/data";
import {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  createClientRequestID,
  errorDetails,
  httpError,
  packWSMessageOnClient,
  settings,
  validationErrorDetails,
} from "@hanabi-live/data";
import { z } from "zod";
import { decodeEvent } from "./protocol";
import type { LobbyStore } from "./store";
import { actions } from "./store";

const commandName = z.enum(ClientCommand);

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
  private readonly syncVersions: number[] = [];
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
      const response = await fetch("/test-cookie", {
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
    const name = commandName.safeParse(command);
    if (!name.success) {
      return fail(
        `Unrecognized client command: ${command.slice(0, 80)}. Nothing was sent.`,
      );
    }
    const validated = CLIENT_COMMAND_SCHEMAS[name.data].safeParse(data);
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
    const durable = [
      "chat",
      "tableStart",
      "tableTerminate",
      "tableVoteForTermination",
      "tag",
      "tagDelete",
    ].includes(command);
    const payload =
      durable && !("requestID" in data)
        ? { ...data, requestID: createClientRequestID() }
        : data;
    const frame = packWSMessageOnClient(command, payload);
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
      this.syncVersions.push(this.preferenceVersion);
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
    return true;
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

  markPrivateRead(name: string): void {
    this.store.dispatch(actions.privateMessagesRead(name));
  }

  async logout(): Promise<void> {
    this.stop();
    try {
      const response = await fetch("/logout", {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw await httpError(response, "Signing out");
      }
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
      `${globalThis.location.protocol === "https:" ? "wss:" : "ws:"}//${globalThis.location.host}/ws?version=${encodeURIComponent(CLIENT_VERSION)}`,
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
        if (
          event.command === "warning"
          && this.store.getState().preferenceStatus === "saving"
        ) {
          this.preferenceFailed = true;
        }
        if (event.command === "synced") {
          const version = this.syncVersions.shift();
          if (
            version === this.preferenceVersion
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
          }
        }
        if (event.command === "welcome") {
          welcomed = true;
          clearTimeout(this.timeout);
          this.attempts = 0;
          if (this.destination !== null) {
            this.send("tableReattend", { tableID: this.destination });
          }
        } else if (event.command === "joined" || event.command === "game") {
          this.destination = event.data.tableID;
        } else if (
          event.command === "left"
          || (event.command === "tableGone"
            && event.data.tableID === this.destination)
        ) {
          this.destination = null;
        } else {
          switch (event.command) {
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
                const audio = new Audio(
                  `/public/sounds/${event.data.file}.mp3`,
                );
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
    clearTimeout(this.preferenceTimeout);
    this.syncVersions.length = 0;
    this.navigationAfterPreferences = undefined;
    if (this.store.getState().preferenceStatus === "saving") {
      this.store.dispatch(actions.preferenceStatusChanged("failed"));
      this.notice(
        "The connection closed before preferences were confirmed. Check them after reconnecting.",
      );
    }
  }
}
