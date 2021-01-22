package discord

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/logger"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/bwmarrin/discordgo"
	"github.com/tevino/abool"
)

type Manager struct {
	logger     *logger.Logger
	Dispatcher *dispatcher.Dispatcher

	session              *discordgo.Session
	guildID              string
	channelSyncWithLobby string
	botID                string
	ready                *abool.AtomicBool
	commandFuncMap       map[string]func(context.Context, *discordgo.MessageCreate, []string)
	channelRegExp        *regexp.Regexp
	mentionRegExp        *regexp.Regexp
}

// NewManager will return nil if the Discord manager should not be initialized.
// (Discord integration is an optional component of the server.)
func NewManager(logger *logger.Logger, variantsManager *variants.Manager) *Manager {
	// Get environment variables
	envVars := getEnvVars(logger)
	if envVars == nil {
		return nil
	}

	m := &Manager{
		logger:     logger,
		Dispatcher: nil, // This will be filled in after this object is instantiated

		session:              nil,
		guildID:              envVars.guildID,
		channelSyncWithLobby: envVars.channelSyncWithLobby,
		botID:                "",
		ready:                abool.New(),
		commandFuncMap:       make(map[string]func(context.Context, *discordgo.MessageCreate, []string)),
		channelRegExp:        regexp.MustCompile(`&lt;#(\d+?)&gt;`),
		mentionRegExp:        regexp.MustCompile(`&lt;@!*(\d+?)&gt;`),
	}
	m.commandFuncMapInit()

	// Start the Discord bot in a new goroutine
	m.connect(envVars)

	return m
}

type envVars struct {
	token                string
	guildID              string
	channelSyncWithLobby string
}

// getEnvVars reads some specific environment variables relating to the Discord connection.
// (They were loaded from the ".env" file in "main.go".)
func getEnvVars(logger *logger.Logger) *envVars {
	token := os.Getenv("DISCORD_TOKEN")
	if len(token) == 0 {
		logger.Info("The \"DISCORD_TOKEN\" environment variable is blank; aborting Discord initialization.")
		return nil
	}

	guildID := os.Getenv("DISCORD_GUILD_ID")
	if len(guildID) == 0 {
		logger.Info("The \"DISCORD_GUILD_ID\" environment variable is blank; aborting Discord initialization.")
		return nil
	}
	if _, err := strconv.Atoi(guildID); err != nil {
		logger.Fatalf(
			"Failed to convert the \"DISCORD_GUILD_ID\" environment variable of \"%v\" to an integer: %v",
			guildID,
			err,
		)
	}

	channelSyncWithLobby := os.Getenv("DISCORD_CHANNEL_SYNC_WITH_LOBBY")
	if len(channelSyncWithLobby) == 0 {
		logger.Info("The \"DISCORD_CHANNEL_SYNC_WITH_LOBBY\" environment variable is blank; aborting Discord initialization.")
		return nil
	}
	if _, err := strconv.Atoi(channelSyncWithLobby); err != nil {
		logger.Fatalf(
			"Failed to convert the \"DISCORD_CHANNEL_SYNC_WITH_LOBBY\" environment variable of \"%v\" to an integer: %v",
			channelSyncWithLobby,
			err,
		)
	}

	return &envVars{
		token:                token,
		guildID:              guildID,
		channelSyncWithLobby: channelSyncWithLobby,
	}
}

func (m *Manager) connect(envVars *envVars) {
	// Discord requires that bot accounts are prefixed with "Bot"
	botUsername := fmt.Sprintf("Bot %v", envVars.token)
	if v, err := discordgo.New(botUsername); err != nil {
		m.logger.Errorf("Failed to create a Discord session: %v", err)
		return
	} else {
		m.session = v
	}

	// Register function handlers for various events
	m.session.AddHandler(m.handlerReady)
	m.session.AddHandler(m.handlerMessageCreate)

	// Open the WebSocket and begin listening
	if err := m.session.Open(); err != nil {
		m.logger.Errorf("Failed to open the Discord session: %v", err)
		return
	}

	// Announce that the server has started
	// (we wait for Discord to connect before displaying this message)
	msg := fmt.Sprintf(
		"The server has successfully started at: %v (%v)",
		util.GetCurrentTimestamp(),
		m.Dispatcher.Core.GitCommitOnStart(),
	)
	m.Dispatcher.Chat.ChatServer(msg, constants.Lobby)
}
