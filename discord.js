'use strict';

// Imports
const Discord  = require('discord.js');
const logger   = require('./logger');
const messages = require('./messages');
const keldon   = require('./keldon');

// Import the environment variables defined in the ".env" file
require('dotenv').config();

// Create a new client, expose it to the rest of the application, and login
// with our application token
const client = new Discord.Client();
if (process.env.DISCORD_TOKEN.length !== 0) {
    client.login(process.env.DISCORD_TOKEN);
    // The token is is from: https://discordapp.com/developers/applications/me/
    // To set up a new bot, follow these instructions:
    // https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token
}

/*
    Event callbacks
*/

client.on('ready', function() {
  logger.info('Discord bot has connected.');
});

client.on('message', function(message) {
    // Don't do anything if we are the author of the message
    // (or if the message was created by another bot)
    if ('author' in message === false) {
        return;
    } else if ('bot' in message.author === false) {
        return;
    } else if (message.author.bot) {
        return;
    }

    // Only replicate messages from the "#general" channel
    if ('channel' in message === false) {
        return;
    } else if ('name' in message.channel === false) {
        return;
    } else if (message.channel.name !== 'general') {
        return;
    }

    // Replicate the message from the Discord server to the lobby
    if ('username' in message.author === false) {
        return;
    } else if ('discriminator' in message.author === false) {
        return;
    }
    let username = message.author.username + '#' + message.author.discriminator;
    let socket = {
        userID: 1, // The first user ID is reserved for server messages
        username: username,
    };
    let data = {
            msg: message.content,
    };
    messages.chat.step1(socket, data);

    // Also replicate the message to the Keldon lobby
    keldon.sendChat('<' + username + '> ' + message.content);
});

exports.send = function(from, username, message) {
    // In Discord, text inside single asterisks are italicised and text inside
    // double asterisks are bolded
    let messageString = '[*' + from + '*] <**' + username + '**> ' + message;

    // A guild is a server in Discord
    // The bot should only be in one server, so it will be at array index 0
    let channel = client.guilds.array()[0].defaultChannel;
    channel.send(messageString);
};
