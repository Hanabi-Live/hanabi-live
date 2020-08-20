package main

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/discordgo"
)

var (
	discord               *discordgo.Session
	discordToken          string
	discordListenChannels []string
	discordLobbyChannel   string
	discordLastAtHere     time.Time
	discordBotID          string
)

/*
	Initialization functions
*/

func discordInit() {
	// Read some configuration values from environment variables
	// (they were loaded from the .env file in main.go)
	discordToken = os.Getenv("DISCORD_TOKEN")
	if len(discordToken) == 0 {
		logger.Info("The \"DISCORD_TOKEN\" environment variable is blank; " +
			"aborting Discord initialization.")
		return
	}
	discordListenChannelsString := os.Getenv("DISCORD_LISTEN_CHANNEL_IDS")
	if len(discordListenChannelsString) == 0 {
		logger.Info("The \"DISCORD_LISTEN_CHANNEL_IDS\" environment variable is blank; " +
			"aborting Discord initialization.")
		return
	}
	discordListenChannels = strings.Split(discordListenChannelsString, ",")
	discordLobbyChannel = os.Getenv("DISCORD_LOBBY_CHANNEL_ID")
	if len(discordLobbyChannel) == 0 {
		logger.Info("The \"DISCORD_LOBBY_CHANNEL_ID\" environment variable is blank; " +
			"aborting Discord initialization.")
		return
	}

	// Get the last time a "@here" ping was sent
	var timeAsString string
	if v, err := models.Metadata.Get("discord_last_at_here"); err != nil {
		logger.Fatal("Failed to retrieve the \"discord_last_at_here\" value from the database:", err)
		return
	} else {
		timeAsString = v
	}
	if v, err := time.Parse(time.RFC3339, timeAsString); err != nil {
		logger.Fatal("Failed to parse the \"discord_last_at_here\" value from the database:", err)
		return
	} else {
		discordLastAtHere = v
	}

	// Start the Discord bot in a new goroutine
	go discordConnect()
}

func discordConnect() {
	// Bot accounts must be prefixed with "Bot"
	if v, err := discordgo.New("Bot " + discordToken); err != nil {
		logger.Error("Failed to create a Discord session:", err)
		return
	} else {
		discord = v
	}

	// Register function handlers for various events
	discord.AddHandler(discordReady)
	discord.AddHandler(discordMessageCreate)

	// Open the websocket and begin listening
	if err := discord.Open(); err != nil {
		logger.Error("Failed to open the Discord session:", err)
		return
	}

	// Announce that the server has started
	// (we wait for Discord to connect before displaying this message)
	msg := "The server has successfully started at: " + getCurrentTimestamp() + "\n"
	msg += "(" + gitCommitOnStart + ")"
	chatServerSend(msg, "lobby")
}

/*
	Event handlers
*/

func discordReady(s *discordgo.Session, event *discordgo.Ready) {
	logger.Info("Discord bot connected with username: " + event.User.Username)
	discordBotID = event.User.ID
}

// Copy messages from Discord to the lobby
func discordMessageCreate(s *discordgo.Session, m *discordgo.MessageCreate) {
	// Get the channel
	var channel *discordgo.Channel
	if v, err := discord.Channel(m.ChannelID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		logger.Info("Failed to get the Discord channel of \""+m.ChannelID+"\":", err)
		return
	} else {
		channel = v
	}

	// Log the message
	logger.Info("[D#" + channel.Name + "] " +
		"<" + m.Author.Username + "#" + m.Author.Discriminator + "> " + m.Content)

	// Ignore all messages created by the bot itself
	if m.Author.ID == discordBotID {
		return
	}

	// We want to replicate Discord messages to the lobby, but only from specific channels
	if !stringInSlice(m.ChannelID, discordListenChannels) {
		// Handle specific commands in non-listening channels
		// (to replicate lobby functionality to the Discord server more generally)
		discordCheckCommand(m)

		return
	}

	// Send everyone the notification
	commandChat(nil, &CommandData{ // Manual invocation
		Username: discordGetNickname(m.Author.ID),
		Msg:      m.Content,
		Discord:  true,
		Room:     "lobby",
		// Pass through the ID in case we need it for a custom command
		DiscordID: m.Author.ID,
		// Pass through the discriminator so we can append it to the username
		DiscordDiscriminator: m.Author.Discriminator,
		NoLock:               true,
	})
}

/*
	Miscellaneous functions
*/

func discordSend(to string, username string, msg string) {
	if discord == nil {
		return
	}

	// Make a message prefix to identify the user
	var fullMsg string
	if username != "" {
		// Text inside double asterisks are bolded
		fullMsg += "<**" + username + "**> "
	}
	fullMsg += msg

	if _, err := discord.ChannelMessageSend(to, fullMsg); err != nil {
		// Occasionally, sending messages to Discord can time out; if this occurs,
		// do not bother retrying, since losing a single message is fairly meaningless
		logger.Info("Failed to send \""+fullMsg+"\" to Discord:", err)
		return
	}
}

func discordGetNickname(discordID string) string {
	// Assume that the first channel ID is the same as the guild/server ID
	guildID := discordListenChannels[0]

	if member, err := discord.GuildMember(guildID, discordID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		logger.Info("Failed to get the Discord guild member:", err)
		return "[error]"
	} else {
		return member.Nick
	}
}

func discordGetChannel(discordID string) string {
	if channel, err := discord.Channel(discordID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		logger.Info("Failed to get the Discord channel:", err)
		return "[error]"
	} else {
		return channel.Name
	}
}

// We need to check for special commands that occur in Discord channels other than #general
// (because the messages will not flow to the normal "chatCommandMap")
func discordCheckCommand(m *discordgo.MessageCreate) {
	// This code is duplicated from the "chatCommand()" function
	args := strings.Split(m.Content, " ")
	command := args[0]
	args = args[1:] // This will be an empty slice if there is nothing after the command
	// (we need to pass the arguments through to the command handler)

	// Commands will start with a "/", so we can ignore everything else
	if !strings.HasPrefix(command, "/") {
		return
	}
	command = strings.TrimPrefix(command, "/")
	command = strings.ToLower(command) // Commands are case-insensitive

	// This code is duplicated from the "chatReplay()" function
	if command == "replay" || command == "link" || command == "game" {
		if len(args) == 0 {
			discordSend(
				m.ChannelID,
				"",
				"The format of the /replay command is: /replay [game ID] [turn number]",
			)
			return
		}

		// Validate that the first argument is a number
		arg1 := args[0]
		args = args[1:] // This will be an empty slice if there is nothing after the command
		var id int
		if v, err := strconv.Atoi(arg1); err != nil {
			var msg string
			if _, err := strconv.ParseFloat(arg1, 64); err != nil {
				msg = "\"" + arg1 + "\" is not a number."
			} else {
				msg = "The /replay command only accepts integers."
			}
			discordSend(m.ChannelID, "", msg)
			return
		} else {
			id = v
		}

		// We enclose the link in "<>" to prevent Discord from generating a link preview
		if len(args) == 0 {
			// They specified an ID but not a turn
			msg := "<https://" + domain + "/replay/" + strconv.Itoa(id) + ">"
			discordSend(m.ChannelID, "", msg)
			return
		}

		// Validate that the second argument is a number
		arg2 := args[0]
		var turn int
		if v, err := strconv.Atoi(arg2); err != nil {
			var msg string
			if _, err := strconv.ParseFloat(arg2, 64); err != nil {
				msg = "\"" + arg2 + "\" is not a number."
			} else {
				msg = "The /replay command only accepts integers."
			}
			discordSend(m.ChannelID, "", msg)
			return
		} else {
			turn = v
		}

		// They specified an ID and a turn
		msg := "<https://" + domain + "/replay/" + strconv.Itoa(id) + "/" + strconv.Itoa(turn) + ">"
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "badquestion" {
		msg := "Your question is not specific enough. In order to properly answer it, we need to know the amount of players in the game, all of the cards in all of the hands, the amount of current clues, and so forth. Please type out a full Alice and Bob story in the style of the reference document. (e.g. <https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-reverse-finesse>)"
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "2pquestion" || command == "2player" || command == "2p" {
		// This includes a discord link to the #2-player channel
		msg := "Ask questions about 2-player games in the <#712153960709881888> channel."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "oop" {
		msg := "It looks like you are asking a question about an *Out-of-Position Bluff* (or OOP for short). When asking such questions, **you must include** the condition that you think is satisfied (a, b, or c)."
		discordSend(m.ChannelID, "", msg)
		return
	}
}
