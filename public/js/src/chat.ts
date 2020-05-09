// Users can chat in the lobby, in the pregame, and in a game
// Logic for the game chat box is located separately in "game/chat.ts"

// Imports
import linkifyHtml from 'linkifyjs/html';
import ChatMessage from './ChatMessage';
import { FADE_TIME } from './constants';
import emojis from './data/emojis.json';
import emoteCategories from './data/emotes.json';
import globals from './globals';
import * as modals from './modals';

// Variables
const emojiMap = new Map();
const emoteList: string[] = [];
let chatLineNum = 1;

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
  if (!element) {
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
    if (datetimeNow - globals.datetimeLastChatInput >= 1000) {
      globals.datetimeLastChatInput = datetimeNow;
      globals.conn!.send('chatTyping', {
        tableID: globals.tableID,
      });
    }
  }

  // Check for a PM reply
  if (text === '/r ' && globals.lastPM !== '') {
    element.val(`/pm ${globals.lastPM} `);
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
  if (!element) {
    throw new Error('Failed to get the element for the keypress function.');
  }

  if (event.key === 'Enter') {
    submit(room, element);
  }
};

const submit = (room: string, element: JQuery<HTMLElement>) => {
  const msg = element.val();
  if (!msg) {
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
  if (room.startsWith('table')) {
    room = `table${globals.tableID}`;
  }

  // Add the chat message to the typed history so that we can use the up arrow later
  globals.typedChatHistory.unshift(msg);

  // Reset the typed history index
  globals.typedChatHistoryIndex = -1;

  // Check for chat commands
  const args = msg.split(' ');
  if (args[0].startsWith('/')) {
    let command = args.shift();
    command = command!.substring(1); // Remove the forward slash

    if (command === 'pm' || command === 'w' || command === 'whisper' || command === 'msg') {
      // Validate that the format of the command is correct
      if (args.length < 2) {
        modals.warningShow('The format of a private message is: <code>/w Alice hello</code>');
        return;
      }

      let recipient = args[0];
      args.shift(); // Remove the recipient

      // Validate that they are not sending a private message to themselves
      if (recipient.toLowerCase() === globals.username.toLowerCase()) {
        modals.warningShow('You cannot send a private message to yourself.');
        return;
      }

      // Validate that the receipient is online
      let isOnline = false;
      for (const user of globals.userMap.values()) {
        if (user.name.toLowerCase() === recipient.toLowerCase()) {
          isOnline = true;

          // Overwrite the recipient in case the user capitalized the username wrong
          recipient = user.name;

          break;
        }
      }
      if (!isOnline) {
        modals.warningShow(`User "${recipient}" is not currently online.`);
        return;
      }

      globals.conn!.send('chatPM', {
        msg: args.join(' '),
        recipient,
        room,
      });
      return;
    }

    if (command === 'friend') {
      // Validate that the format of the command is correct
      if (args.length < 1) {
        modals.warningShow('The format of the /friend command is: <code>/friend Alice</code>');
        return;
      }

      globals.conn!.send('chatFriend', {
        name: args.join(' '),
      });
      return;
    }

    if (command === 'unfriend') {
      // Validate that the format of the command is correct
      if (args.length < 1) {
        modals.warningShow('The format of the /unfriend command is: <code>/unfriend Alice</code>');
        return;
      }

      globals.conn!.send('chatUnfriend', {
        name: args.join(' '),
      });
      return;
    }

    if (command === 'version') {
      add({
        msg: `You are running version <strong>${globals.version}</strong> of the Hanabi Live client.`,
        who: '',
        server: true,
        datetime: new Date().getTime(),
        room,
        recipient: '', // This is needed to prevent the message from being viewed as a PM
      }, false);
      return;
    }
  }

  // This is not a command, so send a the chat message to the server
  globals.conn!.send('chat', {
    msg,
    room,
  });
};

const keydown = function keydown(this: HTMLElement, event: JQuery.Event) {
  const element = $(this);
  if (!element) {
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
    tab(element);
  }
};

export const arrowUp = (element: JQuery<HTMLElement>) => {
  globals.typedChatHistoryIndex += 1;

  // Check to see if we have reached the end of the history list
  if (globals.typedChatHistoryIndex > globals.typedChatHistory.length - 1) {
    globals.typedChatHistoryIndex = globals.typedChatHistory.length - 1;
    return;
  }

  // Set the chat input box to what we last typed
  const retrievedHistory = globals.typedChatHistory[globals.typedChatHistoryIndex];
  element.val(retrievedHistory);
};

export const arrowDown = (element: JQuery<HTMLElement>) => {
  globals.typedChatHistoryIndex -= 1;

  // Check to see if we have reached the beginning of the history list
  // We check for -2 instead of -1 here because we want down arrow to clear the chat
  if (globals.typedChatHistoryIndex <= -2) {
    globals.typedChatHistoryIndex = -1;
    return;
  }

  // Set the chat input box to what we last typed
  const retrievedHistory = globals.typedChatHistory[globals.typedChatHistoryIndex];
  element.val(retrievedHistory);
};

export const tab = (element: JQuery<HTMLElement>) => {
  // Make a list of the currently connected users
  const userList = [];
  for (const user of globals.userMap.values()) {
    userList.push(user.name);
  }

  // We want to be able to tab complete both users and emotes
  const tabList = userList.concat(emoteList);
  tabList.sort();

  // Prioritize the more commonly used NotLikeThis over NootLikeThis
  const notLikeThisIndex = tabList.indexOf('NotLikeThis');
  const nootLikeThisIndex = tabList.indexOf('NootLikeThis');
  tabList[notLikeThisIndex] = 'NootLikeThis';
  tabList[nootLikeThisIndex] = 'NotLikeThis';

  // Prioritize the more commonly used Kappa over Kadda
  const kappaIndex = tabList.indexOf('Kappa');
  const kaddaIndex = tabList.indexOf('Kadda');
  tabList[kaddaIndex] = 'Kappa';
  tabList[kappaIndex] = 'Kadda';

  // Prioritize the more commonly used FrankerZ over all the other Franker emotes
  const frankerZIndex = tabList.indexOf('FrankerZ');
  const frankerBIndex = tabList.indexOf('FrankerB');
  let tempEmote1 = tabList[frankerBIndex];
  tabList[frankerBIndex] = 'FrankerZ';
  for (let i = frankerBIndex; i < frankerZIndex; i++) {
    const tempEmote2 = tabList[i + 1];
    tabList[i + 1] = tempEmote1;
    tempEmote1 = tempEmote2;
  }

  if (globals.tabCompleteCounter === 0) {
    // This is the first time we are pressing tab
    let message = element.val();
    if (typeof message !== 'string') {
      message = '';
    }
    message = message.trim();

    globals.tabCompleteWordList = message.split(' ');
    const messageEnd = globals.tabCompleteWordList[globals.tabCompleteWordList.length - 1];
    for (let i = 0; i < tabList.length; i++) {
      const tabWord = tabList[i];
      const temp = tabWord.slice(0, messageEnd.length).toLowerCase();
      if (temp === messageEnd.toLowerCase()) {
        globals.tabCompleteIndex = i;
        globals.tabCompleteCounter += 1;
        let newMessage = '';
        for (let j = 0; j < globals.tabCompleteWordList.length - 1; j++) {
          newMessage += globals.tabCompleteWordList[j];
          newMessage += ' ';
        }
        newMessage += tabWord;
        element.val(newMessage);
        break;
      }
    }
  } else {
    // We have already pressed tab once, so we need to cycle through the rest of the
    // autocompletion words
    let index = globals.tabCompleteCounter + globals.tabCompleteIndex;
    const messageEnd = globals.tabCompleteWordList[globals.tabCompleteWordList.length - 1];
    if (globals.tabCompleteCounter >= tabList.length) {
      globals.tabCompleteCounter = 0;
      element.val(messageEnd);
      index = globals.tabCompleteCounter + globals.tabCompleteIndex;
    }
    const tempSlice = tabList[index].slice(0, messageEnd.length).toLowerCase();
    if (tempSlice === messageEnd.toLowerCase()) {
      globals.tabCompleteCounter += 1;
      let newMessage = '';
      for (let i = 0; i < globals.tabCompleteWordList.length - 1; i++) {
        newMessage += globals.tabCompleteWordList[i];
        newMessage += ' ';
      }
      newMessage += tabList[index];
      element.val(newMessage);
    } else {
      globals.tabCompleteCounter = 0;
      let newMessage = '';
      for (let i = 0; i < globals.tabCompleteWordList.length - 1; i++) {
        newMessage += globals.tabCompleteWordList[i];
        newMessage += ' ';
      }
      newMessage += messageEnd;
      element.val(newMessage);
    }
  }
};

export const add = (data: ChatMessage, fast: boolean) => {
  // Find out which chat box we should add the new chat message to
  let chat;
  if (data.recipient === globals.username) {
    // If this is a PM that we are receiving,
    // we want it to always go to either the lobby chat or the game chat
    if (globals.currentScreen === 'game') {
      chat = $('#game-chat-text');
    } else {
      chat = $('#lobby-chat-text');
    }

    // Also, record who our last PM is from
    globals.lastPM = data.who;
  } else if (data.room === 'lobby') {
    chat = $('#lobby-chat-text');
  } else if (globals.currentScreen === 'pregame') {
    chat = $('#lobby-chat-pregame-text');
  } else {
    chat = $('#game-chat-text');
  }
  if (!chat) {
    throw new Error('Failed to get the chat element in the "chat.add()" function.');
  }

  // Automatically generate links from any URLs that are present in the message
  // (but make an exception for messages from the server that start with "[")
  if (!data.server || !data.msg.startsWith('[')) {
    data.msg = linkifyHtml(data.msg, {
      target: '_blank',
      attributes: {
        rel: 'noopener noreferrer',
      },
    });
  }

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
  if (data.server || data.recipient) {
    line += data.msg;
  } else if (data.who) {
    line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
    line += data.msg;
  } else {
    line += data.msg;
  }
  line += '</span><br />';

  // Find out if we should automatically scroll down after adding the new line of chat
  // https://stackoverflow.com/questions/6271237/detecting-when-user-scrolls-to-bottom-of-div-with-jquery
  // If we are already scrolled to the bottom, then it is ok to automatically scroll
  let autoScroll = false;
  const topPositionOfScrollBar = chat.scrollTop() || 0;
  const innerHeight = chat.innerHeight() || 0;
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
    updatePeopletyping();
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
    const emoteTag = `<img src="https://cdn.discordapp.com/emojis/${match[2]}.png" title="${match[1]}" height=28 />`;
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
      // because we don't want to replace Discord emoptes
      const index = message.indexOf(emote);
      if (index !== -1 && message[index + emote.length] !== '"') {
        const re = new RegExp(`\\b${emote}\\b`, 'g'); // "\b" is a word boundary in regex
        const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${category}/${emote}.png" title="${emote}" />`;
        filledMessage = filledMessage.replace(re, emoteTag);
      }
    }
  }

  // Also handle emotes that have special characters in them
  if (filledMessage.indexOf('&lt;3') !== -1) {
    const emoteTag = '<img class="chat-emote" src="/public/img/emotes/other/3.png" title="&lt;3" />';
    const re = new RegExp('&lt;3', 'g'); // "\b" won't work with a semicolon
    filledMessage = filledMessage.replace(re, emoteTag);
  }

  return filledMessage;
};

export const updatePeopletyping = () => {
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
