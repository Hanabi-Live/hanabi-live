import type { Settings } from "@hanabi-live/data";
import type { EnhancedStore, PayloadAction } from "@reduxjs/toolkit";
import { configureStore, createSlice } from "@reduxjs/toolkit";
import { castDraft } from "immer";
import type {
  Chat,
  HistoryGame,
  Pregame,
  ServerEvent,
  Table,
  User,
  Welcome,
} from "./protocol";

export interface LobbyState {
  connection:
    | "checking"
    | "signed-out"
    | "connecting"
    | "online"
    | "reconnecting"
    | "stopped";
  welcome: Welcome | null;
  lobbyStatus: "loading" | "ready" | "error";
  lobbyError: string | null;
  tables: Record<number, Table>;
  directoryReady: boolean;
  users: Record<number, User>;
  pregame: Pregame | null;
  tableID: number | null;
  roomNavigation: number;
  chat: Chat[];
  deletedChatIDs: number[];
  history: Record<number, HistoryGame>;
  otherScores: HistoryGame[];
  notice: { text: string; fatal: boolean } | null;
  pending: string | null;
  preferenceStatus: "saved" | "saving" | "failed";
  typing: Record<string, string[]>;
  pmHasMore: boolean;
  unreadPMs: Record<string, number>;
  historyLoading: boolean;
  historyHasMore: boolean;
}

function initialState(): LobbyState {
  return {
    connection: "checking",
    welcome: null,
    lobbyStatus: "ready",
    lobbyError: null,
    tables: {},
    directoryReady: false,
    users: {},
    pregame: null,
    tableID: null,
    roomNavigation: 0,
    chat: [],
    deletedChatIDs: [],
    history: {},
    otherScores: [],
    notice: null,
    pending: null,
    preferenceStatus: "saved",
    typing: {},
    pmHasMore: false,
    unreadPMs: {},
    historyLoading: false,
    historyHasMore: true,
  };
}

const slice = createSlice({
  name: "lobby",
  initialState: initialState(),
  reducers: {
    connectionChanged(state, action: PayloadAction<LobbyState["connection"]>) {
      state.connection = action.payload;
      if (action.payload !== "online") {
        state.pending = null;
        state.historyLoading = false;
      }
    },
    notify(state, action: PayloadAction<{ text: string; fatal?: boolean }>) {
      state.notice = {
        text: action.payload.text,
        fatal: action.payload.fatal ?? false,
      };
    },
    dismissNotice(state) {
      state.notice = null;
    },
    privateMessagesRead(state, action: PayloadAction<string>) {
      if (action.payload === "") {
        state.unreadPMs = {};
      } else {
        delete state.unreadPMs[action.payload.toLowerCase()];
      }
    },
    requestSent(state, action: PayloadAction<string>) {
      if (
        [
          "replayCreate",
          "tableCreate",
          "tableJoin",
          "tableReattend",
          "tableSpectate",
          "tableStart",
          "tableUpdate",
        ].includes(action.payload)
      ) {
        state.pending = action.payload;
      }
      if (action.payload === "historyGet") {
        state.historyLoading = true;
      }
    },
    settingsChanged(state, action: PayloadAction<Settings>) {
      if (state.welcome) {
        state.welcome.settings = action.payload;
      }
    },
    preferenceStatusChanged(
      state,
      action: PayloadAction<LobbyState["preferenceStatus"]>,
    ) {
      state.preferenceStatus = action.payload;
    },
    tableUnattended(state) {
      state.tableID = null;
      state.pregame = null;
      state.typing = {};
    },
    signedOut: () => ({ ...initialState(), connection: "signed-out" as const }),
    received(state, { payload }: PayloadAction<ServerEvent>) {
      const event = castDraft(payload);
      switch (event.command) {
        case "lobbyStatus": {
          state.lobbyStatus = event.data.state;
          state.lobbyError =
            event.data.state === "error"
              ? (event.data.message
                ?? "Loading lobby statistics failed without a server explanation. Retry statistics.")
              : null;
          if (state.welcome && event.data.state === "ready") {
            state.welcome.totalGames = event.data.totalGames;
          }
          break;
        }

        case "welcome": {
          state.lobbyError = null;
          state.preferenceStatus = "saved";
          state.tableID = null;
          state.pregame = null;
          state.welcome = event.data;
          state.connection = "online";
          state.tables = {};
          state.directoryReady = false;
          state.users = {};
          state.chat = [];
          state.deletedChatIDs = [];
          state.history = {};
          state.otherScores = [];
          state.unreadPMs = {};
          state.typing = {};
          state.pending = null;
          break;
        }

        case "tableList": {
          state.tables = castDraft(
            Object.fromEntries(event.data.map((table) => [table.id, table])),
          );
          state.directoryReady = true;
          break;
        }

        case "table": {
          state.tables[event.data.id] = event.data;
          if (
            state.welcome
            && (event.data.sharedReplay || !event.data.joined)
          ) {
            state.welcome.playingAtTables =
              state.welcome.playingAtTables.filter(
                (id) => id !== event.data.id,
              );
          }
          break;
        }

        case "tableProgress": {
          const table = state.tables[event.data.tableID];
          if (table) {
            table.progress = event.data.progress;
          }
          break;
        }

        case "tableGone": {
          delete state.tables[event.data.tableID];
          if (state.welcome) {
            state.welcome.playingAtTables =
              state.welcome.playingAtTables.filter(
                (id) => id !== event.data.tableID,
              );
          }
          if (state.tableID === event.data.tableID) {
            state.pregame = null;
            state.tableID = null;
          }
          break;
        }

        case "userList": {
          state.users = Object.fromEntries(
            event.data.map((user) => [user.userID, user]),
          );
          break;
        }

        case "user": {
          state.users[event.data.userID] = event.data;
          break;
        }

        case "userLeft": {
          delete state.users[event.data.userID];
          break;
        }

        case "userInactive": {
          const user = state.users[event.data.userID];
          if (user) {
            user.inactive = event.data.inactive;
          }
          break;
        }

        case "joined": {
          state.chat = state.chat.filter(
            (message) =>
              message.room !== `table${event.data.tableID}`
              || Boolean(message.recipient),
          );
          state.tableID = event.data.tableID;
          state.roomNavigation++;
          state.pending = null;
          break;
        }

        case "game": {
          if (
            state.tableID !== event.data.tableID
            || [
              "tableCreate",
              "tableJoin",
              "tableReattend",
              "tableSpectate",
            ].includes(state.pending ?? "")
          ) {
            state.roomNavigation++;
          }
          state.pregame = event.data;
          state.tableID = event.data.tableID;
          state.pending = null;
          break;
        }

        case "left": {
          state.pregame = null;
          state.tableID = null;
          break;
        }

        case "friends": {
          if (state.welcome) {
            state.welcome.friends = event.data.friends;
          }
          break;
        }

        case "maintenance": {
          if (state.welcome) {
            state.welcome.maintenanceMode = event.data.maintenanceMode;
          }
          break;
        }

        case "shutdown": {
          if (state.welcome) {
            state.welcome.shuttingDown = event.data.shuttingDown;
          }
          break;
        }

        case "chat": {
          if (
            (!event.data.chatID
              || !state.deletedChatIDs.includes(event.data.chatID))
            && (!event.data.chatID
              || state.chat.every(
                (message) => message.chatID !== event.data.chatID,
              ))
            && (!event.data.pmID
              || state.chat.every(
                (message) => message.pmID !== event.data.pmID,
              ))
          ) {
            state.chat.push(event.data);
            if (
              event.data.recipient
              && event.data.who
              && event.data.who !== state.welcome?.username
            ) {
              const name = event.data.who.toLowerCase();
              state.unreadPMs[name] = (state.unreadPMs[name] ?? 0) + 1;
            }
          }
          state.chat = state.chat.slice(-500);
          break;
        }

        case "chatList": {
          for (const message of event.data.list) {
            if (
              message.chatID
              && (state.deletedChatIDs.includes(message.chatID)
                || state.chat.some((old) => old.chatID === message.chatID))
            ) {
              continue;
            }
            state.chat.push(message);
          }
          state.chat = state.chat.slice(-500);
          break;
        }

        case "chatDelete": {
          state.deletedChatIDs.push(event.data.chatID);
          state.chat = state.chat.filter(
            (message) => message.chatID !== event.data.chatID,
          );
          break;
        }

        case "chatTyping": {
          const room = `table${event.data.tableID}`;
          const names = state.typing[room] ?? [];
          state.typing[room] = event.data.typing
            ? [...new Set([...names, event.data.name])]
            : names.filter((name) => name !== event.data.name);
          break;
        }

        case "chatPMHistory": {
          state.pmHasMore = event.data.hasMore;
          for (const message of event.data.list) {
            if (state.chat.every((old) => old.pmID !== message.pmID)) {
              state.chat.push({
                ...message,
                source: "user",
                room: event.data.room ?? "lobby",
              });
            }
          }
          state.chat.sort(
            (a, b) => Date.parse(a.datetime) - Date.parse(b.datetime),
          );
          state.chat = state.chat.slice(-500);
          break;
        }

        case "gameHistory": {
          for (const game of event.data) {
            if (
              state.welcome
              && state.welcome.totalGames !== null
              && game.incrementNumGames
              && !state.history[game.id]
            ) {
              state.welcome.totalGames++;
            }
            state.history[game.id] = game;
          }
          state.historyLoading = false;
          state.historyHasMore = event.data.length >= 10;
          break;
        }

        case "gameHistoryOtherScores": {
          state.otherScores = event.data.games;
          break;
        }

        case "warning": {
          state.notice = { text: event.data.warning, fatal: false };
          state.pending = null;
          break;
        }

        case "error": {
          state.notice = { text: event.data.error, fatal: true };
          state.pending = null;
          break;
        }

        default: {
          // Game-only events are handled by the existing game screen after handoff.
          break;
        }
      }
    },
  },
});

export const { actions } = slice;
export function createLobbyStore(): EnhancedStore<LobbyState> {
  return configureStore({ reducer: slice.reducer });
}
export type LobbyStore = ReturnType<typeof createLobbyStore>;
