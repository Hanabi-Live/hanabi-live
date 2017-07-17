'use strict';

// Imports
const discord  = require('discord.js');
const logger   = require('./logger');
const messages = require('./messages');

// Import the environment variables defined in the ".env" file
require('dotenv').config();

// Create a new client, expose it to the rest of the application, and login with our application token
const client = new discord.Client();
if (process.env.DISCORD_TOKEN.length !== 0) {
    client.login(process.env.DISCORD_TOKEN);
    // The token is is from: https://discordapp.com/developers/applications/me/
    // To set up a new bot, follow these instructions: https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token
}

/*
    Event callbacks
*/

client.on('ready', function() {
  logger.info('Discord bot has connected.');
});

client.on('message', function(message) {
    // Don't do anything if we are the author of the message (or if the message was created by another bot)
    if (message.author.bot) {
        return;
    }

    // Replicate the message from the Discord server to the lobby
    let socket = {
        userID: 1, // The first user ID is reserved for server messages
        username: message.author.username + '#' + message.author.discriminator,
    };
    let data = {
            msg: message.content,
    };
    messages.chat.step1(socket, data);
});

exports.send = function(from, username, message) {
    let messageString = '[*' + from + '*] <**' + username + '**> ' + message;
    // In Discord, text inside single asterisks are italicised and text inside double asterisks are bolded

    let guild = discord.client.guilds.array()[0]; // A guild is a server in Discord
    let channel = guild.defaultChannel;
    channel.send(messageString);
};
