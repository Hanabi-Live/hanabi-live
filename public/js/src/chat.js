/*
    Users can chat in the lobby, in the pregame, and in a game
*/

// Imports
const globals = require('./globals');
const game = require('./game/main');

$(document).ready(() => {
    const input1 = $('#lobby-chat-input');
    input1.on('keypress', send('lobby', input1));
    const input2 = $('#lobby-chat-pregame-input');
    input2.on('keypress', send('game', input2));
    const input3 = $('#game-chat-input');
    input3.on('keypress', send('game', input3));
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
    let ingame = false;
    if (data.room === 'lobby') {
        chat = $('#lobby-chat-text');
    } else if ($('#lobby-chat-pregame-text').is(':visible')) {
        chat = $('#lobby-chat-pregame-text');
    } else {
        chat = $('#game-chat-text');
        ingame = true;
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

    // Show the chat window when any new messages are sent
    if (ingame) {
        game.chat.show();
    }
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
