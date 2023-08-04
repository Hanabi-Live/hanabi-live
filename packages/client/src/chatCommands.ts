import {
  capitalizeFirstLetter,
  getVariantNames,
  parseIntSafe,
} from "@hanabi/data";
import { SelfChatMessageType, sendSelfPMFromServer } from "./chat";
import { globals } from "./globals";
import * as createGame from "./lobby/createGame";
import { createJSONFromReplay } from "./lobby/createReplayJSON";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (...args: any) => void;
export const chatCommands = new Map<string, Callback>();

// /friend [username]
function friend(room: string, args: string[]) {
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
function pm(room: string, args: string[]) {
  // Validate that the format of the command is correct.
  if (args.length < 2) {
    sendSelfPMFromServer(
      "The format of a private message is: <code>/w Alice hello</code>",
      room,
      SelfChatMessageType.Info,
    );
    return;
  }

  let recipient = args[0]!;
  args.shift(); // Remove the recipient

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
  let isOnline = false;
  for (const user of globals.userMap.values()) {
    if (user.name.toLowerCase() === recipient.toLowerCase()) {
      isOnline = true;

      // Overwrite the recipient in case the user capitalized the username wrong.
      recipient = user.name;

      break;
    }
  }
  if (!isOnline) {
    sendSelfPMFromServer(`User "${recipient}" is not currently online.`, room);
    return;
  }

  globals.conn!.send("chatPM", {
    msg: args.join(" "),
    recipient,
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
function setLeader(room: string, args: string[]) {
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
function setVariant(room: string, args: string[]) {
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
  createGame.checkChanged("createTableVariant", variantName);
}
chatCommands.set("sv", setVariant);
chatCommands.set("setvariant", setVariant);
chatCommands.set("changevariant", setVariant);
chatCommands.set("cv", setVariant);

// /suggest [turn]
chatCommands.set("suggest", (room: string, args: string[]) => {
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

  const segment = parseIntSafe(args[0]!);
  if (Number.isNaN(segment)) {
    sendSelfPMFromServer(
      "The [turn] argument must be a valid number",
      room,
      SelfChatMessageType.Info,
    );
  }
  globals.conn!.send("tableSuggest", {
    tableID: globals.tableID,
    segment,
  });
});

// /tag [tag]
chatCommands.set("tag", (room: string, args: string[]) => {
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

function tagdelete(room: string, args: string[]) {
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
chatCommands.set("tagsearch", (room: string, args: string[]) => {
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
function playerinfo(_room: string, args: string[]) {
  let usernames: string[] = [];
  if (args.length === 0) {
    // eslint-disable-next-line unicorn/prefer-ternary
    if (globals.tableID !== -1 && globals.ui !== null) {
      // If there are no arguments and we are at a table return stats for all the players.
      usernames = globals.ui.globals.metadata.playerNames;
    } else {
      // Otherwise, return stats for the caller.
      usernames = [globals.username];
    }
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
chatCommands.set("unfriend", (room: string, args: string[]) => {
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

export function getVariantFromArgs(args: string[]): string {
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
    .map((arg) => capitalizeFirstLetter(arg))
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

export function getVariantFromPartial(search: string): string {
  const variantNames = getVariantNames();
  const possibleVariant = variantNames.find((variantName) =>
    variantName.startsWith(search),
  );

  return possibleVariant ?? "";
}
