import { MAX_PRIVATE_HISTORY_MESSAGES, VERSION } from "@hanabi-live/data";
import { VARIANT_NAMES } from "@hanabi-live/game";
import { parseIntSafe } from "complete-common";
import { globals } from "./Globals.ts";
import {
  SelfChatMessageType,
  roomTableId,
  sendSelfPmFromServer,
} from "./chat.ts";
import * as createGame from "./lobby/createGame.ts";
import { createJsonFromReplay } from "./lobby/createReplayJson.ts";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any) => void;
export const chatCommands = new Map<string, Callback>();

/** The `tableId` field that tells the server which room a command was typed in. */
function roomField(room: string): { tableId?: number } {
  const tableId = roomTableId(room);
  return tableId === undefined ? {} : { tableId };
}

// /copy
chatCommands.set("copy", (room: string) => {
  createJsonFromReplay(room);
});

// /friend [username]
function friend(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPmFromServer(
      "The format of the /friend command is: <code>/friend Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const username = args.join(" ");
  if (username.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPmFromServer("You cannot friend yourself.", room);
  }

  globals.conn!.send("chatFriend", {
    username,
  });
}
chatCommands.set("friend", friend);

// /friends
function friends(room: string) {
  const msg =
    globals.friends.length === 0
      ? "Currently, you do not have any friends on your friends list."
      : `Current friends: ${globals.friends.join(", ")}`;
  sendSelfPmFromServer(msg, room);
}
chatCommands.set("friends", friends);

// /link <user>
function link(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPmFromServer(
      "The format of the /link command is: <code>/link Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const username = args.join(" ");
  if (username.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPmFromServer("You cannot link yourself.", room);
  }

  globals.conn!.send("chatLink", {
    username,
  });
}

// /unlink <user>
function unlink(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPmFromServer(
      "The format of the /unlink command is: <code>/unlink Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const username = args.join(" ");
  if (username.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPmFromServer("You cannot unlink yourself.", room);
  }

  globals.conn!.send("chatUnlink", {
    username,
  });
}

// /links
function links() {
  globals.conn!.send("chatLinked", {});
}

chatCommands.set("link", link);
chatCommands.set("unlink", unlink);
chatCommands.set("links", links);

// The /block and /unblock commands share one handler.
function blockCommand(command: "block" | "unblock") {
  return (room: string, args: readonly string[]) => {
    if (args.length === 0) {
      sendSelfPmFromServer(
        `The format of the /${command} command is: <code>/${command} Alice</code>`,
        room,
        SelfChatMessageType.Info,
      );
      return;
    }

    globals.conn!.send(command === "block" ? "chatBlock" : "chatUnblock", {
      username: args.join(" "),
      ...roomField(room),
    });
  };
}

chatCommands.set("block", blockCommand("block"));
chatCommands.set("unblock", blockCommand("unblock"));

// /blocked
chatCommands.set("blocked", (room: string) => {
  globals.conn!.send("chatBlocked", roomField(room));
});

// /pm [username] [msg]
function pm(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  const [recipient, ...msgArray] = args;
  const msg = msgArray.join(" ").trim();

  if (recipient === undefined || msg === "") {
    sendSelfPmFromServer(
      "The format of a private message is: <code>/w Alice hello</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that they are not sending a private message to themselves.
  if (recipient.toLowerCase() === globals.username.toLowerCase()) {
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

  globals.conn!.send("chatPm", {
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
  readonly username?: string;
  readonly amount: number;
}

export function parsePmHistoryCommandArgs(
  args: readonly string[],
): PmHistoryCommandArgs | undefined {
  if (args.length === 0) {
    return { amount: DEFAULT_PM_HISTORY_AMOUNT };
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

  if (amount < 1 || amount > MAX_PRIVATE_HISTORY_MESSAGES) {
    return undefined;
  }

  return username === undefined ? { amount } : { username, amount };
}

// Request private message history with an optional username and amount.
function pmHistory(room: string, args: readonly string[]) {
  const data = parsePmHistoryCommandArgs(args);
  if (data === undefined) {
    sendSelfPmFromServer(
      "The format of the /pmhistory command is: "
        + "<code>/pmhistory [username] [amount]</code> or "
        + `<code>/pmhistory [amount]</code>, where amount is between 1 and ${MAX_PRIVATE_HISTORY_MESSAGES}.`,
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  globals.conn!.send("chatPmHistory", { ...data, ...roomField(room) });
}
chatCommands.set("pmhistory", pmHistory);

// /setleader [username]
function setLeader(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/setleader</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const username = args.join(" ");
  globals.conn!.send("tableSetLeader", {
    tableId: globals.tableId,
    username,
  });
}
chatCommands.set("setleader", setLeader);

// /setvariant [variant]
function setVariant(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/setvariant</code> command.",
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

  globals.conn!.send("tableSetVariant", {
    tableId: globals.tableId,
    variantName,
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
      "You are not currently at a table, so you cannot use the <code>/suggest</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  if (args.length === 0) {
    sendSelfPmFromServer(
      "The format of the /suggest command is: <code>/suggest [turn]</code>",
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

  globals.conn!.send("tableSuggest", {
    tableId: globals.tableId,
    turn: segment,
  });
});

// /tag [tag]
chatCommands.set("tag", (room: string, args: readonly string[]) => {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/tag</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.conn!.send("tag", {
    tableId: globals.tableId,
    tag,
  });
});

function untag(room: string, args: readonly string[]) {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/untag</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.conn!.send("tagDelete", {
    tableId: globals.tableId,
    tag,
  });
}

// /untag [tag]
chatCommands.set("untag", untag);

// /tagsearch
chatCommands.set("tagsearch", (room: string, args: readonly string[]) => {
  const tag = args.join(" ");

  globals.conn!.send("tagSearch", {
    tag,
    ...roomField(room),
  });
});

chatCommands.set("tagsdeleteall", (room: string) => {
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/tagsdeleteall</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.conn!.send("tagDeleteAll", {
    tableId: globals.tableId,
  });
});

// /terminate
chatCommands.set("terminate", (room: string) => {
  // Terminates the ongoing game. This is the same as right-clicking the skull button.
  if (globals.tableId === undefined) {
    sendSelfPmFromServer(
      "You are not currently at a table, so you cannot use the <code>/terminate</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.conn!.send("tableTerminate", {
    tableId: globals.tableId,
  });
});

// /unfriend [username]
chatCommands.set("unfriend", (room: string, args: readonly string[]) => {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPmFromServer(
      "The format of the /unfriend command is: <code>/unfriend Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const username = args.join(" ");
  if (username.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPmFromServer(
      "You cannot unfriend yourself.",
      room,
      SelfChatMessageType.Error,
    );
  }

  globals.conn!.send("chatUnfriend", {
    username,
  });
});

// /version
chatCommands.set("version", (room: string) => {
  const msg = `You are running version <strong>${VERSION}</strong> of the client.`;
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
