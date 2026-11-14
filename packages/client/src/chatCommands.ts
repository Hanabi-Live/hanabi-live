import { MAX_PAGE_LIMIT, VERSION } from "@hanabi-live/data";
import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import { globals } from "./Globals.ts";
import {
  SelfChatMessageType,
  sendSelfPmFromServer,
  showPmHistory,
} from "./chat.ts";
import * as createGame from "./lobby/createGame.ts";
import { createJsonFromReplay } from "./lobby/createReplayJson.ts";
import { getOnlineUserId } from "./onlineUsers.ts";
import { store } from "./store.ts";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any) => void;
export const chatCommands = new Map<string, Callback>();

// /copy
chatCommands.set("copy", (room: string) => {
  createJsonFromReplay(room);
});

// Each command that changes a friend, a linked account, or a blocked user sends one request. The
// server checks the name, so that a player cannot target themselves.
const RELATIONSHIP_REQUESTS = {
  friend: "friendAdd",
  unfriend: "friendRemove",
  link: "linkAdd",
  unlink: "linkRemove",
  block: "blockAdd",
  unblock: "blockRemove",
} as const;

for (const [command, request] of Object.entries(RELATIONSHIP_REQUESTS)) {
  chatCommands.set(command, (room: string, args: readonly string[]) => {
    if (args.length === 0) {
      sendSelfPmFromServer(
        [
          `The format of the /${command} command is: `,
          { code: `/${command} Alice` },
        ],
        room,
        SelfChatMessageType.Info,
      );
      return;
    }

    globals.connection.send(request, {
      username: args.join(" "),
    });
  });
}

// /friends
function friends(room: string) {
  const msg =
    store.getState().session.friends.length === 0
      ? "Currently, you do not have any friends on your friends list."
      : `Current friends: ${store.getState().session.friends.join(", ")}`;
  sendSelfPmFromServer(msg, room);
}
chatCommands.set("friends", friends);

// /links
chatCommands.set("links", () => {
  globals.connection.send("linkList", {});
});

// /blocked
chatCommands.set("blocked", (room: string) => {
  const msg =
    store.getState().session.blocked.length === 0
      ? "Currently, you have not blocked anyone."
      : `Currently blocked players: ${store.getState().session.blocked.join(", ")}`;
  sendSelfPmFromServer(msg, room);
});

// /pm [username] [msg]
function pm(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  const [recipient, ...msgArray] = args;
  const msg = msgArray.join(" ").trim();

  if (recipient === undefined || msg === "") {
    sendSelfPmFromServer(
      ["The format of a private message is: ", { code: "/w Alice hello" }],
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that they are not sending a private message to themselves.
  if (
    recipient.toLowerCase() === store.getState().session.username.toLowerCase()
  ) {
    sendSelfPmFromServer(
      "You cannot send a private message to yourself.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Validate that the recipient is online.
  const users = [...globals.userMap.values()];
  const matchingUser = users.find(
    (user) => user.username.toLowerCase() === recipient.toLowerCase(),
  );
  if (matchingUser === undefined) {
    sendSelfPmFromServer(`User "${recipient}" is not currently online.`, room);
    return;
  }

  globals.connection.send("chatPm", {
    text: msg,
    recipient: matchingUser.username,
  });
}
chatCommands.set("pm", pm);
chatCommands.set("w", pm);
chatCommands.set("whisper", pm);
chatCommands.set("msg", pm);
chatCommands.set("tell", pm);

/** The amount of private messages that "/pmhistory" requests when none is given. */
const DEFAULT_PM_HISTORY_AMOUNT = 5;

interface PmHistoryCommandArgs {
  readonly recipient?: string;
  readonly limit: number;
}

export function parsePmHistoryCommandArgs(
  args: readonly string[],
): PmHistoryCommandArgs | undefined {
  if (args.length === 0) {
    return { limit: DEFAULT_PM_HISTORY_AMOUNT };
  }
  if (args.length > 2) {
    return undefined;
  }

  const firstArg = args[0]!;
  const secondArg = args[1];

  let username: string | undefined;
  let amount = DEFAULT_PM_HISTORY_AMOUNT;

  if (secondArg === undefined) {
    const parsedAmount = parseIntSafe(firstArg);
    if (parsedAmount === undefined) {
      username = firstArg;
    } else {
      amount = parsedAmount;
    }
  } else {
    username = firstArg;
    const parsedAmount = parseIntSafe(secondArg);
    if (parsedAmount === undefined) {
      return undefined;
    }
    amount = parsedAmount;
  }

  if (amount < 1 || amount > MAX_PAGE_LIMIT) {
    return undefined;
  }

  return username === undefined
    ? { limit: amount }
    : { recipient: username, limit: amount };
}

// Request private message history with an optional username and amount.
function pmHistory(room: string, args: readonly string[]) {
  const data = parsePmHistoryCommandArgs(args);
  if (data === undefined) {
    sendSelfPmFromServer(
      [
        "The format of the /pmhistory command is: ",
        { code: "/pmhistory [username] [amount]" },
        " or ",
        { code: "/pmhistory [amount]" },
        `, where amount is between 1 and ${MAX_PAGE_LIMIT}.`,
      ],
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  globals.connection.send("chatPmHistory", data, (reply) => {
    if (reply.ok) {
      showPmHistory(reply.data.messages);
    }
  });
}
chatCommands.set("pmhistory", pmHistory);

// /setleader [username]
function setLeader(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/setleader" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const username = args.join(" ");
  const userId = getOnlineUserId(username);
  if (userId === undefined) {
    sendSelfPmFromServer(
      username === ""
        ? [
            "The format of the ",
            { code: "/setleader" },
            " command is: ",
            { code: "/setleader [username]" },
          ]
        : `User "${username}" is not currently online.`,
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.connection.send("tableSetOwner", {
    tableId: globals.tableId,
    userId,
  });
}
chatCommands.set("setleader", setLeader);

// /setvariant [variant]
function setVariant(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/setvariant" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Sanitize the variant name.
  let variantName = getVariantFromArgs(args);
  // Get the first match.
  variantName = getVariantNameFromPartial(variantName);
  if (variantName === "") {
    sendSelfPmFromServer(
      `The variant of "${args.join(" ")}" is not valid.`,
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const { game } = store.getState().pregame;
  if (game === undefined) {
    sendSelfPmFromServer(
      "You can only change the variant before the game starts.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.connection.send("tableUpdate", {
    tableId: globals.tableId,
    settings: {
      ...game.settings,
      options: {
        ...game.settings.options,
        variantId: getVariant(variantName).id,
      },
    },
  });

  // Update our stored create table setting to be equal to this variant.
  createGame.rememberVariant(variantName);
}
chatCommands.set("sv", setVariant);
chatCommands.set("setvariant", setVariant);

// /suggest [turn]
chatCommands.set("suggest", (room: string, args: readonly string[]) => {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/suggest" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  if (args.length === 0) {
    sendSelfPmFromServer(
      ["The format of the /suggest command is: ", { code: "/suggest [turn]" }],
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  const firstArg = args[0];
  if (firstArg === undefined) {
    return;
  }

  const segment = parseIntSafe(firstArg);
  if (segment === undefined) {
    sendSelfPmFromServer(
      "The [turn] argument must be a valid number",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  globals.connection.send("tableSuggest", {
    tableId: globals.tableId,
    turn: segment,
  });
});

// /tag [tag]
chatCommands.set("tag", (room: string, args: readonly string[]) => {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/tag" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.connection.send("tagAdd", {
    tableId: globals.tableId,
    tag,
  });
});

function untag(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/untag" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.connection.send("tagRemove", {
    tableId: globals.tableId,
    tag,
  });
}

// /untag [tag]
chatCommands.set("untag", untag);

// /tagsearch
chatCommands.set("tagsearch", (_room: string, args: readonly string[]) => {
  const tag = args.join(" ");

  globals.connection.send("tagSearch", {
    tag,
  });
});

chatCommands.set("tagsdeleteall", (room: string) => {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/tagsdeleteall" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.connection.send("tagRemoveAll", {
    tableId: globals.tableId,
  });
});

// /terminate
chatCommands.set("terminate", (room: string) => {
  // Terminates the ongoing game. This is the same as right-clicking the skull button.
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      [
        "You are not currently at a table, so you cannot use the ",
        { code: "/terminate" },
        " command.",
      ],
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.connection.send("tableTerminate", {
    tableId: globals.tableId,
  });
});

// /version
chatCommands.set("version", (room: string) => {
  const msg = [
    "You are running version ",
    { strong: VERSION },
    " of the client.",
  ] as const;
  sendSelfPmFromServer(msg, room, SelfChatMessageType.Info);
});

export function getVariantFromArgs(args: readonly string[]): string {
  const patterns = {
    doubleSpaces: / {2,}/gu,
    openingParenthesis: /(?<! ) *\( */gu,
    closingParenthesis: /(?<! ) *\) */gu,
    hyphen: /(?<! ) *- */gu,
    ampersand: /(?<! ) *& */gu,
  };

  const variant = args
    // Remove empty elements
    .filter((arg) => arg !== "")
    // Capitalize
    .map((arg) => capitalize(arg))
    .join(" ")
    // Remove space after opening and before closing parenthesis.
    .replaceAll(patterns.openingParenthesis, " (")
    .replaceAll(patterns.closingParenthesis, ") ")
    // Remove space before and after hyphen.
    .replaceAll(patterns.hyphen, "-")
    // Add space before and after ampersand.
    .replaceAll(patterns.ampersand, " & ")
    // Remove double spaces.
    .replaceAll(patterns.doubleSpaces, " ")
    .trim();

  return variant;
}

function capitalize(input: string) {
  const pattern = /(?:^|[ &()-])\w/gu;
  return input.toLowerCase().replaceAll(pattern, (x) => x.toUpperCase());
}

export function getVariantNameFromPartial(search: string): string {
  const firstVariant = VARIANT_NAMES.find((variantName) =>
    variantName.startsWith(search),
  );

  return firstVariant ?? "";
}
