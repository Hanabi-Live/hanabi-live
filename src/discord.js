// Imports
const Discord = require('discord.js');
const logger = require('./logger');
const messages = require('./messages');
const keldon = require('./keldon');

// Import the environment variables defined in the ".env" file
// (this has to be in every file that accesses any environment varaibles)
require('dotenv').config();

// Local variables
let client = null;
let listenChannelIDs = null;

discordInit();

function discordInit() {
    // Enable the bot only if the token is specified
    if (process.env.DISCORD_TOKEN.length === 0) {
        return;
    }

    // Find out which channels to listen to
    if (process.env.DISCORD_LISTEN_CHANNEL_IDS === '') {
        return;
    }
    listenChannelIDs = process.env.DISCORD_LISTEN_CHANNEL_IDS.split(',');

    // Create a new client, expose it to the rest of the application, and login
    // with our application token
    client = new Discord.Client();
    client.login(process.env.DISCORD_TOKEN);
    // The token is is from: https://discordapp.com/developers/applications/me/
    // To set up a new bot, follow these instructions:
    // https://github.com/reactiflux/discord-irc/wiki/Creating-a-discord-bot-&-getting-a-token

    // Specify client callbacks
    client.on('ready', () => {
        logger.info('Discord bot has connected.');
    });
    client.on('message', discordMessage);
}

function discordMessage(message) {
    // Validate that the message has some basic properties
    if (!('author' in message)) {
        logger.error('Failed to parse the "author" field from the Discord message.');
        return;
    } else if (!('channel' in message)) {
        logger.error('Failed to parse the "channel" field from the Discord message.');
        return;
    } else if (!('id' in message.channel)) {
        logger.error('Failed to parse the "channel.id" field from the Discord message.');
        return;
    } else if (!('username' in message.author)) {
        logger.error('Failed to parse the "author.username" field from the Discord message.');
        return;
    } else if (!('discriminator' in message.author)) {
        logger.error('Failed to parse the "author.discriminator" field from the Discord message.');
        return;
    } else if (!('bot' in message.author)) {
        logger.error('Failed to parse the "author.bot" field from the Discord message.');
        return;
    } else if (!('content' in message)) {
        logger.error('Failed to parse the "content" field from the Discord message.');
        return;
    }

    // Don't do anything if we are the author of the message
    // (or if the message was created by another bot)
    if (message.author.bot) {
        return;
    }

    // Only replicate messages from the listed channels
    if (listenChannelIDs.indexOf(message.channel.id) === -1) {
        return;
    }

    // Replicate the message from the Discord server to the lobby
    const username = `${message.author.username}#${message.author.discriminator}`;
    const socket = {
        userID: 1, // The first user ID is reserved for server messages
        username,
    };
    const data = {
        msg: message.content,
        discord: true,
    };
    messages.chat.step1(socket, data);

    // Also replicate the message to the Keldon lobby
    keldon.sendChat(`<${username}> ${message.content}`);
}

exports.send = (from, username, message) => {
    // Enable Discord sending only if the token is specified
    if (process.env.DISCORD_TOKEN.length === 0) {
        return;
    }

    // Find out which channels to output to
    const outputChannelID = process.env.DISCORD_OUTPUT_CHANNEL_ID;
    if (outputChannelID.length === 0) {
        return;
    }

    // In Discord, text inside single asterisks are italicised and text inside
    // double asterisks are bolded
    let messageString = `[*${from}*] `;
    if (typeof username !== 'undefined') {
        messageString += `<**${username}**> `;
    }
    messageString += message;

    // A guild is a server in Discord
    // The bot should only be in one server, so it will be at array index 0
    const channel = client.guilds.array()[0].channels.get(outputChannelID);
    if (channel) {
        channel.send(messageString);
    }
};
