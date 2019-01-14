/*
    Users can chat in the lobby, in the pregame, and in a game
*/

// Imports
const globals = require('../globals');

$(document).ready(() => {
    const rooms = ['lobby', 'game'];

    for (const room of rooms) {
        const input = $(`#${room}-chat-input`);
        input.on('keypress', send(room, input));
    }

    // By default, submitting a form will reload the page, so stop this from happening
    $('#lobby-chat-form').submit((event) => {
        event.preventDefault();
    });
    $('#lobby-chat-game-form').submit((event) => {
        event.preventDefault();
    });
});

const send = (room, input) => (event) => {
    if (event.key !== 'Enter') {
        return;
    }
    if (!input.val()) {
        return;
    }

    // Clear the chat box
    const msg = input.val();
    input.val('');

    globals.conn.send('chat', {
        msg,
        room,
    });
};

exports.add = (data) => {
    let chat;
    if (data.room === 'lobby') {
        chat = $('#lobby-chat-text');
    } else {
        chat = $('#game-chat-text');
    }

    // Convert any Discord emotes
    data.msg = fillEmotes(data.msg);

    // Get the hours and minutes from the time
    const datetime = new Intl.DateTimeFormat(
        undefined,
        {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        },
    ).format(new Date(data.datetime));

    let line = `<span>[${datetime}]&nbsp; `;
    if (data.server) {
        line += data.msg;
    } else if (data.who) {
        line += `&lt;<strong>${data.who}</strong>&gt;&nbsp; `;
        line += `${$('<a>').html(data.msg).html()}`;
    } else {
        line += `<strong>${$('<a>').html(data.msg).html()}</strong>`;
    }
    line += '</span><br />';

    chat.finish();
    chat.append(line);
    chat.animate({
        scrollTop: chat[0].scrollHeight,
    }, globals.fadeTime);
};

const fillEmotes = (message) => {
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
