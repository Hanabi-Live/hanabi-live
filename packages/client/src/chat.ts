// Users can chat in the lobby, in the pregame, and in a game. Logic for the game chat box is
// located separately in "game/chat.ts".

import type { ServerEventData, TableId } from "@hanabi-live/data";
import {
  CHAT_SPECIAL_EMOTES,
  CHAT_EMOJIS as emojis,
  CHAT_EMOTES as emotes,
  MAX_CHAT_LENGTH,
  PROJECT_NAME,
  tableIdSchema,
  TYPING_TIMEOUT_MS,
} from "@hanabi-live/data";
import { eRange, isArray, trimPrefix } from "complete-common";
import linkifyHtml from "linkify-html";
import { find as linkifyFind } from "linkifyjs";
import { mountEmojiPicker } from "./EmojiPicker.tsx";
import { globals } from "./Globals.ts";
import type { LengthLimit } from "./LengthCounter.tsx";
import {
  countCharacters,
  mountLengthCounter,
  rejectTooLong,
} from "./LengthCounter.tsx";
import { chatCommands } from "./chatCommands.ts";
import { LobbyChatDeletionState } from "./chatDeletion.ts";
import type { SuggestedSettings } from "./chatKind.ts";
import {
  chatAuthor,
  chatAuthorName,
  chatRecipient,
  chatSuggestion,
} from "./chatKind.ts";
import {
  FADE_TIME_MS,
  LOCAL_STORAGE_KEY,
  TYPED_HISTORY_MAX_LENGTH,
} from "./constants.ts";
import {
  lobbyChatLineAdded,
  lobbyChatLineDeleted,
} from "./lobby/chat/lobbyChatSlice.ts";
import { acceptOptionsFromGuest } from "./lobby/createGame.ts";
import {
  pregameChatLineAdded,
  typingStopped,
} from "./lobby/pregame/pregameSlice.ts";
import { Screen } from "./lobby/types/Screen.ts";
import * as modals from "./modals.ts";
import { store } from "./store.ts";
import { getHtmlElement, getHtmlInputElement } from "./utils.ts";

/** Formats chat timestamps as 24-hour "HH:MM" regardless of the browser's locale. */
const chatTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type ChatData = ServerEventData["chat"];

/** The table of a chat room ("lobby" or "table" and the table's ID), or undefined for the lobby. */
function roomTableId(room: string): TableId | undefined {
  const match = /^table(\d+)$/u.exec(room);
  return match === null ? undefined : tableIdSchema.parse(Number(match[1]));
}

export enum SelfChatMessageType {
  Normal,
  Info,
  Error,
}

/**
 * The least time between the typing reports that we send to the server. It is shorter than the
 * server's typing timeout so that the indicator does not flicker while we keep typing.
 */
const TYPING_REPORT_INTERVAL_MS = TYPING_TIMEOUT_MS / 2;

/**
 * The classes of a chat line. The server lists the options that a player proposes as `<span
 * class="cp">` elements, and these put each option on its own indented line.
 */
export const CHAT_LINE_CLASSES = "tw:block tw:[&_.cp]:block tw:[&_.cp]:pl-13";

/** The limit of a chat message, which the server counts after it trims the message. */
export const CHAT_LENGTH_LIMIT = {
  max: MAX_CHAT_LENGTH,
  left: (text) => MAX_CHAT_LENGTH - countCharacters(fillEmojis(text.trim())),
  tooLongText: "Message is too long",
} as const satisfies LengthLimit;

// The heart matches anywhere, but the emotes with colons must be surrounded by whitespace.
const { "<3": HEART_EMOTE_PATH, ...COLON_EMOTE_PATHS } = CHAT_SPECIAL_EMOTES;

const emojiMap = new Map<string, string>();
const emojiList: string[] = [];
const emoteList: string[] = [];
let chatLineNum = 1;
const lobbyChatDeletionState = new LobbyChatDeletionState();
let lastPrivateMessageSender: string | undefined;
let datetimeLastChatInput = Date.now();
let typedChatHistory: string[] = [];
/**
 * The state of browsing the typed history with the arrow keys, or undefined when not browsing.
 * `prefix` is the text typed before browsing started. `index` is the history entry shown, or
 * undefined when `prefix` is shown.
 */
let typedChatHistoryBrowse:
  { readonly prefix: string; index: number | undefined } | undefined;
let tabCompleteWordListIndex: number | undefined;
let tabCompleteWordList: string[] = [];
let tabCompleteOriginalText = "";
let activeChatInput: HTMLInputElement | undefined;
let emojiPickerMounted = false;

export function init(): void {
  const gameChatInput = getHtmlInputElement("#game-chat-input");
  attachChatInput(gameChatInput, "table");
  mountLengthCounter(
    getHtmlElement("#game-chat-length-counter"),
    gameChatInput,
    CHAT_LENGTH_LIMIT,
    true,
  );
  // (The lobby and pre-game chat inputs are React components that attach themselves.)
  $(".emoji-button[data-target]").on("click", (event) => {
    const { target } = event.currentTarget.dataset;
    openEmojiPicker(getHtmlInputElement(`#${target}`));
  });

  // Make an emoji list/map and ensure that there are no overlapping emoji.
  for (const [emojiName, emoji] of Object.entries(emojis)) {
    if (emojiMap.has(emojiName)) {
      throw new Error(`Duplicate emoji found: ${emojiName}`);
    }
    emojiMap.set(emojiName, emoji);
    emojiList.push(`:${emojiName}:`);
    // (We use surrounding colons since that is the way that emoji are detected.)
  }

  // Make an emote list/map and ensure that there are no overlapping emotes.
  const emoteMap = new Map<string, boolean>(); // The map can be ephemeral.
  for (const emotesInCategory of Object.values(emotes)) {
    for (const emoteName of emotesInCategory) {
      if (emoteMap.has(emoteName)) {
        throw new Error(`Duplicate emote found: ${emoteName}`);
      }
      emoteMap.set(emoteName, true);
      emoteList.push(emoteName);
    }
  }

  // Retrieve the contents of the typed chat list from local storage (cookie).
  const typedChatHistoryString = localStorage.getItem(
    LOCAL_STORAGE_KEY.TYPED_CHAT_HISTORY,
  );
  if (
    typedChatHistoryString !== null
    && typedChatHistoryString !== ""
    && typedChatHistoryString !== "[]"
  ) {
    let potentialArray: unknown;
    try {
      potentialArray = JSON.parse(typedChatHistoryString);
    } catch {
      return;
    }

    if (isArray(potentialArray)) {
      typedChatHistory = potentialArray as string[];
    }
  }
}

function pickChatSymbol(text: string) {
  if (activeChatInput) {
    activeChatInput.value += text;
    activeChatInput.focus();
  }
  modals.closeModals();
}

/** Opens the emote and emoji picker, which adds what we pick to a chat input. */
export function openEmojiPicker(chatInput: HTMLInputElement): void {
  activeChatInput = chatInput;
  // Most users never open the picker, so it is drawn when it first opens.
  if (!emojiPickerMounted) {
    mountEmojiPicker(getHtmlElement("#emoji-picker"), pickChatSymbol);
    emojiPickerMounted = true;
  }
  modals.showPrompt("#emoji-modal");
}

/**
 * Handles typing in a chat input: sending, commands, typed history, tab completion, and emoji.
 * Returns a function that removes the handlers.
 */
export function attachChatInput(
  element: HTMLInputElement,
  room: "lobby" | "table",
): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  element.addEventListener(
    "input",
    () => {
      input(element, room);
    },
    { signal },
  );
  element.addEventListener(
    "keypress",
    (event) => {
      // We have typed a new character, so reset the tab-complete variables.
      tabResetAutoCompleteList();
      typedChatHistoryBrowse = undefined;

      if (event.key === "Enter") {
        send(room, element);
      }
    },
    { signal },
  );
  element.addEventListener(
    "keydown",
    (event) => {
      keydown(element, event);
    },
    { signal },
  );

  return () => {
    controller.abort();
  };
}

function input(element: HTMLInputElement, room: "lobby" | "table") {
  const text = element.value;

  // If this is a pregame or game input, report to the server that we are typing. (But do not spam
  // the server with more than one message per interval.)
  if (room !== "lobby") {
    const datetimeNow = Date.now();
    if (datetimeNow - datetimeLastChatInput >= TYPING_REPORT_INTERVAL_MS) {
      datetimeLastChatInput = datetimeNow;
      globals.conn!.send("chatTyping", {
        tableId: globals.joinedTableId,
      });
    }
  }

  // /r - A PM reply.
  if (text === "/r " && lastPrivateMessageSender !== undefined) {
    element.value = `/pm ${lastPrivateMessageSender} `;
    return;
  }

  // /shrug
  if (text === "/shrug") {
    // eslint-disable-next-line complete/require-ascii
    element.value = String.raw`¯\_(ツ)_/¯`;
    return;
  }

  // Check for emoji substitution.
  // eslint-disable-next-line complete/require-ascii
  // e.g. :100: --> 💯
  const newText = substituteEmoji(text);
  if (newText !== undefined) {
    element.value = newText;
  }
}

function send(room: string, element: HTMLInputElement) {
  const msg = element.value.trim();

  // Validate that they are accidentally broadcasting a private message reply.
  if (msg.startsWith("/r ")) {
    modals.showWarning(
      "No-one has sent you a private message yet, so you cannot reply.",
    );
    return;
  }

  // Keep a message that is too long, so that the player can shorten it.
  if (rejectTooLong(element, CHAT_LENGTH_LIMIT)) {
    return;
  }

  // Clear the chat box.
  element.value = "";

  sendText(room, msg);
}

function sendText(room: string, msgRaw: string) {
  // Validate that they did not send an empty message.
  if (msgRaw === "") {
    return;
  }

  if (globals.muted) {
    modals.showWarning("You have been muted by an administrator.");
    return;
  }

  // Emojis are normally replaced before the user presses enter. However, if they tab-complete an
  // emoji and then press enter before entering in any other keystrokes, then the non-replaced emoji
  // will be sent over the wire. Replace any non-replaced emoji before that happens.
  const msg = fillEmojis(msgRaw);

  // Use "startsWith" instead of "===" to work around an bug where the room can already have the
  // table number appended (e.g. "table123").
  let roomId = room;
  if (roomId.startsWith("table")) {
    roomId = `table${globals.joinedTableId}`;
  }

  // Add the chat message to the typed history so that we can use the up arrow later. (But only if
  // it isn't in the history already.)
  const index = typedChatHistory.indexOf(msg);
  if (index !== -1) {
    typedChatHistory.splice(index, 1);
  }
  typedChatHistory.unshift(msg);

  // Prevent the typed history from getting too large.
  if (typedChatHistory.length > TYPED_HISTORY_MAX_LENGTH) {
    // Pop off the final element.
    typedChatHistory.pop();
  }

  // Save the typed chat history to local storage (cookie).
  localStorage.setItem(
    LOCAL_STORAGE_KEY.TYPED_CHAT_HISTORY,
    JSON.stringify(typedChatHistory),
  );

  // Stop browsing the typed history.
  typedChatHistoryBrowse = undefined;

  // Check for chat commands.
  const args = msg.split(" ");
  const firstArg = args[0];
  if (firstArg !== undefined && firstArg.startsWith("/")) {
    const command = trimPrefix(firstArg, "/").toLowerCase();
    args.shift(); // Remove the command from the rest of the arguments.

    const chatCommandFunction = chatCommands.get(command);
    if (chatCommandFunction !== undefined) {
      chatCommandFunction(roomId, args);
      return;
    }
  }

  // This is not a command, so send a the chat message to the server.
  const tableId = roomTableId(roomId);
  globals.conn!.send("chat", {
    text: msg,
    ...(tableId !== undefined && { tableId }),
  });
}

function keydown(element: HTMLInputElement, event: KeyboardEvent) {
  // The up and down arrows are only caught in the "keydown" event:
  // https://stackoverflow.com/questions/5597060/detecting-arrow-key-presses-in-javascript
  // The tab key is only caught in the "keydown" event because it switches the input focus.
  switch (event.key) {
    case "Backspace":
    case "Delete": {
      typedChatHistoryBrowse = undefined;
      break;
    }

    case "Tab": {
      event.preventDefault();
      tab(element, event.shiftKey);
      break;
    }

    case "ArrowUp": {
      event.preventDefault();
      arrowUp(element);
      break;
    }

    case "ArrowDown": {
      event.preventDefault();
      arrowDown(element);
      break;
    }

    default: {
      break;
    }
  }
}

/**
 * Moves to the next older or newer history entry that starts with the text typed before browsing.
 * Returns the text to show, or undefined when moving newer without browsing.
 */
function historyMatchNext(current: string, older: boolean): string | undefined {
  if (typedChatHistoryBrowse === undefined) {
    if (!older) {
      return undefined;
    }
    typedChatHistoryBrowse = { prefix: current, index: undefined };
  }
  const browse = typedChatHistoryBrowse;

  if (older) {
    const start = browse.index === undefined ? 0 : browse.index + 1;
    for (let index = start; index < typedChatHistory.length; index++) {
      if (typedChatHistory[index]!.startsWith(browse.prefix)) {
        browse.index = index;
        return typedChatHistory[index]!;
      }
    }

    // There is no older match, so keep showing the current entry.
    return current;
  }

  if (browse.index !== undefined) {
    for (let index = browse.index - 1; index >= 0; index--) {
      if (typedChatHistory[index]!.startsWith(browse.prefix)) {
        browse.index = index;
        return typedChatHistory[index]!;
      }
    }
  }

  // There is no newer match, so go back to what was typed.
  browse.index = undefined;
  return browse.prefix;
}

function arrowUp(element: HTMLInputElement) {
  const retrievedHistory = historyMatchNext(element.value, true);
  // Set the chat input box to what we last typed.
  element.value = retrievedHistory ?? "";
}

function arrowDown(element: HTMLInputElement) {
  const retrievedHistory = historyMatchNext(element.value, false);
  // Set the chat input box to what we last typed.
  element.value = retrievedHistory ?? "";
}

/** Completes the final word of a text box. Shift-tab goes backwards through the matches. */
export function tab(element: HTMLInputElement, shiftKey: boolean): void {
  // Parse the final word from what we have typed so far.
  const message = element.value.trim();
  const messageWords = message.split(" ");
  const finalWord = messageWords.at(-1)!;

  // Increment the tab counter.
  if (tabCompleteWordListIndex === undefined) {
    tabInitAutoCompleteList(shiftKey, finalWord);
  } else if (shiftKey) {
    // Shift-tab goes backwards.
    tabCompleteWordListIndex =
      tabCompleteWordListIndex === 0 ? undefined : tabCompleteWordListIndex - 1;
  } else {
    // Tab goes forwards.
    tabCompleteWordListIndex++;
    if (tabCompleteWordListIndex === tabCompleteWordList.length) {
      tabCompleteWordListIndex = undefined;
    }
  }

  if (tabCompleteWordListIndex === undefined) {
    // We have rotated through all of the possible auto-complete entries (or there are no
    // auto-complete matches for this particular sequence of text), so return the original text.
    messageWords[messageWords.length - 1] = tabCompleteOriginalText;
    element.value = messageWords.join(" ");
    return;
  }

  // Replace the final word with the new auto-complete word.
  const autoCompleteWord = tabCompleteWordList[tabCompleteWordListIndex]!;
  messageWords[messageWords.length - 1] = autoCompleteWord;
  element.value = messageWords.join(" ");
}

/** This is the first time we are pressing tab on this particular sequence of text. */
function tabInitAutoCompleteList(shiftKey: boolean, finalWord: string) {
  // Save our current partially-completed word in case we need to cycle back to it later.
  tabCompleteOriginalText = finalWord;

  // Make a list of the currently connected users.
  const userList: string[] = Array.from(
    globals.userMap.values(),
    (user) => user.username,
  );

  // Combine it with the list of emotes and the list of emoji.
  const usersAndEmojisAndEmotesList = [...userList, ...emojiList, ...emoteList];
  usersAndEmojisAndEmotesList.sort(
    // We want to do a case-insensitive sort, which will not occur by default.
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  fixCustomEmotePriority(usersAndEmojisAndEmotesList);

  // Create a list of all the things that could match what we have typed thus far.
  tabCompleteWordList = [];
  for (const word of usersAndEmojisAndEmotesList) {
    const partialWord = word.slice(0, finalWord.length);
    if (partialWord.toLowerCase() === finalWord.toLowerCase()) {
      tabCompleteWordList.push(word);
    }
  }

  // If there were no possible matches, keep the "tabCompleteWordListIndex" as undefined as return.
  if (tabCompleteWordList.length === 0) {
    return;
  }

  // Set the starting index, depending on whether or not we are pressing shift:
  // - Shift-tab goes backwards.
  // - Tab goes forwards.
  tabCompleteWordListIndex = shiftKey ? tabCompleteWordList.length - 1 : 0;
}

export function tabResetAutoCompleteList(): void {
  tabCompleteWordList = [];
  tabCompleteWordListIndex = undefined;
}

// eslint-disable-next-line complete/prefer-readonly-parameter-types
function fixCustomEmotePriority(usersAndEmotesList: string[]) {
  // Prioritize the more commonly used NotLikeThis over NootLikeThis.
  const notLikeThisIndex = usersAndEmotesList.indexOf("NotLikeThis");
  const nootLikeThisIndex = usersAndEmotesList.indexOf("NootLikeThis");
  usersAndEmotesList[notLikeThisIndex] = "NootLikeThis";
  usersAndEmotesList[nootLikeThisIndex] = "NotLikeThis";

  // Prioritize the more commonly used Kappa over Kadda.
  const kappaIndex = usersAndEmotesList.indexOf("Kappa");
  const kaddaIndex = usersAndEmotesList.indexOf("Kadda");
  usersAndEmotesList[kaddaIndex] = "Kappa";
  usersAndEmotesList[kappaIndex] = "Kadda";

  let tempEmote1: string;

  // Prioritize the more commonly used FrankerZ over all the other Franker emotes.
  const frankerBIndex = usersAndEmotesList.indexOf("FrankerB");
  const frankerZIndex = usersAndEmotesList.indexOf("FrankerZ");
  tempEmote1 = usersAndEmotesList[frankerBIndex]!;
  usersAndEmotesList[frankerBIndex] = "FrankerZ";
  for (const i of eRange(frankerBIndex, frankerZIndex)) {
    const tempEmote2 = usersAndEmotesList[i + 1]!;
    usersAndEmotesList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }

  // Prioritize the more commonly used monkaS over all the other monka emotes.
  const monkaEyesIndex = usersAndEmotesList.indexOf("monkaEyes");
  const monkaSIndex = usersAndEmotesList.indexOf("monkaS");
  tempEmote1 = usersAndEmotesList[monkaEyesIndex]!;
  usersAndEmotesList[monkaEyesIndex] = "monkaS";
  for (const i of eRange(monkaEyesIndex, monkaSIndex)) {
    const tempEmote2 = usersAndEmotesList[i + 1]!;
    usersAndEmotesList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }
}

/**
 * Return the HTML-safe version of plain text input (usually a message author name, because the
 * server takes care of message content HTML processing).
 *
 * If `payload` is undefined, returns the empty string.
 */
function textToHtml(payload?: string): string {
  const sanEl = document.createElement("span");
  if (payload !== undefined) {
    sanEl.textContent = payload;
  }
  return sanEl.innerHTML;
}

export function add(data: ChatData, fast: boolean): void {
  addInternal(data, fast, true);
}

export function removeDeletedLobbyMessage(chatId: number): void {
  // Retain recent deletions so a late live message or chatList cannot revive one.
  lobbyChatDeletionState.markDeleted(chatId);
  store.dispatch(lobbyChatLineDeleted(chatId));
}

/** Shows the private messages that a "/pmhistory" command asked for. */
export function showPmHistory(messages: readonly ChatData[]): void {
  if (messages.length === 0) {
    // A private notice outside of a table shows in the chat that the user has open.
    sendSelfPmFromServer(
      "No private messages found.",
      "lobby",
      SelfChatMessageType.Info,
    );
    return;
  }

  for (const message of messages) {
    addInternal(message, true, false);
  }
}

function addInternal(data: ChatData, fast: boolean, updateLiveState: boolean) {
  if (lobbyChatDeletionState.shouldSkipMessage(data.tableId, data.chatId)) {
    return;
  }

  // If we are receiving a private message (PM), record who it is from.
  const author = chatAuthor(data);
  const authorName = chatAuthorName(data);
  const recipient = chatRecipient(data);
  const suggestion = chatSuggestion(data);
  if (
    updateLiveState
    && author.type === "user"
    && recipient === globals.username
  ) {
    lastPrivateMessageSender = author.username;
  }

  const box = getChatBox(data);
  if (box === undefined) {
    return;
  }

  let rawMsg = data.text;
  // Replace chat suggestions with anchors which, when clicked, are chat commands.
  if (box === "pregame") {
    rawMsg = mapTextSegments(rawMsg, fillChatSuggestions);
  }
  const html = formatChatLine(data, getPreparedMessage(rawMsg));

  const key = chatLineNum;
  chatLineNum++;
  switch (box) {
    case "lobby": {
      store.dispatch(
        lobbyChatLineAdded({
          key,
          ...(data.tableId === undefined
            && data.chatId !== undefined && { chatId: data.chatId }),
          html,
          fadeIn: !fast,
        }),
      );
      break;
    }

    case "pregame": {
      store.dispatch(
        pregameChatLineAdded({
          key,
          html,
          fadeIn: !fast,
          ...(suggestion !== undefined && { suggestion }),
        }),
      );
      break;
    }

    case "game": {
      appendGameChatLine(key, html, fast, suggestion);
      break;
    }
  }

  // Remove the person from the typing list, if present.
  if (
    updateLiveState
    && authorName !== undefined
    && store.getState().pregame.typing.includes(authorName)
  ) {
    store.dispatch(typingStopped(authorName));
    updatePeopleTyping();
  }
}

/** Returns the HTML of a chat line: its time, its author, and the prepared message. */
function formatChatLine(data: ChatData, msg: string): string {
  const datetime = chatTimeFormatter.format(new Date(data.sentAt));

  const authorName = chatAuthorName(data);
  const recipient = chatRecipient(data);
  const fromServer = chatAuthor(data).type === "server";
  let line = `[${datetime}]&nbsp; `;
  if (recipient !== undefined) {
    line +=
      recipient === globals.username
        ? `<span class="red">[PM from <strong>${textToHtml(authorName ?? PROJECT_NAME)}</strong>]</span>&nbsp; `
        : `<span class="red">[PM to <strong>${textToHtml(recipient)}</strong>]</span>&nbsp; `;
  }
  if (fromServer || recipient !== undefined || authorName === undefined) {
    line += msg;
  } else {
    line += `&lt;<strong>${textToHtml(authorName)}</strong>&gt;&nbsp; `;
    line += msg;
  }
  if (fromServer && line.includes("[Server Notice]")) {
    line = line.replace(
      "[Server Notice]",
      '<span class="red">[Server Notice]</span>',
    );
  }

  return line;
}

/** Adds a line to the game chat. */
function appendGameChatLine(
  key: number,
  html: string,
  fast: boolean,
  suggestion: SuggestedSettings | undefined,
) {
  const chat = $("#game-chat-text");
  // Find out if we should automatically scroll down after adding the new line of chat:
  // https://stackoverflow.com/questions/6271237/detecting-when-user-scrolls-to-bottom-of-div-with-jquery
  // If we are already scrolled to the bottom, then it is ok to automatically scroll. scrollTop can
  // be a fractional value for some reason. pxEpsilon is an acceptable range defined in pixels (e.g.
  // +-2 px).
  const pxEpsilon = 2;
  const firstChat = chat[0]!;
  const autoScroll =
    Math.abs(
      firstChat.clientHeight + firstChat.scrollTop - firstChat.scrollHeight,
    ) < pxEpsilon;

  // Add the new line and fade it in.
  chat.append(
    `<span id="chat-line-${key}" class="${CHAT_LINE_CLASSES}${fast ? "" : " hidden"}">${html}</span>`,
  );
  $(`#chat-line-${key}`).fadeIn(FADE_TIME_MS).css("display", "block");
  if (suggestion !== undefined) {
    $(`#chat-line-${key} button.new-options`).on("click", (event) => {
      acceptOptionsFromGuest(suggestion);
      $(event.currentTarget).text("sent").prop("disabled", true);
    });
  }

  // Automatically scroll down.
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
}

/** Finds out which chat box we should add the new chat message to. */
function getChatBox(data: ChatData): "lobby" | "pregame" | "game" | undefined {
  // A private message (PM) or private notice outside of a table has no room, so we display it on
  // the chat window that the user currently has open.
  const isPm = data.tableId === undefined && chatRecipient(data) !== undefined;
  if (data.tableId === undefined && !isPm) {
    return "lobby";
  }

  if (globals.currentScreen === Screen.PreGame) {
    return "pregame";
  }

  if (globals.currentScreen === Screen.Game) {
    return "game";
  }

  // Ignore table chat if we are not in a pre-game and not in a game.
  return isPm ? "lobby" : undefined;
}

/**
 * Apply a transformation to the text portions of an HTML string, leaving tags untouched. (Splitting
 * with a capture group makes the segments alternate: even indexes are text and odds indexes are
 * tags.)
 *
 * This is necessary so that a transformation based on regex replacement can never match across
 * existing markup (which would corrupt the markup and allow user-controlled text to escape into
 * attribute position).
 *
 * WARNING: The splitting regex is not a general HTML tokenizer; a ">" inside of a quoted attribute
 * value would be misclassified. It is only sound because of the input contract of
 * `getPreparedMessage`: any tags present are either trusted markup whose attribute values never
 * contain raw angle brackets (built by the server or by `sendSelfPmFromServer`) or generated by
 * `fillDiscordEmotes` (whose interpolated values are restricted to word characters). Do not reuse
 * this function on arbitrary HTML (e.g. the output of `linkifyHtml`, whose "href" value contain
 * user-influenced URLs).
 */
function mapTextSegments(
  html: string,
  transform: (text: string) => string,
): string {
  const segments = html.split(/(<[^<>]*>)/u);
  for (let i = 0; i < segments.length; i += 2) {
    segments[i] = transform(segments[i]!);
  }
  return segments.join("");
}

/**
 * Add links, Discord emotes, and Twitch emotes.
 *
 * The input must already be safe to render as HTML; this function preserves that safety but cannot
 * create it. Specifically, all user text must already be HTML-escaped, and any tags must be trusted
 * markup whose attribute values never contain raw angle brackets (e.g. the links in server
 * messages).
 */
export function getPreparedMessage(rawMsg: string): string {
  let msg = mapTextSegments(rawMsg, fillDiscordEmotes);
  msg = mapTextSegments(msg, fillTwitchEmotes);

  // Automatically generate links from any URLs that are present in the message. (We must use
  // "linkifyjs/html" instead of "linkifyjs/string" because the latter will convert "&gt;" to
  // "&amp;gt;", and the server has already escaped HTML input.)
  msg = linkifyHtml(msg, {
    target: "_blank",
    attributes: {
      rel: "noopener noreferrer",
    },
  });

  return msg;
}

// Chat suggestions are in the form of: @/command@
function fillChatSuggestions(text: string): string {
  const linkSpans = linkifyFind(text);

  return text.replaceAll(
    /@(\/[^@]*)@/gu,
    (fullMatch, command: string, offset: number) => {
      const insideLink = linkSpans.some(
        (span) => offset < span.end && offset + fullMatch.length > span.start,
      );
      return insideLink
        ? fullMatch
        : `<a href="#" class="suggestion">${command}</a>`;
    },
  );
}

// Discord emotes are in the form of: <:PogChamp:254683883033853954>
function fillDiscordEmotes(message: string) {
  return message.replaceAll(
    /&lt;:(\w+):(\d+)&gt;/gu,
    (_fullMatch, name: string, id: string) =>
      `<img class="chat-emote" src="https://cdn.discordapp.com/emojis/${id}.png" title="${name}" />`,
  );
}

export function fillEmojis(message: string): string {
  let filledMessage = message;

  // Search through the text for each emoji.
  for (const [emojiName, emoji] of Object.entries(emojis)) {
    const emojiTag = `:${emojiName}:`;
    const index = message.indexOf(emojiTag);
    if (index !== -1) {
      filledMessage = filledMessage.replace(emojiTag, emoji);
    }
  }

  return filledMessage;
}

export function substituteEmoji(text: string): string | undefined {
  const matches = text.match(/:\S+:/gu); // "\S" is a non-whitespace character.
  if (matches === null) {
    return undefined;
  }

  for (const match of matches) {
    const emojiName = match.slice(1, -1); // Strip off the colons
    const emoji = emojiMap.get(emojiName);
    if (emoji !== undefined) {
      const newText = text.replace(match, emoji);
      return newText;
    }
  }

  return undefined;
}

function fillTwitchEmotes(message: string) {
  let filledMessage = message;

  // Search through the text for each emote.
  for (const [categoryName, emotesInCategory] of Object.entries(emotes)) {
    const emoteArray = [...emotesInCategory];
    for (const emote of emoteArray) {
      if (message.includes(emote)) {
        const re = new RegExp(String.raw`\b${emote}\b`, "g"); // "\b" is a word boundary in regex.
        const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${categoryName}/${emote}.png" title="${emote}" />`;
        filledMessage = filledMessage.replace(re, emoteTag);
      }
    }
  }

  // Also handle emotes that have special characters in them.
  if (filledMessage.includes("&lt;3")) {
    // The Twitch heart emote.
    const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${HEART_EMOTE_PATH}.png" title="&lt;3" />`;
    const re = /&lt;3/gu; // "\b" won't work with a semicolon.
    filledMessage = filledMessage.replaceAll(re, emoteTag);
  }
  for (const [code, emotePath] of Object.entries(COLON_EMOTE_PATHS)) {
    if (filledMessage.includes(code)) {
      const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${emotePath}.png" title="${code}" />`;
      // "\b" won't work with a colon, so the emote must be surrounded by whitespace instead.
      const re = new RegExp(String.raw`(?<=^|\s)${code}(?=\s|$)`, "gu");
      filledMessage = filledMessage.replaceAll(re, emoteTag);
    }
  }

  return filledMessage;
}

/** Shows who is typing in the game chat. (The pre-game chat shows them by itself.) */
export function updatePeopleTyping(): void {
  $("#game-chat-istyping").html(
    getTypingMessage(store.getState().pregame.typing),
  );
}

/** Returns the HTML that says who is typing. */
export function getTypingMessage(typing: readonly string[]): string {
  switch (typing.length) {
    case 0: {
      return "";
    }

    case 1: {
      return `<strong>${textToHtml(typing[0])}</strong> is typing...`;
    }

    case 2: {
      return `<strong>${textToHtml(typing[0])}</strong> and <strong>${textToHtml(typing[1])}</strong> are typing...`;
    }

    case 3: {
      return `<strong>${textToHtml(typing[0])}</strong>, <strong>${textToHtml(typing[1])}</strong>, and <strong>${textToHtml(typing[2])}</strong> are typing...`;
    }

    default: {
      return "Several people are typing...";
    }
  }
}

// This is used when the client needs to send a chat message to itself.
export function sendSelfPmFromServer(
  msg: string,
  room: string,
  type = SelfChatMessageType.Normal,
): void {
  const message = formatChatMessage(msg, type);
  add(
    {
      text: message,
      sentAt: new Date().toISOString(),
      ...(roomTableId(room) !== undefined && { tableId: roomTableId(room) }),
      kind: {
        type: "private",
        author: { type: "server" },
        recipient: globals.username,
      },
    },
    false,
  );
}

function formatChatMessage(msg: string, type: SelfChatMessageType): string {
  switch (type) {
    case SelfChatMessageType.Normal: {
      return msg;
    }

    case SelfChatMessageType.Info: {
      return `<span class="green">${msg}</span>`;
    }

    case SelfChatMessageType.Error: {
      return `<span class="red">${msg}</span>`;
    }
  }
}
