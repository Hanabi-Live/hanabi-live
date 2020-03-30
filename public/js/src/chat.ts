/*
    Users can chat in the lobby, in the pregame, and in a game
    Logic for the game chat box is located separately in "game/chat.ts"
*/

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
let chatLineNum = 1;

export const init = () => {
    $('#lobby-chat-input').on('input', input);
    $('#lobby-chat-input').on('keypress', keypress('lobby'));
    $('#lobby-chat-pregame-input').on('input', input);
    $('#lobby-chat-pregame-input').on('keypress', keypress('table'));
    $('#game-chat-input').on('input', input);
    $('#game-chat-input').on('keypress', keypress('table'));

    // Ensure that there are no overlapping emotes
    const emoteMap = new Map();
    for (const category of Object.values(emoteCategories)) {
        for (const emote of category) {
            if (emoteMap.has(emote)) {
                throw new Error(`Duplicate emote found: ${emote}`);
            } else {
                emoteMap.set(emote, true);
            }
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
    // Check for submission
    if (event.key !== 'Enter') {
        return;
    }

    const element = $(this);
    if (!element) {
        throw new Error('Failed to get the element for the keypress function.');
    }
    const msg = element.val();
    if (!msg) {
        return;
    }
    if (typeof msg !== 'string') {
        throw new Error('The value of the element in the keypress function is not a string.');
    }

    // Clear the chat box
    element.val('');

    // Use "startsWith" instead of "===" to work around an unknown bug where
    // the room can already have the table number appended (e.g. "table123")
    if (room.startsWith('table')) {
        room = `table${globals.tableID}`;
    }

    // Check for chat commands
    const args = msg.split(' ');
    if (
        msg.startsWith('/pm')
        || msg.startsWith('/w')
        || msg.startsWith('/whisper')
        || msg.startsWith('/msg')
    ) {
        // Validate that the format of the command is correct
        if (args.length < 3) {
            modals.warningShow('The format of a private message is: <code>/w Alice hello</code>');
            return;
        }

        // Validate that they are not sending a private message to themselves
        let recipient = args[1];
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

        args.shift(); // Remove the "/pm"
        args.shift(); // Remove the recipient
        globals.conn.send('chatPM', {
            msg: args.join(' '),
            recipient,
            room,
        });
        return;
    }

    // This is not a command, so send a the chat message to the server
    globals.conn.send('chat', {
        msg,
        room,
    });
};

export const add = (data: ChatMessage, fast: boolean) => {
    // Find out which chat box we should add the new chat message to
    let chat;
    if (data.recipient === globals.username) {
        // If this is a PM that we are recieving,
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

    // Linkify any links
    data.msg = linkifyHtml(data.msg, {
        target: '_blank',
    });

    // Convert emotes to images
    data.msg = fillDiscordEmotes(data.msg);
    data.msg = fillLocalEmotes(data.msg);

    // Get the hours and minutes from the time
    const datetime = new Intl.DateTimeFormat(
        undefined,
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        },
    ).format(new Date(data.datetime));

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
        }, (fast ? 0 : 500));
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
    let filledMessed = message;

    // Search through the text for each emote
    for (const [category, emotes] of Object.entries(emoteCategories)) {
        for (const emote of emotes) {
            // We don't want to replace the emote if it is followed by a quote,
            // because we don't want to replace Discord emoptes
            const index = message.indexOf(emote);
            if (index !== -1 && message[index + emote.length] !== '"') {
                const re = new RegExp(`\\b${emote}\\b`, 'g'); // "\b" is a word boundary in regex
                const emoteTag = `<img class="chat-emote" src="/public/img/emotes/${category}/${emote}.png" title="${emote}" />`;
                filledMessed = filledMessed.replace(re, emoteTag);
            }
        }
    }

    // Also handle special emotes that do not match the filenames
    if (message.indexOf('&lt;3') !== -1) {
        const emoteTag = '<img class="chat-emote" src="/public/img/emotes/3.png" title="&lt;3" />';
        const re = new RegExp('&lt;3', 'g');
        message = message.replace(re, emoteTag);
    }

    return filledMessed;
};
