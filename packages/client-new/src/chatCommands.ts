import { VARIANT_NAMES } from "@hanabi-live/game";
import type { LobbyConnection } from "./connection";
import type { Welcome } from "./protocol";

export function sendChat(
  connection: LobbyConnection,
  text: string,
  room: string,
  welcome: Welcome,
  tableID: number | null,
  replyTo?: string,
): boolean {
  const message = text.trim();
  if (!message) {
    return false;
  }
  if (!message.startsWith("/")) {
    return connection.send("chat", { msg: message, room });
  }
  const [rawCommand = "", ...args] = message.slice(1).split(/\s+/u);
  const command = rawCommand.toLowerCase();
  const name = args.join(" ");
  if (command === "r") {
    if (replyTo === undefined || name === "") {
      connection.notice(
        "There is no previous private message to reply to, or the reply is empty.",
      );
      return false;
    }
    return connection.send("chatPM", { recipient: replyTo, msg: name });
  }
  const users: Record<string, string> = {
    friend: "chatFriend",
    addfriend: "chatFriend",
    unfriend: "chatUnfriend",
    link: "chatLink",
    unlink: "chatUnlink",
  };
  if (users[command]) {
    if (!name) {
      connection.notice(`Use /${command} username.`);
      return false;
    }
    return connection.send(users[command], { name, room });
  }
  if (["f", "friendlist", "friends", "friendslist"].includes(command)) {
    connection.notice(
      welcome.friends.length > 0
        ? `Your friends: ${welcome.friends.join(", ")}`
        : "Your friends list is empty.",
    );
    return true;
  }
  if (["linked", "links"].includes(command)) {
    return connection.send("chatLinked", { room });
  }
  if (["msg", "pm", "t", "tell", "w", "whisper"].includes(command)) {
    const [recipient, ...words] = args;
    if (!recipient || words.length === 0) {
      connection.notice("Use /pm username message.");
      return false;
    }
    return connection.send("chatPM", { recipient, msg: words.join(" ") });
  }
  if (command === "pmhistory") {
    const first = args[0];
    const numeric = first !== undefined && /^\d+$/u.test(first);
    const amount = Number(numeric ? first : (args[1] ?? 5));
    if (
      args.length > 2
      || !Number.isSafeInteger(amount)
      || amount < 1
      || amount > 100
    ) {
      connection.notice(
        "Use /pmhistory [username] [amount], with an amount from 1 to 100.",
      );
      return false;
    }
    return connection.send("chatPMHistoryGet", {
      amount,
      room,
      ...(!numeric && first && { username: first }),
    });
  }
  if (["games", "p", "playerinfo", "stats"].includes(command)) {
    let sent = true;
    for (const username of args.length > 0 ? args : [welcome.username]) {
      sent =
        connection.send("chatPlayerInfo", { name: username, room }) && sent;
    }
    return sent;
  }
  if (command === "version") {
    connection.notice(`Client version: ${CLIENT_VERSION}`);
    return true;
  }
  if (command === "tagsearch") {
    return connection.send("tagSearch", { msg: name, room });
  }
  const tableCommands = [
    "setleader",
    "setlead",
    "setowner",
    "changeleader",
    "changelead",
    "changeowner",
    "sv",
    "setvariant",
    "changevariant",
    "cv",
    "suggest",
    "tag",
    "tagdelete",
    "untag",
    "tagsdeleteall",
    "terminate",
    "vote",
  ];
  if (tableCommands.includes(command)) {
    if (tableID === null) {
      connection.notice("Join or watch a table before using this command.");
      return false;
    }
    if (["changevariant", "cv", "setvariant", "sv"].includes(command)) {
      const variantName =
        VARIANT_NAMES.find(
          (value) => value.toLowerCase() === name.toLowerCase(),
        )
        ?? VARIANT_NAMES.find((value) =>
          value.toLowerCase().includes(name.toLowerCase()),
        );
      if (!name || !variantName) {
        connection.notice("That variant was not found.");
        return false;
      }
      return connection.send("tableSetVariant", {
        tableID,
        options: { variantName },
      });
    }
    if (
      [
        "changelead",
        "changeleader",
        "changeowner",
        "setlead",
        "setleader",
        "setowner",
      ].includes(command)
    ) {
      return connection.send("tableSetLeader", { tableID, name });
    }
    if (command === "suggest") {
      const segment = Number(name);
      if (!name || !Number.isSafeInteger(segment) || segment < 0) {
        connection.notice("Use /suggest turn-number.");
        return false;
      }
      return connection.send("tableSuggest", { tableID, segment });
    }
    const names: Record<string, string> = {
      tag: "tag",
      tagdelete: "tagDelete",
      untag: "tagDelete",
      tagsdeleteall: "tagsDeleteAll",
      terminate: "tableTerminate",
      vote: "tableVoteForTermination",
    };
    const destination = names[command];
    if (destination) {
      return connection.send(
        destination,
        destination === "tag" || destination === "tagDelete"
          ? { tableID, msg: name }
          : { tableID },
      );
    }
  }
  if (command === "copy") {
    connection.notice("Open a replay in the game screen to copy its JSON.");
    return true;
  }
  return connection.send("chat", { msg: message, room });
}
