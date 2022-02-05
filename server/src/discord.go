package main

import (
	"context"
	"os"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/bwmarrin/discordgo"
	"github.com/tevino/abool"
)

var (
	discord                     *discordgo.Session
	discordToken                string
	discordGuildID              string
	discordChannelSyncWithLobby string
	discordChannelWebsiteDev    string
	sendMessageToWebDevChannel  bool
	discordBotID                string
	discordIsReady              = abool.New()

	discordPingCrew       string
	discordTrustedTeacher string
	discordLobbyCommands  = []string{"subscribe", "unsubscribe"}
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
	discordChannelSyncWithLobby = os.Getenv("DISCORD_CHANNEL_SYNC_WITH_LOBBY")
	if len(discordChannelSyncWithLobby) == 0 {
		logger.Info("The \"DISCORD_CHANNEL_SYNC_WITH_LOBBY\" environment variable is blank; " +
			"aborting Discord initialization.")
		return
	}
	discordChannelWebsiteDev = os.Getenv("DISCORD_CHANNEL_WEBSITE_DEVELOPMENT")
	if len(discordChannelWebsiteDev) == 0 {
		logger.Info("The \"DISCORD_CHANNEL_WEBSITE_DEVELOPMENT\" environment variable is blank; " +
			"aborting Discord initialization.")
		return
	}
	discordPingCrew = os.Getenv("DISCORD_PING_CREW_ROLE_NAME")
	discordTrustedTeacher = os.Getenv("DISCORD_TRUSTED_TEACHER_ROLE_NAME")

	// Messages are only sent to website-development channel when the server restarts
	sendMessageToWebDevChannel = false

	// Initialize the command map
	discordCommandInit()

	// Start the Discord bot in a new goroutine
	go discordConnect()
}

func discordConnect() {
	ctx := NewMiscContext("discordConnect")

	// Bot accounts must be prefixed with "Bot"
	if v, err := discordgo.New("Bot " + discordToken); err != nil {
		logger.Error("Failed to create a Discord session: " + err.Error())
		return
	} else {
		discord = v
	}

	// Register function handlers for various events
	discord.AddHandler(discordReady)
	discord.AddHandler(discordMessageCreate)

	// Open the websocket and begin listening
	if err := discord.Open(); err != nil {
		logger.Error("Failed to open the Discord session: " + err.Error())
		return
	}

	// Announce that the server has started
	// (we wait for Discord to connect before displaying this message)
	msg := "The server has successfully started at: " + getCurrentTimestamp() + " " +
		"(" + gitCommitOnStart + ")"
	// Send once this message to website-development as well
	sendMessageToWebDevChannel = true
	chatServerSend(ctx, msg, "lobby", false)
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
		logger.Info("Failed to get the Discord channel of \"" + m.ChannelID + "\": " + err.Error())
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

	// Handle specific Discord commands in channels other than the lobby
	// (to replicate some lobby functionality to the Discord server more generally)
	if m.ChannelID != discordChannelSyncWithLobby {
		discordCheckNonLobbyCommands(ctx, m)
		return
	}

	// Handle command specific for lobby
	if discordCheckLobbyCommands(ctx, m) {
		return
	}

	// Send everyone the notification
	username := discordGetNickname(m.Author.ID)
	discordSendToChat(ctx, m.Content, username)
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

	// Allow pinging specific roles
	var roles []string
	pingable := []string{discordPingCrew, discordTrustedTeacher}
	for _, role := range pingable {
		if role, ok := discordGetRoleByName(role); ok {
			roles = append(roles, role.ID)
		}
	}

	// We use "ChannelMessageSendComplex" instead of "ChannelMessageSend" because we need to specify
	// the "AllowedMentions" property
	messageSendData := &discordgo.MessageSend{ // nolint: exhaustivestruct
		Content: fullMsg,
		// This prevents people from abusing the bot to spam @everyone
		AllowedMentions: &discordgo.MessageAllowedMentions{ // nolint: exhaustivestruct
			Roles: roles,
		},
	}
	if _, err := discord.ChannelMessageSendComplex(to, messageSendData); err != nil {
		// Occasionally, sending messages to Discord can time out; if this occurs,
		// do not bother retrying, since losing a single message is fairly meaningless
		logger.Info("Failed to send \"" + fullMsg + "\" to Discord: " + err.Error())
		return
	}
}

func discordGetNickname(discordID string) string {
	if member, err := discord.GuildMember(discordGuildID, discordID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		logger.Info("Failed to get the Discord guild member: " + err.Error())
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
		logger.Info("Failed to get the Discord channel: " + err.Error())
		return "[error]"
	} else {
		return channel.Name
	}
}

// We need to check for special commands that occur in Discord channels other than #general
// (because the messages will not flow to the normal "chatCommandMap")
func discordCheckNonLobbyCommands(ctx context.Context, m *discordgo.MessageCreate) {
	// There could be a command on any line
	for _, line := range strings.Split(m.Content, "\n") {
		var command string
		var args []string

		if cmd, a := chatParseCommand(line); cmd == "" {
			continue
		} else {
			command = cmd
			args = a
		}

		discordCommand(ctx, m, command, args)
	}
}

// Check for commands in lobby.
// Handles the command and returns true if it can be issued in Discord lobby
func discordCheckLobbyCommands(ctx context.Context, m *discordgo.MessageCreate) bool {
	// There could be a command on any line
	for _, line := range strings.Split(m.Content, "\n") {
		var command string
		var args []string

		if cmd, a := chatParseCommand(line); cmd == "" {
			continue
		} else {
			command = cmd
			args = a
		}

		if stringInSlice(command, discordLobbyCommands) {
			// Send everyone the notification
			// Get the username once, and put it in args
			// Because repeated calls to getUsername produce Discord errors
			username := discordGetNickname(m.Author.ID)
			discordSendToChat(ctx, "/"+command, username)

			args = []string{username}
			discordCommand(ctx, m, command, args)
			return true
		}
	}
	return false
}

func discordGetRoles() []*discordgo.Role {
	roles := make([]*discordgo.Role, 0)
	if v, err := discord.GuildRoles(discordGuildID); err != nil {
		logger.Info("Failed to get the Discord channel: " + err.Error())
	} else {
		roles = v
	}

	return roles
}

func discordGetRole(discordID string) string {
	roles := discordGetRoles()
	for _, role := range roles {
		if role.ID == discordID {
			return role.Name
		}
	}
	return "[unknown role]"
}

// Search for a Discord role by name
func discordGetRoleByName(name string) (*discordgo.Role, bool) {
	roles := discordGetRoles()
	for _, role := range roles {
		if role.Name == name {
			return role, true
		}
	}
	return nil, false
}

func discordSendToChat(ctx context.Context, msg string, username string) {
	debug("username: " + username)
	commandChat(ctx, nil, &CommandData{ // nolint: exhaustivestruct
		Username: username,
		Msg:      msg,
		Discord:  true,
		Room:     "lobby",
	})
}
