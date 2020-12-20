package discord

import (
	"net/url"
)

func (m *Manager) getChannelName(channelID string) string {
	if channel, err := m.session.Channel(channelID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		m.logger.Infof(
			"Failed to get the Discord channel corresponding to channel ID \"%v\": %v",
			channelID,
			err,
		)
		return "[error]"
	} else {
		return channel.Name
	}
}

func (m *Manager) GetNickname(discordID string) string {
	if member, err := m.session.GuildMember(m.guildID, discordID); err != nil {
		// This can occasionally fail, so we don't want to report the error to Sentry
		m.logger.Infof(
			"Failed to get the Discord guild member corresponding to user ID \"%v\": %v",
			discordID,
			err,
		)
		return "[error]"
	} else {
		if member.Nick != "" {
			return member.Nick
		}

		return member.User.Username
	}
}

// isValidUrl tests a string to determine if it is a well-structured url or not.
// From: https://golangcode.com/how-to-check-if-a-string-is-a-url/
func isValidURL(toTest string) bool {
	_, err := url.ParseRequestURI(toTest)
	if err != nil {
		return false
	}

	u, err := url.Parse(toTest)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}

	return true
}
