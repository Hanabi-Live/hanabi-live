import { VARIANT_NAMES } from "@hanabi/data";
import { parseIntSafe } from "@hanabi/utils";
import { globals } from "./Globals";
import { SelfChatMessageType, sendSelfPMFromServer } from "./chat";
import * as createGame from "./lobby/createGame";
import { createJSONFromReplay } from "./lobby/createReplayJSON";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any) => void;
export const chatCommands = new Map<string, Callback>();

// /friend [username]
function friend(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPMFromServer(
      "The format of the /friend command is: <code>/friend Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const name = args.join(" ");
  if (name.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPMFromServer("You cannot friend yourself.", room);
  }

  globals.conn!.send("chatFriend", {
    name,
  });
}
chatCommands.set("friend", friend);
chatCommands.set("addfriend", friend);

// /friends
function friends(room: string) {
  const msg =
    globals.friends.length === 0
      ? "Currently, you do not have any friends on your friends list."
      : `Current friends: ${globals.friends.join(", ")}`;
  sendSelfPMFromServer(msg, room);
}
chatCommands.set("f", friends);
chatCommands.set("friends", friends);
chatCommands.set("friendlist", friends);
chatCommands.set("friendslist", friends);

// /pm [username] [msg]
function pm(room: string, args: readonly string[]) {
  // Validate that the format of the command is correct.
  const [recipient, ...msgArray] = args;
  const msg = msgArray.join(" ").trim();

  if (recipient === undefined || msg === "") {
    sendSelfPMFromServer(
      "The format of a private message is: <code>/w Alice hello</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that they are not sending a private message to themselves.
  if (recipient.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPMFromServer(
      "You cannot send a private message to yourself.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Validate that the recipient is online.
  const users = [...globals.userMap.values()];
  const matchingUser = users.find(
    (user) => user.name.toLowerCase() === recipient.toLowerCase(),
  );
  if (matchingUser === undefined) {
    sendSelfPMFromServer(`User "${recipient}" is not currently online.`, room);
    return;
  }

  globals.conn!.send("chatPM", {
    msg: args.join(" "),
    recipient: matchingUser.name,
    room,
  });
}
chatCommands.set("pm", pm);
chatCommands.set("w", pm);
chatCommands.set("whisper", pm);
chatCommands.set("msg", pm);
chatCommands.set("tell", pm);
chatCommands.set("t", pm);

// /setleader [username]
function setLeader(room: string, args: readonly string[]) {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/setleader</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const username = args.join(" ");
  globals.conn!.send("tableSetLeader", {
    tableID: globals.tableID,
    name: username,
  });
}
chatCommands.set("setleader", setLeader);
chatCommands.set("setlead", setLeader);
chatCommands.set("setowner", setLeader);
chatCommands.set("changeleader", setLeader);
chatCommands.set("changelead", setLeader);
chatCommands.set("changeowner", setLeader);

// /setvariant [variant]
function setVariant(room: string, args: readonly string[]) {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/setvariant</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  // Sanitize the variant name.
  let variantName = getVariantFromArgs(args);
  // Get the first match.
  variantName = getVariantFromPartial(variantName);
  if (variantName === "") {
    sendSelfPMFromServer(
      `The variant of "${args.join(" ")}" is not valid.`,
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  globals.conn!.send("tableSetVariant", {
    tableID: globals.tableID,
    options: {
      variantName,
    },
  });

  // Update our stored create table setting to be equal to this variant.
  createGame.checkSettingChanged("createTableVariant", variantName);
}
chatCommands.set("sv", setVariant);
chatCommands.set("setvariant", setVariant);
chatCommands.set("changevariant", setVariant);
chatCommands.set("cv", setVariant);

// /suggest [turn]
chatCommands.set("suggest", (room: string, args: readonly string[]) => {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/suggest</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  if (args.length === 0) {
    sendSelfPMFromServer(
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
    sendSelfPMFromServer(
      "The [turn] argument must be a valid number",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  globals.conn!.send("tableSuggest", {
    tableID: globals.tableID,
    segment,
  });
});

// /tag [tag]
chatCommands.set("tag", (room: string, args: readonly string[]) => {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/tag</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.conn!.send("tag", {
    tableID: globals.tableID,
    msg: tag,
  });
});

function tagdelete(room: string, args: readonly string[]) {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/tagdelete</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }

  const tag = args.join(" ");
  globals.conn!.send("tagDelete", {
    tableID: globals.tableID,
    msg: tag,
  });
}

// /tagdelete [tag]
chatCommands.set("tagdelete", tagdelete);
chatCommands.set("untag", tagdelete);

// /tagsearch
chatCommands.set("tagsearch", (room: string, args: readonly string[]) => {
  const tag = args.join(" ");

  globals.conn!.send("tagSearch", {
    msg: tag,
    room,
  });
});

chatCommands.set("tagsdeleteall", (room: string) => {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/tagsdeleteall</code> command.",
      room,
      SelfChatMessageType.Error,
    );
  }
  globals.conn!.send("tagsDeleteAll", {
    tableID: globals.tableID,
  });
});

// /playerinfo (username)
function playerinfo(_room: string, args: readonly string[]) {
  let usernames: readonly string[];

  // - If there are no arguments and we are at a table, return stats for all the players.
  // - Otherwise, return stats for the caller.
  if (args.length === 0) {
    usernames =
      globals.tableID !== -1 && globals.ui !== null
        ? [...globals.ui.globals.metadata.playerNames]
        : [globals.username];
  } else {
    // We can return the stats for a list of provided users separated by spaces since usernames
    // cannot contain spaces.
    usernames = args;
  }

  for (const name of usernames) {
    globals.conn!.send("chatPlayerInfo", {
      name,
    });
  }
}
chatCommands.set("p", playerinfo);
chatCommands.set("playerinfo", playerinfo);
chatCommands.set("games", playerinfo);
chatCommands.set("stats", playerinfo);

// /unfriend [username]
chatCommands.set("unfriend", (room: string, args: readonly string[]) => {
  // Validate that the format of the command is correct.
  if (args.length === 0) {
    sendSelfPMFromServer(
      "The format of the /unfriend command is: <code>/unfriend Alice</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  // Validate that we are not targeting ourselves.
  const name = args.join(" ");
  if (name.toLowerCase() === globals.username.toLowerCase()) {
    sendSelfPMFromServer(
      "You cannot unfriend yourself.",
      room,
      SelfChatMessageType.Error,
    );
  }

  globals.conn!.send("chatUnfriend", {
    name,
  });
});

// /version
chatCommands.set("version", (room: string) => {
  const msg = `You are running version <strong>${globals.version}</strong> of the client.`;
  sendSelfPMFromServer(msg, room, SelfChatMessageType.Info);
});

// /copy
chatCommands.set("copy", (room: string) => {
  createJSONFromReplay(room);
});

// /terminate terminates the ongoing game. This is the same as right-clicking the VTK button.
chatCommands.set("terminate", (room: string) => {
  if (globals.tableID === -1) {
    sendSelfPMFromServer(
      "You are not currently at a table, so you cannot use the <code>/terminate</code> command.",
      room,
      SelfChatMessageType.Error,
    );
    return;
  }
  globals.conn!.send("tableTerminate", {
    tableID: globals.tableID,
  });
});

export function getVariantFromArgs(args: readonly string[]): string {
  const patterns = {
    doubleSpaces: / {2,}/g,
    openingParenthesis: / *\( */g,
    closingParenthesis: / *\) */g,
    hyphen: / *- */g,
    ampersand: / *& */g,
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
  const pattern = /(^|[ &()-])(\w)/g;
  return input.toLowerCase().replaceAll(pattern, (x) => x.toUpperCase());
}

export function getVariantFromPartial(search: string): string {
  const firstVariant = VARIANT_NAMES.find((variantName) =>
    variantName.startsWith(search),
  );

  return firstVariant ?? "";
}
