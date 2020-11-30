package main

import (
	"os"
	"strconv"
	"strings"

	"github.com/bwmarrin/discordgo"
	"github.com/tevino/abool"
)

var (
	discord               *discordgo.Session
	discordToken          string
	discordGuildID        string
	discordListenChannels []string
	discordLobbyChannel   string
	discordBotID          string
	discordIsReady        = abool.New()
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
	discordGuildID = os.Getenv("DISCORD_GUILD_ID")
	if len(discordGuildID) == 0 {
		logger.Info("The \"DISCORD_GUILD_ID\" environment variable is blank; " +
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

	// Start the Discord bot in a new goroutine
	go discordConnect()
}

func discordConnect() {
	ctx := NewMiscContext("discordConnect")

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
	chatServerSend(ctx, msg, "lobby")
}

/*
	Event handlers
*/

func discordReady(s *discordgo.Session, event *discordgo.Ready) {
	logger.Info("Discord bot connected with username: " + event.User.Username)
	discordBotID = event.User.ID
	discordIsReady.Set()
}

// Copy messages from Discord to the lobby
func discordMessageCreate(s *discordgo.Session, m *discordgo.MessageCreate) {
	// Don't do anything if we are not yet connected
	if discordIsReady.IsNotSet() {
		return
	}

	ctx := NewMiscContext("discordMessageCreate")

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
	commandChat(ctx, nil, &CommandData{ // nolint: exhaustivestruct
		Username: discordGetNickname(m.Author.ID),
		Msg:      m.Content,
		Discord:  true,
		Room:     "lobby",
		// Pass through the ID in case we need it for a custom command
		DiscordID: m.Author.ID,
		// Pass through the discriminator so we can append it to the username
		DiscordDiscriminator: m.Author.Discriminator,
	})
}

/*
	Miscellaneous functions
*/

func discordSend(to string, username string, msg string) {
	if discord == nil {
		return
	}

	// Put "<" and ">" around any links to prevent the link preview from showing
	msgSections := strings.Split(msg, " ")
	for i, msgSection := range msgSections {
		if isValidURL(msgSection) {
			msgSections[i] = "<" + msgSection + ">"
		}
	}
	msg = strings.Join(msgSections, " ")

	// Make a message prefix to identify the user
	var fullMsg string
	if username != "" {
		// Text inside double asterisks are bolded
		fullMsg += "<**" + username + "**> "
	}
	fullMsg += msg

	// We use "ChannelMessageSendComplex" instead of "ChannelMessageSend" because we need to specify
	// the "AllowedMentions" property
	messageSendData := &discordgo.MessageSend{ // nolint: exhaustivestruct
		Content: fullMsg,
		// Specifying an empty "MessageAllowedMentions" struct means that the bot is not allowed to
		// mention anybody
		// This prevents people from abusing the bot to spam @everyone, for example
		AllowedMentions: &discordgo.MessageAllowedMentions{},
	}
	if _, err := discord.ChannelMessageSendComplex(to, messageSendData); err != nil {
		// Occasionally, sending messages to Discord can time out; if this occurs,
		// do not bother retrying, since losing a single message is fairly meaningless
		logger.Info("Failed to send \""+fullMsg+"\" to Discord:", err)
		return
	}
}

func discordGetNickname(discordID string) string {
	if member, err := discord.GuildMember(discordGuildID, discordID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		logger.Info("Failed to get the Discord guild member:", err)
		return "[error]"
	} else {
		if member.Nick != "" {
			return member.Nick
		}

		return member.User.Username
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

	// ----------------
	// Special commands
	// ----------------

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

		if len(args) == 0 {
			// They specified an ID but not a turn
			path := "/replay/" + strconv.Itoa(id)
			url := getURLFromPath(path)
			// We enclose the link in "<>" to prevent Discord from generating a link preview
			msg := "<" + url + ">"
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
		path := "/replay/" + strconv.Itoa(id) + "#" + strconv.Itoa(turn)
		url := getURLFromPath(path)
		// We enclose the link in "<>" to prevent Discord from generating a link preview
		msg := "<" + url + ">"
		discordSend(m.ChannelID, "", msg)
		return
	}

	// -------------
	// Info commands
	// -------------

	if command == "2pquestion" || command == "2player" || command == "2p" {
		// This includes a discord link to the #2-player channel
		msg := "Ask questions about 2-player games in the <#712153960709881888> channel."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "badquestion" {
		msg := "Your question is not specific enough. In order to properly answer it, we need to know the amount of players in the game, all of the cards in all of the hands, the amount of current clues, and so forth. Please type out a full Alice and Bob story in the style of the reference document. (e.g. <https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md#the-reverse-finesse>)"
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "level" {
		msg := "When asking questions in the #convention-questions channel, please remember to include the convention level that the current players of the game are playing with."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "loweffort" {
		msg := "It looks like you are asking a low-effort question. Update your question to explain what **you** think the best answer is, based on your current understanding of the conventions. Provide a detailed explanation as to **why** you think it is the best answer. Discuss any relevant contextual clues present in the game that influence the answer, if any. Provide an alternate answer that might also be the case and discuss why that answer is not as good. This allows us to hone in on the specific gaps in your knowledge."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "notation" {
		msg := "It looks like you are using non-standard card notation in your question. Please use notation that the Hyphen-ated group will be familiar with. For example:\n- Use \"red 3\" instead of \"3 red\".\n- Use \"r3\" instead of \"3r\".\n- Use \"r[3]\" to indicate that a card is a red 3 but has a number 3 clue on it.\n- Always use the characters of Alice, Bob, Cathy, Donald, Emily, and Frank instead of real player names. Alice should always be the player who performs the first action, and so forth."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "oop" {
		msg := "It looks like you are asking a question about an *Out-of-Position Bluff* (or OOP for short). When asking such questions, **you must include** the condition that you think is satisfied (i, ii, or iii)."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "screenshot" || command == "noreplay" {
		msg := "It looks like you have posted a screenshot of a game state. When asking questions in the #convention-questions channel, please **do not post a screenshot** and instead use the `/replay` command to generate a link to the specific turn of the game in question."
		discordSend(m.ChannelID, "", msg)
		return
	}

	if command == "undefined" {
		msg := "**Why isn't [situation X] defined in the conventions document?**\n\n"
		msg += "Not everything has to have a meaning. We intentionally want to have some situations be undefined so that we have some wiggle room to handle a wide variety of game states: <https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Convention_Goals.md>"
		discordSend(m.ChannelID, "", msg)
		return
	}
}
