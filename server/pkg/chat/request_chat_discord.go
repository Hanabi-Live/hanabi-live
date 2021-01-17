package chat

import "github.com/Zamiell/hanabi-live/server/pkg/constants"

type chatDiscordData struct {
	username             string
	msg                  string
	discordDiscriminator string
}

// ChatDiscord is a helper function to duplicate a message from Discord to the server lobby.
func (m *Manager) ChatDiscord(username string, msg string, discordDiscriminator string) {
	m.newRequest(requestTypeChatDiscord, &chatDiscordData{ // nolint: errcheck
		username:             username,
		msg:                  msg,
		discordDiscriminator: discordDiscriminator,
	})
}

func (m *Manager) chatDiscord(data interface{}) {
	var d *chatDiscordData
	if v, ok := data.(*chatDiscordData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.chat(&chatData{
		userID:               0,
		username:             d.username,
		msg:                  d.msg,
		room:                 constants.Lobby,
		discord:              true,
		discordDiscriminator: d.discordDiscriminator,
		server:               false,
	})
}
