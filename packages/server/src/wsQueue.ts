// We handle all WebSocket logins and logouts using a queue to prevent race conditions.

import type { UserID } from "@hanabi-live/data";
import { ServerCommand, defaultSettings } from "@hanabi-live/data";
import { SECOND_IN_MILLISECONDS } from "complete-common";
import type { queueAsPromised } from "fastq";
import fastq from "fastq";
import { getChatList } from "./chat";
import { chatMessageToWire } from "./chatMessage";
import { cleanupDisconnectedTables } from "./commands/commandTable";
import { getCurrentDatetime } from "./date";
import { logger } from "./logger";
import { isMaintenanceMode } from "./maintenanceMode";
import { models } from "./models";
import { getMessageOfTheDay } from "./motd";
import { getShuttingDownMetadata } from "./shutdown";
import {
  getSpectatingMetadata,
  getTableIDsUserPlayingAt,
  getTableList,
} from "./tables";
import { getRandomTableName } from "./words";
import { wsError, wsSend, wsSendAll } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { getUserData, getUserList, wsUsers } from "./wsUsers";

export enum WSQueueElementType {
  Login,
  Logout,
}

type InitialMessages = Awaited<ReturnType<typeof prepareInitialMessages>>;

type WSQueueElement =
  | {
      type: WSQueueElementType.Login;
      wsUser: WSUser;
      initialMessages: InitialMessages;
    }
  | { type: WSQueueElementType.Logout; wsUser: WSUser };

const LOBBY_CHAT_HISTORY_LENGTH = 50;

const wsQueue: queueAsPromised<WSQueueElement, void> = fastq.promise(
  processQueue,
  1,
);

// The fastq promise API requires a promise worker; publication itself must not yield.
// eslint-disable-next-line @typescript-eslint/require-await
async function processQueue(element: WSQueueElement) {
  if (element.type === WSQueueElementType.Login) {
    login(element.wsUser, element.initialMessages);
  } else {
    logout(element.wsUser);
  }
}

function login(wsUser: WSUser, initialMessages: InitialMessages) {
  const { connection, userID, username, ip } = wsUser;
  if (connection.readyState !== connection.OPEN) {
    return;
  }

  logger.info(
    `Logging in WebSocket user ${username} (${userID}) from IP: ${ip}`,
  );

  // First, check to see if an existing WebSocket connection exists for this user.
  const existingUser = wsUsers.get(userID);
  if (existingUser !== undefined) {
    if (existingUser.sessionID > wsUser.sessionID) {
      connection.close();
      return;
    }
    wsError(
      existingUser.connection,
      "You have logged on from somewhere else, so you have been disconnected here.",
    );
    existingUser.connection.close();
  }

  // We perform a type assertion to a readable map to represent that we are inside of the WebSocket
  // login queue, which is the only place that this map should be mutable.
  (wsUsers as Map<UserID, WSUser>).set(userID, wsUser);

  sendInitialWSMessages(wsUser, initialMessages);
  wsSendAll(ServerCommand.user, getUserData(wsUser), userID);
}

async function prepareInitialMessages(wsUser: WSUser) {
  const [totalGames, datetimeCreated, settings, friends, bootstrap] =
    await Promise.all([
      models.games.getNumGamesForUser(wsUser.userID, true),
      models.users.getDatetimeCreated(wsUser.userID),
      models.userSettings.get(wsUser.userID),
      models.userFriends.getList(wsUser.userID),
      wsUser.reconnect === true ? undefined : prepareBootstrap(wsUser),
    ]);
  if (datetimeCreated === undefined) {
    throw new Error("The authenticated user no longer exists.");
  }
  return {
    totalGames,
    datetimeCreated,
    settings: settings ?? defaultSettings,
    friends,
    bootstrap,
  };
}

async function prepareBootstrap(wsUser: WSUser) {
  const [chatList, motd, history, friendHistory] = await Promise.all([
    getChatList("lobby", LOBBY_CHAT_HISTORY_LENGTH),
    getMessageOfTheDay(),
    getHistory(wsUser),
    wsUser.friends.size === 0 ? undefined : getFriendHistory(wsUser),
  ]);
  return { chatList, motd, history, friendHistory };
}

function sendInitialWSMessages(wsUser: WSUser, data: InitialMessages) {
  sendWelcomeMessage(wsUser, data);
  const { bootstrap } = data;
  if (bootstrap === undefined) {
    return;
  }
  sendUserList(wsUser);
  sendTableList(wsUser);
  wsSend(wsUser.connection, ServerCommand.chatList, {
    list: bootstrap.chatList,
    unread: 0,
  });
  sendChatDiscordAdvertisement(wsUser);
  sendChatMessageOfTheDay(wsUser, bootstrap.motd);
  wsSend(wsUser.connection, ServerCommand.gameHistory, bootstrap.history);
  if (bootstrap.friendHistory !== undefined) {
    wsSend(
      wsUser.connection,
      ServerCommand.gameHistoryFriends,
      bootstrap.friendHistory,
    );
  }
}

function sendWelcomeMessage(wsUser: WSUser, data: InitialMessages) {
  const { connection, userID, username, muted } = wsUser;
  const { totalGames, datetimeCreated, settings, friends } = data;
  const elapsedTime = Date.now() - datetimeCreated.getTime();
  const firstTimeUser = elapsedTime < 10 * SECOND_IN_MILLISECONDS;

  const playingAtTables = getTableIDsUserPlayingAt(userID);
  const spectatingMetadata = getSpectatingMetadata(userID);
  const disconSpectatingTable = spectatingMetadata?.tableID;
  const disconShadowingSeat = spectatingMetadata?.shadowingPlayerIndex;

  const randomTableName = getRandomTableName();
  const { shuttingDown, datetimeShutdownInit } = getShuttingDownMetadata();
  const maintenanceMode = isMaintenanceMode();

  wsSend(connection, ServerCommand.welcome, {
    userID,
    username,
    totalGames,
    muted,
    firstTimeUser,
    settings,
    friends,
    connectionMode: wsUser.reconnect === true ? "reconnect" : "initial",

    playingAtTables,
    disconSpectatingTable,
    disconShadowingSeat,

    randomTableName,
    shuttingDown,
    datetimeShutdownInit,
    maintenanceMode,
  });
}

function sendUserList(loginWsUser: WSUser) {
  const userList = getUserList();
  wsSend(loginWsUser.connection, ServerCommand.userList, userList);
}

function sendTableList(wsUser: WSUser) {
  const tableList = getTableList(wsUser.userID);
  wsSend(wsUser.connection, ServerCommand.tableList, tableList);
}

function sendChatDiscordAdvertisement(wsUser: WSUser) {
  const discordMsg =
    'Find teammates and discuss strategy in the <a href="https://discord.gg/FADvkJp" target="_blank" rel="noopener noreferrer">Discord chat</a>.';
  wsSend(
    wsUser.connection,
    ServerCommand.chat,
    chatMessageToWire({
      kind: "notice",
      source: "server",
      text: discordMsg,
      datetime: getCurrentDatetime(),
      room: "lobby",
    }),
  );
}

function sendChatMessageOfTheDay(wsUser: WSUser, motd: string | undefined) {
  if (motd !== undefined && motd !== "") {
    const motdMsg = `[Server Notice] ${motd}`;
    wsSend(
      wsUser.connection,
      ServerCommand.chat,
      chatMessageToWire({
        kind: "notice",
        source: "server",
        text: motdMsg,
        who: "",
        datetime: getCurrentDatetime(),
        room: "lobby",
      }),
    );
  }
}

async function getHistory(wsUser: WSUser) {
  const gameIDs = await models.games.getGameIDsForUser(wsUser.userID, 0, 10);
  return await models.games.getHistory(gameIDs);
}

async function getFriendHistory(wsUser: WSUser) {
  const gameIDs = await models.games.getGameIDsForUserFriends(
    wsUser.userID,
    wsUser.friends,
    0,
    10,
  );
  return await models.games.getHistory(gameIDs);
}

function logout(wsUser: WSUser) {
  const { userID, username, ip } = wsUser;

  // Check to see if there is a newer WebSocket connection for this user that is already connected.
  // If so, we can skip the logout work. (This check is necessary because when the same user logs in
  // twice, a logout will be triggered for the first connection after the second one has already
  // connected.)
  const existingWSUser = wsUsers.get(userID);
  if (existingWSUser !== wsUser) {
    return;
  }

  logger.info(
    `Logging out WebSocket user ${username} (${userID}) from IP: ${ip}`,
  );

  // We perform a type assertion to a readable map to represent that we are inside of the WebSocket
  // login queue, which is the only place that this map should be mutable.
  (wsUsers as Map<UserID, WSUser>).delete(userID);

  cleanupDisconnectedTables(wsUser);

  wsSendAll(ServerCommand.userLeft, {
    userID,
  });
}

// ------------------
// Exported functions
// ------------------

export async function enqueueWSMsg(
  type: WSQueueElementType,
  wsUser: WSUser,
): Promise<void> {
  if (type === WSQueueElementType.Login) {
    const initialMessages = await prepareInitialMessages(wsUser);
    await wsQueue.push({ type, wsUser, initialMessages });
  } else {
    await wsQueue.push({ type, wsUser });
  }
}
