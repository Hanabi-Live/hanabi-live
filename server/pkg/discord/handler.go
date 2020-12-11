package discord

import (
	"context"

	"github.com/bwmarrin/discordgo"
)

func (m *Manager) handlerReady(s *discordgo.Session, event *discordgo.Ready) {
	m.logger.Infof("Discord bot connected with username: %v", event.User.Username)
	m.botID = event.User.ID
	m.ready.Set()
}

// Copy messages from Discord to the lobby.
func (m *Manager) handlerMessageCreate(s *discordgo.Session, mc *discordgo.MessageCreate) {
	// Don't do anything if we are not yet connected
	if m.ready.IsNotSet() {
		return
	}

	ctx := context.Background()

	// Get the channel
	var channel *discordgo.Channel
	if v, err := m.session.Channel(mc.ChannelID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		m.logger.Infof(
			"Failed to get the Discord channel corresponding to channel ID \"%v\": %v",
			mc.ChannelID,
			err,
		)
		return
	} else {
		channel = v
	}

	// Log the message
	m.logger.Infof(
		"[D#%v] <%v#%v> %v",
		channel.Name,
		mc.Author.Username,
		mc.Author.Discriminator,
		mc.Content,
	)

	// Ignore all messages created by the bot itself
	if mc.Author.ID == m.botID {
		return
	}

	// Handle specific Discord commands in channels other than the lobby
	// (to replicate some lobby functionality to the Discord server more generally)
	if mc.ChannelID != m.channelSyncWithLobby {
		m.checkCommand(ctx, mc)
		return
	}

	// Send everyone the notification
	// TODO
	/*
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
	*/
}
