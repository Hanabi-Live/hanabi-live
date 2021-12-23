// Users can chat in the lobby, in the pregame, and in a game
// Logic for the game chat box is located separately in "game/chat.ts"

import * as KeyCode from "keycode-js";
import linkifyHtml from "linkifyjs/html";
import emojis from "../../data/emojis.json";
import emoteCategories from "../../data/emotes.json";
import chatCommands from "./chatCommands";
import { FADE_TIME, TYPED_HISTORY_MAX_LENGTH } from "./constants";
import globals from "./globals";
import Screen from "./lobby/types/Screen";
import { parseIntSafe } from "./misc";
import * as modals from "./modals";
import ChatMessage from "./types/ChatMessage";

// Constants
const serverSideOnlyCommands = [
  // General commands
  "help",
  "commands",
  "?",
  "discord",
  "rules",
  "community",
  "guidelines",
  "new",
  "beginner",
  "beginners",
  "guide",
  "bga",
  "doc",
  "levels",
  "path",
  "learningpath",
  "learning",
  "level",
  "features",
  "manual",
  "ptt",
  "sin",
  "cardinal",
  "cardinalsin",
  "document",
  "reference",
  "efficiency",
  "replay",
  "random",
  "uptime",
  "timeleft",

  // Pre-game commands
  "s",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "startin",
  "kick",
  "impostor",

  // Pre-game or game commands
  "missing",
  "missingscores",
  "missing-scores",
  "sharedmissingscores",
  "shared-missing-scores",
  "findvariant",
  "find-variant",
  "randomvariant",
  "random-variant",

  // Game commands
  "pause",
  "unpause",

  // Replay commands
  "suggest",
  "tags",
  "taglist",
];

// Variables
const emojiMap = new Map<string, string>();
const emojiList: string[] = [];
const emoteList: string[] = [];
let chatLineNum = 1;
let lastPM = "";
let datetimeLastChatInput = new Date().getTime();
let typedChatHistory: string[] = [];
let typedChatHistoryIndex: number | null = null;
let typedChatHistoryPrefix = "";
let tabCompleteWordListIndex: number | null = null;
let tabCompleteWordList: string[] = [];
let tabCompleteOriginalText = "";

export function init(): void {
  $("#lobby-chat-input").on("input", input);
  $("#lobby-chat-input").on("keypress", keypress("lobby"));
  $("#lobby-chat-input").on("keydown", keydown);
  $("#lobby-chat-pregame-input").on("input", input);
  $("#lobby-chat-pregame-input").on("keypress", keypress("table"));
  $("#lobby-chat-pregame-input").on("keydown", keydown);
  $("#game-chat-input").on("input", input);
  $("#game-chat-input").on("keypress", keypress("table"));
  $("#game-chat-input").on("keydown", keydown);

  // Make an emoji list/map and ensure that there are no overlapping emoji
  for (const [emojiName, emoji] of Object.entries(emojis)) {
    if (emojiMap.has(emojiName)) {
      throw new Error(`Duplicate emoji found: ${emojiName}`);
    }
    emojiMap.set(emojiName, emoji);
    emojiList.push(`:${emojiName}:`);
    // (we use surrounding colons since that is the way that emoji are detected)
  }

  // Make an emote list/map and ensure that there are no overlapping emotes
  const emoteMap = new Map(); // The map can be ephemeral
  for (const category of Object.values(emoteCategories)) {
    for (const emoteName of category) {
      if (emoteMap.has(emoteName)) {
        throw new Error(`Duplicate emote found: ${emoteName}`);
      }
      emoteMap.set(emoteName, true);
      emoteList.push(emoteName);
    }
  }

  // Retrieve the contents of the typed chat list from local storage (cookie)
  const typedChatHistoryString = localStorage.getItem("typedChatHistory");
  if (
    typedChatHistoryString !== null &&
    typedChatHistoryString !== "" &&
    typedChatHistoryString !== "[]"
  ) {
    let potentialArray: unknown;
    try {
      potentialArray = JSON.parse(typedChatHistoryString) as unknown;
    } catch (err) {
      return;
    }

    if (Array.isArray(potentialArray)) {
      typedChatHistory = potentialArray as string[];
    }
  }
}

function input(this: HTMLElement, event: JQuery.Event) {
  const element = $(this);
  if (element === undefined) {
    throw new Error("Failed to get the element for the input function.");
  }
  const text = element.val();
  if (typeof text !== "string") {
    throw new Error(
      "The value of the element in the input function is not a string.",
    );
  }

  // If this is a pregame or game input, report to the server that we are typing
  // (but don't spam the server with more than one message a second)
  if (this.id !== "lobby-chat-input") {
    const datetimeNow = new Date().getTime();
    if (datetimeNow - datetimeLastChatInput >= 1000) {
      datetimeLastChatInput = datetimeNow;
      globals.conn!.send("chatTyping", {
        tableID: globals.tableID,
      });
    }
  }

  // /r - A PM reply
  if (text === "/r " && lastPM !== "") {
    element.val(`/pm ${lastPM} `);
    return;
  }

  // /shrug
  if (text === "/shrug") {
    element.val("¯\\_(ツ)_/¯");
    return;
  }

  // Check for emoji substitution
  // e.g. :100: --> 💯
  const matches = text.match(/:[^\s]+:/g); // "[^\s]" is a non-whitespace character
  if (matches !== null) {
    for (const match of matches) {
      const emojiName = match.slice(1, -1); // Strip off the colons

      const emoji = emojiMap.get(emojiName);
      if (emoji !== undefined) {
        const newText = text.replace(match, emoji);
        element.val(newText);
        event.preventDefault();
        return;
      }
    }
  }
}

const keypress = (room: string) =>
  function keypressFunction(this: HTMLElement, event: JQuery.Event) {
    const element = $(this);
    if (element === undefined) {
      throw new Error("Failed to get the element for the keypress function.");
    }

    // We have typed a new character, so reset the tab-complete variables
    tabCompleteWordList = [];
    tabCompleteWordListIndex = null;
    typedChatHistoryIndex = null;

    if (event.which === KeyCode.KEY_RETURN) {
      send(room, element);
    }
  };

function send(room: string, element: JQuery<HTMLElement>) {
  let msg = element.val();
  if (typeof msg !== "string") {
    throw new Error("The value of the element is not a string.");
  }
  msg = msg.trim();

  // Validate that they are accidentally broadcasting a private message reply
  if (msg.startsWith("/r ")) {
    modals.showWarning(
      "No-one has sent you a private message yet, so you cannot reply.",
    );
    return;
  }

  // Clear the chat box
  element.val("");

  sendText(room, msg);
}

export function sendText(room: string, msgRaw: string): void {
  // Validate that they did not send an empty message
  if (msgRaw === "") {
    return;
  }

  if (globals.muted) {
    modals.showWarning("You have been muted by an administrator.");
    return;
  }

  // Emojis are normally replaced before the user presses enter
  // However, if they tab-complete an emoji and then press enter before entering in any other
  // keystrokes, then the non-replaced emoji will be sent over the wire
  // Replace any non-replaced emoji before that happens
  const msg = fillEmojis(msgRaw);

  // Use "startsWith" instead of "===" to work around an bug where
  // the room can already have the table number appended (e.g. "table123")
  let roomID = room;
  if (roomID.startsWith("table")) {
    roomID = `table${globals.tableID}`;
  }

  // Add the chat message to the typed history so that we can use the up arrow later
  // (but only if it isn't in the history already)
  const index = typedChatHistory.indexOf(msg, 0);
  if (index > -1) {
    typedChatHistory.splice(index, 1);
  }
  const newLength = typedChatHistory.unshift(msg);

  // Prevent the typed history from getting too large
  if (newLength > TYPED_HISTORY_MAX_LENGTH) {
    // Pop off the final element
    typedChatHistory.pop();
  }

  // Save the typed chat history to local storage (cookie)
  localStorage.setItem("typedChatHistory", JSON.stringify(typedChatHistory));

  // Reset the typed history index
  typedChatHistoryPrefix = "";
  typedChatHistoryIndex = null;

  // Check for chat commands
  // Each chat command should also have an error handler in "chat_command.go"
  // (in case someone tries to use the command from Discord)
  const args = msg.split(" ");
  if (args[0].startsWith("/")) {
    let command = args.shift();
    if (command === undefined) {
      throw new Error("Failed to parse the command from the chat message.");
    }
    command = command.substring(1); // Remove the forward slash
    command = command.toLowerCase();

    if (!serverSideOnlyCommands.includes(command)) {
      const chatCommandFunction = chatCommands.get(command);
      if (chatCommandFunction === undefined) {
        modals.showWarning(`The chat command of "${command}" is not valid.`);
      } else {
        chatCommandFunction(roomID, args);
      }
      return;
    }
  }

  // This is not a command, so send a the chat message to the server
  globals.conn!.send("chat", {
    msg,
    room: roomID,
  });
}

function keydown(this: HTMLElement, event: JQuery.Event) {
  const element = $(this);
  if (element === undefined) {
    throw new Error("Failed to get the element for the keydown function.");
  }

  // The up and down arrows are only caught in the "keydown" event
  // https://stackoverflow.com/questions/5597060/detecting-arrow-key-presses-in-javascript
  // The tab key is only caught in the "keydown" event because it switches the input focus
  if (event.which === KeyCode.KEY_UP) {
    event.preventDefault();
    arrowUp(element);
  } else if (event.which === KeyCode.KEY_DOWN) {
    event.preventDefault();
    arrowDown(element);
  } else if (event.which === KeyCode.KEY_TAB) {
    event.preventDefault();
    tab(element, event);
  } else if (
    [KeyCode.KEY_BACK_SPACE, KeyCode.KEY_DELETE].indexOf(event.which ?? 0) !==
    -1
  ) {
    typedChatHistoryIndex = null;
  }
}

function historyMatchNext(current: string, increment: number): string | null {
  if (typedChatHistoryIndex === null) {
    if (increment < 0) {
      return null;
    }
    typedChatHistoryIndex = -1;
    typedChatHistoryPrefix = current;
  }
  const oldIndex = typedChatHistoryIndex;
  do {
    typedChatHistoryIndex += increment;
    // Stay within bounds of history
    if (typedChatHistoryIndex >= typedChatHistory.length) {
      typedChatHistoryIndex = oldIndex;
      return current;
    }
    if (typedChatHistoryIndex < 0) {
      typedChatHistoryIndex = -1;
      return typedChatHistoryPrefix;
    }
  } while (
    // Only accept history if it matches prefix
    !typedChatHistory[typedChatHistoryIndex].startsWith(typedChatHistoryPrefix)
  );
  return typedChatHistory[typedChatHistoryIndex];
}

function arrowUp(element: JQuery<HTMLElement>) {
  const retrievedHistory = historyMatchNext(String(element.val() ?? ""), 1);
  // Set the chat input box to what we last typed
  element.val(retrievedHistory ?? "");
}

function arrowDown(element: JQuery<HTMLElement>) {
  const retrievedHistory = historyMatchNext(String(element.val() ?? ""), -1);
  // Set the chat input box to what we last typed
  element.val(retrievedHistory ?? "");
}

function tab(element: JQuery<HTMLElement>, event: JQuery.Event) {
  // Parse the final word from what we have typed so far
  let message = element.val();
  if (typeof message !== "string") {
    message = "";
  }
  message = message.trim(); // Remove all leading and trailing whitespace
  const messageWords = message.split(" ");
  const finalWord = messageWords[messageWords.length - 1];

  // Increment the tab counter
  if (tabCompleteWordListIndex === null) {
    tabInitAutoCompleteList(event, finalWord);
  } else if (event.shiftKey === true) {
    // Shift-tab goes backwards
    tabCompleteWordListIndex -= 1;
    if (tabCompleteWordListIndex === -1) {
      tabCompleteWordListIndex = null;
    }
  } else {
    // Tab goes forwards
    tabCompleteWordListIndex += 1;
    if (tabCompleteWordListIndex === tabCompleteWordList.length) {
      tabCompleteWordListIndex = null;
    }
  }

  if (tabCompleteWordListIndex === null) {
    // We have rotated through all of the possible auto-complete entries
    // (or there are no auto-complete matches for this particular sequence of text),
    // so return the original text
    messageWords[messageWords.length - 1] = tabCompleteOriginalText;
    element.val(messageWords.join(" "));
    return;
  }

  // Replace the final word with the new auto-complete word
  const autoCompleteWord = tabCompleteWordList[tabCompleteWordListIndex];
  messageWords[messageWords.length - 1] = autoCompleteWord;
  element.val(messageWords.join(" "));
}

// This is the first time we are pressing tab on this particular sequence of text
function tabInitAutoCompleteList(event: JQuery.Event, finalWord: string) {
  // Save our current partially-completed word in case we need to cycle back to it later
  tabCompleteOriginalText = finalWord;

  // Make a list of the currently connected users
  const userList = [];
  for (const user of globals.userMap.values()) {
    userList.push(user.name);
  }

  // Combine it with the list of emotes and the list of emoji
  const usersAndEmojisAndEmotesList = userList
    .concat(emojiList)
    .concat(emoteList);
  usersAndEmojisAndEmotesList.sort(
    // We want to do a case-insensitive sort, which will not occur by default
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  fixCustomEmotePriority(usersAndEmojisAndEmotesList);

  // Create a list of all the things that could match what we have typed thus far
  tabCompleteWordList = [];
  for (const word of usersAndEmojisAndEmotesList) {
    const partialWord = word.slice(0, finalWord.length);
    if (partialWord.toLowerCase() === finalWord.toLowerCase()) {
      tabCompleteWordList.push(word);
    }
  }

  // If there were no possible matches, keep the "tabCompleteWordListIndex" as null as return
  if (tabCompleteWordList.length === 0) {
    return;
  }

  // Set the starting index, depending on whether or not we are pressing shift
  if (event.shiftKey === true) {
    // Shift-tab goes backwards
    tabCompleteWordListIndex = tabCompleteWordList.length - 1;
  } else {
    // Tab goes forwards
    tabCompleteWordListIndex = 0;
  }
}

function fixCustomEmotePriority(usersAndEmotesList: string[]) {
  // Prioritize the more commonly used NotLikeThis over NootLikeThis
  const notLikeThisIndex = usersAndEmotesList.indexOf("NotLikeThis");
  const nootLikeThisIndex = usersAndEmotesList.indexOf("NootLikeThis");
  usersAndEmotesList[notLikeThisIndex] = "NootLikeThis";
  usersAndEmotesList[nootLikeThisIndex] = "NotLikeThis";

  // Prioritize the more commonly used Kappa over Kadda
  const kappaIndex = usersAndEmotesList.indexOf("Kappa");
  const kaddaIndex = usersAndEmotesList.indexOf("Kadda");
  usersAndEmotesList[kaddaIndex] = "Kappa";
  usersAndEmotesList[kappaIndex] = "Kadda";

  // Local variables
  let tempEmote1;

  // Prioritize the more commonly used FrankerZ over all the other Franker emotes
  const frankerZIndex = usersAndEmotesList.indexOf("FrankerZ");
  const frankerBIndex = usersAndEmotesList.indexOf("FrankerB");
  tempEmote1 = usersAndEmotesList[frankerBIndex];
  usersAndEmotesList[frankerBIndex] = "FrankerZ";
  for (let i = frankerBIndex; i < frankerZIndex; i++) {
    const tempEmote2 = usersAndEmotesList[i + 1];
    usersAndEmotesList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }

  // Prioritize the more commonly used monkaS over all the other monka emotes
  const monkaSIndex = usersAndEmotesList.indexOf("monkaS");
  const monkaEyesIndex = usersAndEmotesList.indexOf("monkaEyes");
  tempEmote1 = usersAndEmotesList[monkaEyesIndex];
  usersAndEmotesList[monkaEyesIndex] = "monkaS";
  for (let i = monkaEyesIndex; i < monkaSIndex; i++) {
    const tempEmote2 = usersAndEmotesList[i + 1];
    usersAndEmotesList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }
}

export function add(data: ChatMessage, fast: boolean): void {
  // Find out which chat box we should add the new chat message to
  let chat: JQuery<HTMLElement> | undefined;
  if (data.room === "lobby") {
    chat = $("#lobby-chat-text");
  } else if (data.room.startsWith("table")) {
    if (globals.currentScreen === Screen.PreGame) {
      chat = $("#lobby-chat-pregame-text");
    } else if (globals.currentScreen === Screen.Game) {
      chat = $("#game-chat-text");
    } else {
      // Ignore table chat if we are not in a pre-game and not in a game
      return;
    }
  } else if (data.room === "") {
    // A blank room indicates a private message (PM)
    // PMs do not have a room associated with them,
    // so we default to displaying them on the chat window that the user currently has open
    if (data.recipient === globals.username) {
      // This is a private message (PM) that we are receiving
      // Record who our last PM is from
      lastPM = data.who;
    }

    if (globals.currentScreen === Screen.PreGame) {
      chat = $("#lobby-chat-pregame-text");
    } else if (globals.currentScreen === Screen.Game) {
      chat = $("#game-chat-text");
    } else {
      chat = $("#lobby-chat-text");
    }
  } else {
    throw new Error("Failed to parse the room name.");
  }
  if (chat === undefined) {
    throw new Error(
      'Failed to get the chat element in the "chat.add()" function.',
    );
  }

  // Automatically generate links from any URLs that are present in the message
  // (we must use "linkifyjs/html" instead of "linkifyjs/string" because the latter will convert
  // "&gt;" to "&amp;gt;", and the server has already escaped HTML input)
  data.msg = linkifyHtml(data.msg, {
    target: "_blank",
    attributes: {
      rel: "noopener noreferrer",
    },
  });

  // Convert emotes to images
  data.msg = fillDiscordEmotes(data.msg);
  data.msg = fillTwitchEmotes(data.msg);

  // Typescript hasn't implemented the required DateTimeFormat option (hourCycle: h23)
  // So we format the hours manually
  const datetime = `${`0${new Date(data.datetime).getHours()}`.slice(
    -2,
  )}:${`0${new Date(data.datetime).getMinutes()}`.slice(-2)}`;

  let line = `<span id="chat-line-${chatLineNum}" class="${
    fast ? "" : "hidden"
  }">`;
  line += `[${datetime}]&nbsp; `;
  if (data.recipient !== "") {
    if (data.recipient === globals.username) {
      line += `<span class="red">[PM from <strong>${data.who}</strong>]</span>&nbsp; `;
    } else {
      line += `<span class="red">[PM to <strong>${data.recipient}</strong>]</span>&nbsp; `;
    }
  }
  if (
    data.server === true ||
    (data.recipient !== undefined && data.recipient !== "")
  ) {
    line += data.msg;
  } else if (data.who !== "") {
    line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
    line += data.msg;
  } else {
    line += data.msg;
  }
  if (data.server === true && line.includes("[Server Notice]")) {
    line = line.replace(
      "[Server Notice]",
      '<span class="red">[Server Notice]</span>',
    );
  }
  // Replace chat suggestions with anchors which, when clicked, are chat commands
  if (chat.is($("#lobby-chat-pregame-text"))) {
    const regex = /(.*)(@(\/.*)@)(.*)/;
    let match = regex.exec(line);
    while (match !== null) {
      line = `${match[1]}<a href="#" class="suggestion">${match[3]}</a>${match[4]}`;
      match = regex.exec(line);
    }
  }
  line += "</span>";

  // Find out if we should automatically scroll down after adding the new line of chat
  // https://stackoverflow.com/questions/6271237/detecting-when-user-scrolls-to-bottom-of-div-with-jquery
  // If we are already scrolled to the bottom, then it is ok to automatically scroll
  // scrollTop can be a fractional value for some reason.
  // pxEpsilon is an acceptable range defined in pixels e.g. +-2 px
  const pxEpsilon = 2;
  const autoScroll =
    Math.abs(chat[0].clientHeight + chat[0].scrollTop - chat[0].scrollHeight) <
    pxEpsilon;

  // Add the new line and fade it in
  chat.append(line);
  $(`#chat-line-${chatLineNum}`).fadeIn(FADE_TIME).css("display", "block");
  $(`#chat-line-${chatLineNum} a.suggestion`).each((_, el) => {
    const text = el.innerText;
    const chatInput = $("#lobby-chat-pregame-input");
    $(el).on("click", () => {
      chatInput.val(text);
      chatInput.trigger("focus");
    });
  });
  chatLineNum += 1;

  // Automatically scroll down
  if (autoScroll) {
    // From: https://stackoverflow.com/questions/270612/scroll-to-bottom-of-div?rq=1
    // This must be executable asynchronously in order to work properly
    setTimeout(
      (element: HTMLElement) => {
        element.scrollTop = element.scrollHeight;
      },
      0,
      chat[0],
    );
  }

  // Remove the person from the typing list, if present
  const index = globals.peopleTyping.indexOf(data.who);
  if (index !== -1) {
    globals.peopleTyping.splice(index, 1);
    updatePeopleTyping();
  }

  // Handle client-side commands
  const match = /^\/suggest (\d+)$/.exec(data.msg);
  if (match !== null) {
    const segmentString = match[1];
    const segment = parseIntSafe(segmentString);
    if (
      !Number.isNaN(segment) &&
      globals.currentScreen === Screen.Game &&
      globals.ui !== null
    ) {
      globals.ui.suggestTurn(data.who, data.room, segment);
    }
  }
}

// addSelf is used when the client needs to send a chat message to itself
export function addSelf(msg: string, room: string): void {
  add(
    {
      msg,
      who: "",
      discord: false,
      server: true,
      datetime: new Date().toString(),
      room,
      recipient: "",
    },
    false,
  );
}

// Discord emotes are in the form of:
// <:PogChamp:254683883033853954>
function fillDiscordEmotes(message: string) {
  let filledMessed = message;
  while (true) {
    const match = /&lt;:(.+?):(\d+?)&gt;/.exec(filledMessed);
    if (match === null) {
      break;
    }
    const emoteTag = `<img src="https://cdn.discordapp.com/emojis/${match[2]}.png" title="${match[1]}" height="28">`;
    filledMessed = filledMessed.replace(match[0], emoteTag);
  }
  return filledMessed;
}

function fillEmojis(message: string) {
  let filledMessage = message;

  // Search through the text for each emoji
  for (const [emojiName, emoji] of Object.entries(emojis)) {
    const emojiTag = `:${emojiName}:`;
    const index = message.indexOf(emojiTag);
    if (index !== -1) {
      filledMessage = filledMessage.replace(emojiTag, emoji);
    }
  }

  return filledMessage;
}

function fillTwitchEmotes(message: string) {
  let filledMessage = message;

  // Search through the text for each emote
  for (const [category, emotes] of Object.entries(emoteCategories)) {
    for (const emote of emotes) {
      // We don't want to replace the emote if it is followed by a quote,
      // because we don't want to replace Discord emotes
      const index = message.indexOf(emote);
      if (index !== -1 && message[index + emote.length] !== '"') {
        const re = new RegExp(`\\b${emote}\\b`, "g"); // "\b" is a word boundary in regex
        const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${category}/${emote}.png" title="${emote}" />`;
        filledMessage = filledMessage.replace(re, emoteTag);
      }
    }
  }

  // Also handle emotes that have special characters in them
  if (filledMessage.indexOf("&lt;3") !== -1) {
    // The Twitch heart emote
    const emoteTag =
      '<img class="chat-emote" src="/public/img/emotes/other/3.png" title="&lt;3" />';
    const re = new RegExp("&lt;3", "g"); // "\b" won't work with a semicolon
    filledMessage = filledMessage.replace(re, emoteTag);
  }
  if (filledMessage.indexOf("D:") !== -1) {
    // A BetterTwitchTV emote
    const emoteTag =
      '<img class="chat-emote" src="/public/img/emotes/other/D.png" title="D:" />';
    // From: https://stackoverflow.com/questions/4134605/regex-and-the-colon
    const re = new RegExp(/(^|\s)D:(\s|$)/, "g"); // "\b" won't work with a colon
    filledMessage = filledMessage.replace(re, ` ${emoteTag} `); // We have to re-add the spaces
  }

  return filledMessage;
}

export function updatePeopleTyping(): void {
  const chat1 = $("#lobby-chat-pregame-istyping");
  const chat2 = $("#game-chat-istyping");

  if (globals.peopleTyping.length === 0) {
    chat1.html("");
    chat2.html("");
    return;
  }

  let msg;
  if (globals.peopleTyping.length === 1) {
    msg = `<strong>${globals.peopleTyping[0]}</strong> is typing...`;
  } else if (globals.peopleTyping.length === 2) {
    msg = `<strong>${globals.peopleTyping[0]}</strong> and `;
    msg += `<strong>${globals.peopleTyping[1]}</strong> are typing...`;
  } else if (globals.peopleTyping.length === 3) {
    msg = `<strong>${globals.peopleTyping[0]}</strong>, `;
    msg += `<strong>${globals.peopleTyping[1]}</strong>, `;
    msg += `and <strong>${globals.peopleTyping[2]}</strong> are typing...`;
  } else {
    msg = "Several people are typing...";
  }
  chat1.html(msg);
  chat2.html(msg);
}
