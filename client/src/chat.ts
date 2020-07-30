// Users can chat in the lobby, in the pregame, and in a game
// Logic for the game chat box is located separately in "game/chat.ts"

import linkifyHtml from 'linkifyjs/html';
import emojis from '../../data/emojis.json';
import emoteCategories from '../../data/emotes.json';
import chatCommands from './chatCommands';
import { FADE_TIME } from './constants';
import globals from './globals';
import Screen from './lobby/types/Screen';
import { isEmpty } from './misc';
import * as modals from './modals';
import ChatMessage from './types/ChatMessage';

// Variables
const emojiMap = new Map<string, string>();
const emoteList: string[] = [];
let chatLineNum = 1;
let lastPM = '';
let datetimeLastChatInput = new Date().getTime();
const typedChatHistory: string[] = [];
let typedChatHistoryIndex = 0;
let tabCompleteWordListIndex: number | null = null;
let tabCompleteWordList: string[] = [];
let tabCompleteOriginalText = '';

export const init = () => {
  $('#lobby-chat-input').on('input', input);
  $('#lobby-chat-input').on('keypress', keypress('lobby'));
  $('#lobby-chat-input').on('keydown', keydown);
  $('#lobby-chat-pregame-input').on('input', input);
  $('#lobby-chat-pregame-input').on('keypress', keypress('table'));
  $('#lobby-chat-pregame-input').on('keydown', keydown);
  $('#game-chat-input').on('input', input);
  $('#game-chat-input').on('keypress', keypress('table'));
  $('#game-chat-input').on('keydown', keydown);

  // Make an emote list and ensure that there are no overlapping emotes
  const emoteMap = new Map();
  for (const category of Object.values(emoteCategories)) {
    for (const emote of category) {
      if (emoteMap.has(emote)) {
        throw new Error(`Duplicate emote found: ${emote}`);
      } else {
        emoteMap.set(emote, true);
      }
      emoteList.push(emote);
    }
  }

  // Convert the emoji JSON to a map for easy reference
  for (const [emojiName, emoji] of Object.entries(emojis)) {
    emojiMap.set(emojiName, emoji);
  }
};

const input = function input(this: HTMLElement, event: JQuery.Event) {
  const element = $(this);
  if (element === undefined) {
    throw new Error('Failed to get the element for the input function.');
  }
  const text = element.val();
  if (typeof text !== 'string') {
    throw new Error('The value of the element in the input function is not a string.');
  }

  // If this is a pregame or game input, report to the server that we are typing
  // (but don't spam the server with more than one message a second)
  if (this.id !== 'lobby-chat-input') {
    const datetimeNow = new Date().getTime();
    if (datetimeNow - datetimeLastChatInput >= 1000) {
      datetimeLastChatInput = datetimeNow;
      globals.conn!.send('chatTyping', {
        tableID: globals.tableID,
      });
    }
  }

  // /r - A PM reply
  if (text === '/r ' && lastPM !== '') {
    element.val(`/pm ${lastPM} `);
    return;
  }

  // /shrug
  if (text === '/shrug') {
    element.val('¯\\_(ツ)_/¯');
    return;
  }

  // Check for emoji substitution
  // e.g. :100: --> 💯
  const matches = text.match(/:[^\s]+:/g); // "[^\s]" is a non-whitespace character
  if (matches) {
    for (const match of matches) {
      const emojiName = match.slice(1, -1); // Strip off the colons

      const emoji = emojiMap.get(emojiName);
      if (typeof emoji !== 'undefined') {
        const newText = text.replace(match, emoji);
        element.val(newText);
        event.preventDefault();
        return;
      }
    }
  }
};

const keypress = (room: string) => function keypressFunction(
  this: HTMLElement,
  event: JQuery.Event,
) {
  const element = $(this);
  if (element === undefined) {
    throw new Error('Failed to get the element for the keypress function.');
  }

  // We have typed a new character, so reset the tab-complete variables
  tabCompleteWordList = [];
  tabCompleteWordListIndex = null;

  if (event.key === 'Enter') {
    submit(room, element);
  }
};

const submit = (room: string, element: JQuery<HTMLElement>) => {
  const msg = element.val();
  if (isEmpty(msg)) {
    return;
  }
  if (typeof msg !== 'string') {
    throw new Error('The value of the element in the keypress function is not a string.');
  }

  // Validate that they are accidentally broadcasting a private message reply
  if (msg.startsWith('/r ')) {
    modals.warningShow('No-one has sent you a private message yet, so you cannot reply.');
    return;
  }

  // Clear the chat box
  element.val('');

  if (globals.muted) {
    modals.warningShow('You have been muted by an administrator.');
    return;
  }

  // Use "startsWith" instead of "===" to work around an unknown bug where
  // the room can already have the table number appended (e.g. "table123")
  let roomID = room;
  if (roomID.startsWith('table')) {
    roomID = `table${globals.tableID}`;
  }

  // Add the chat message to the typed history so that we can use the up arrow later
  typedChatHistory.unshift(msg);

  // Reset the typed history index
  typedChatHistoryIndex = -1;

  // Check for chat commands
  // Each chat command should also have an error handler in "chat_command.go"
  // (in case someone tries to use the command from Discord)
  const args = msg.split(' ');
  if (args[0].startsWith('/')) {
    let command = args.shift();
    command = command!.substring(1); // Remove the forward slash
    command = command.toLowerCase();

    const chatCommandFunction = chatCommands.get(command);
    if (typeof chatCommandFunction !== 'undefined') {
      chatCommandFunction(roomID, args);
      return;
    }
  }

  // This is not a command, so send a the chat message to the server
  globals.conn!.send('chat', {
    msg,
    room: roomID,
  });
};

const keydown = function keydown(this: HTMLElement, event: JQuery.Event) {
  const element = $(this);
  if (element === undefined) {
    throw new Error('Failed to get the element for the keydown function.');
  }

  // The up and down arrows are only caught in the "keydown" event
  // https://stackoverflow.com/questions/5597060/detecting-arrow-key-presses-in-javascript
  // The tab key is only caught in the "keydown" event because it switches the input focus
  if (event.key === 'ArrowUp') {
    arrowUp(element);
  } else if (event.key === 'ArrowDown') {
    arrowDown(element);
  } else if (event.key === 'Tab') {
    event.preventDefault();
    tab(element, event);
  }
};

export const arrowUp = (element: JQuery<HTMLElement>) => {
  typedChatHistoryIndex += 1;

  // Check to see if we have reached the end of the history list
  if (typedChatHistoryIndex > typedChatHistory.length - 1) {
    typedChatHistoryIndex = typedChatHistory.length - 1;
    return;
  }

  // Set the chat input box to what we last typed
  const retrievedHistory = typedChatHistory[typedChatHistoryIndex];
  element.val(retrievedHistory);
};

export const arrowDown = (element: JQuery<HTMLElement>) => {
  typedChatHistoryIndex -= 1;

  // Check to see if we have reached the beginning of the history list
  // We check for -2 instead of -1 here because we want down arrow to clear the chat
  if (typedChatHistoryIndex <= -2) {
    typedChatHistoryIndex = -1;
    return;
  }

  // Set the chat input box to what we last typed
  const retrievedHistory = typedChatHistory[typedChatHistoryIndex];
  element.val(retrievedHistory);
};

export const tab = (element: JQuery<HTMLElement>, event: JQuery.Event) => {
  // Parse the final word from what we have typed so far
  let message = element.val();
  if (typeof message !== 'string') {
    message = '';
  }
  message = message.trim();
  const messageWords = message.split(' ');
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
    element.val(messageWords.join(' '));
    return;
  }

  // Replace the final word with the new auto-complete word
  const autoCompleteWord = tabCompleteWordList[tabCompleteWordListIndex];
  messageWords[messageWords.length - 1] = autoCompleteWord;
  element.val(messageWords.join(' '));
};

// This is the first time we are pressing tab on this particular sequence of text
const tabInitAutoCompleteList = (event: JQuery.Event, finalWord: string) => {
  // Save our current partially-completed word in case we need to cycle back to it later
  tabCompleteOriginalText = finalWord;

  // Make a list of the currently connected users
  const userList = [];
  for (const user of globals.userMap.values()) {
    userList.push(user.name);
  }

  // Combine it with the list of emotes
  const usersAndEmotesList = userList.concat(emoteList);
  usersAndEmotesList.sort(
    // We want to do a case-insensitive sort, which will not occur by default
    (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  fixCustomEmotePriority(usersAndEmotesList);

  // Create a list of all the things that could match what we have typed thus far
  tabCompleteWordList = [];
  for (const word of usersAndEmotesList) {
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
};

const fixCustomEmotePriority = (usersAndEmotesList: string[]) => {
  // Prioritize the more commonly used NotLikeThis over NootLikeThis
  const notLikeThisIndex = usersAndEmotesList.indexOf('NotLikeThis');
  const nootLikeThisIndex = usersAndEmotesList.indexOf('NootLikeThis');
  usersAndEmotesList[notLikeThisIndex] = 'NootLikeThis';
  usersAndEmotesList[nootLikeThisIndex] = 'NotLikeThis';

  // Prioritize the more commonly used Kappa over Kadda
  const kappaIndex = usersAndEmotesList.indexOf('Kappa');
  const kaddaIndex = usersAndEmotesList.indexOf('Kadda');
  usersAndEmotesList[kaddaIndex] = 'Kappa';
  usersAndEmotesList[kappaIndex] = 'Kadda';

  // Prioritize the more commonly used FrankerZ over all the other Franker emotes
  const frankerZIndex = usersAndEmotesList.indexOf('FrankerZ');
  const frankerBIndex = usersAndEmotesList.indexOf('FrankerB');
  let tempEmote1 = usersAndEmotesList[frankerBIndex];
  usersAndEmotesList[frankerBIndex] = 'FrankerZ';
  for (let i = frankerBIndex; i < frankerZIndex; i++) {
    const tempEmote2 = usersAndEmotesList[i + 1];
    usersAndEmotesList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }

  // Prioritize the more commonly used monkaS over ?
  // TODO
};

export const add = (data: ChatMessage, fast: boolean) => {
  // Find out which chat box we should add the new chat message to
  let chat;
  if (data.recipient === globals.username) {
    // If this is a PM that we are receiving, send it to the appropriate chat box
    // Prefer that PMs that are received while in a pregame are sent to the pregame chat
    if (globals.currentScreen === Screen.Game) {
      chat = $('#game-chat-text');
    } else if (globals.currentScreen === Screen.PreGame) {
      chat = $('#lobby-chat-pregame-text');
    } else {
      chat = $('#lobby-chat-text');
    }

    // Also, record who our last PM is from
    lastPM = data.who;
  } else if (data.room === 'lobby') {
    chat = $('#lobby-chat-text');
  } else if (globals.currentScreen === Screen.PreGame) {
    chat = $('#lobby-chat-pregame-text');
  } else {
    chat = $('#game-chat-text');
  }
  if (chat === undefined) {
    throw new Error('Failed to get the chat element in the "chat.add()" function.');
  }

  // Automatically generate links from any URLs that are present in the message
  data.msg = linkifyHtml(data.msg, {
    target: '_blank',
    attributes: {
      rel: 'noopener noreferrer',
    },
  });

  // Convert emotes to images
  data.msg = fillDiscordEmotes(data.msg);
  data.msg = fillLocalEmotes(data.msg);

  // Get the hours and minutes from the time
  const datetime = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(data.datetime));

  let line = `<span id="chat-line-${chatLineNum}" class="${fast ? '' : 'hidden'}">`;
  line += `[${datetime}]&nbsp; `;
  if (data.recipient !== '') {
    if (data.recipient === globals.username) {
      line += `<span class="red">[PM from <strong>${data.who}</strong>]</span>&nbsp; `;
    } else {
      line += `<span class="red">[PM to <strong>${data.recipient}</strong>]</span>&nbsp; `;
    }
  }
  if (data.server === true || (data.recipient !== undefined && data.recipient !== '')) {
    line += data.msg;
  } else if (data.who) {
    line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
    line += data.msg;
  } else {
    line += data.msg;
  }
  if (data.server === true && line.includes('[Server Notice]')) {
    line = line.replace('[Server Notice]', '<span class="red">[Server Notice]</span>');
  }
  line += '</span><br />';

  // Find out if we should automatically scroll down after adding the new line of chat
  // https://stackoverflow.com/questions/6271237/detecting-when-user-scrolls-to-bottom-of-div-with-jquery
  // If we are already scrolled to the bottom, then it is ok to automatically scroll
  let autoScroll = false;
  const topPositionOfScrollBar = chat.scrollTop() ?? 0;
  const innerHeight = chat.innerHeight() ?? 0;
  if (topPositionOfScrollBar + Math.ceil(innerHeight) >= chat[0].scrollHeight) {
    autoScroll = true;
  }

  // Add the new line and fade it in
  chat.append(line);
  $(`#chat-line-${chatLineNum}`).fadeIn(FADE_TIME);
  chatLineNum += 1;

  // Automatically scroll down
  if (autoScroll) {
    chat.animate({
      scrollTop: chat[0].scrollHeight,
    }, fast ? 0 : 500);
  }

  // Remove the person from the typing list, if present
  const index = globals.peopleTyping.indexOf(data.who);
  if (index !== -1) {
    globals.peopleTyping.splice(index, 1);
    updatePeopleTyping();
  }
};

// Discord emotes are in the form of:
// <:PogChamp:254683883033853954>
const fillDiscordEmotes = (message: string) => {
  let filledMessed = message;
  while (true) {
    const match = filledMessed.match(/&lt;:(.+?):(\d+?)&gt;/);
    if (!match) {
      break;
    }
    const emoteTag = `<img src="https://cdn.discordapp.com/emojis/${match[2]}.png" title="${match[1]}" height="28">`;
    filledMessed = filledMessed.replace(match[0], emoteTag);
  }
  return filledMessed;
};

const fillLocalEmotes = (message: string) => {
  let filledMessage = message;

  // Search through the text for each emote
  for (const [category, emotes] of Object.entries(emoteCategories)) {
    for (const emote of emotes) {
      // We don't want to replace the emote if it is followed by a quote,
      // because we don't want to replace Discord emotes
      const index = message.indexOf(emote);
      if (index !== -1 && message[index + emote.length] !== '"') {
        const re = new RegExp(`\\b${emote}\\b`, 'g'); // "\b" is a word boundary in regex
        const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${category}/${emote}.png" title="${emote}" />`;
        filledMessage = filledMessage.replace(re, emoteTag);
      }
    }
  }

  // Also handle emotes that have special characters in them
  if (filledMessage.indexOf('&lt;3') !== -1) { // The Twitch heart emote
    const emoteTag = '<img class="chat-emote" src="/public/img/emotes/other/3.png" title="&lt;3" />';
    const re = new RegExp('&lt;3', 'g'); // "\b" won't work with a semicolon
    filledMessage = filledMessage.replace(re, emoteTag);
  }
  if (filledMessage.indexOf('D:') !== -1) { // A BetterTwitchTV emote
    const emoteTag = '<img class="chat-emote" src="/public/img/emotes/other/D.png" title="D:" />';
    // From: https://stackoverflow.com/questions/4134605/regex-and-the-colon
    const re = new RegExp(/(^|\s)D:(\s|$)/, 'g'); // "\b" won't work with a colon
    filledMessage = filledMessage.replace(re, ` ${emoteTag} `); // We have to re-add the spaces
  }

  return filledMessage;
};

export const updatePeopleTyping = () => {
  const chat1 = $('#lobby-chat-pregame-istyping');
  const chat2 = $('#game-chat-istyping');

  if (globals.peopleTyping.length === 0) {
    chat1.html('');
    chat2.html('');
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
    msg = 'Several people are typing...';
  }
  chat1.html(msg);
  chat2.html(msg);
};
