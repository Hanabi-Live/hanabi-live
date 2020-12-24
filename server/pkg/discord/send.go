package discord

import (
	"fmt"
	"strings"

	"github.com/bwmarrin/discordgo"
)

func (m *Manager) send(channelID string, username string, msg string) {
	if m == nil {
		// The manager is not initialized
		return
	}

	if m.ready.IsNotSet() {
		// We are not yet connected
		return
	}

	// Put "<" and ">" around any links to prevent the link preview from showing
	msgSections := strings.Split(msg, " ")
	for i, msgSection := range msgSections {
		if isValidURL(msgSection) {
			msgSections[i] = fmt.Sprintf("<%v>", msgSection)
		}
	}
	msg = strings.Join(msgSections, " ")

	// Make a message prefix to identify the user
	var fullMsg string
	if username != "" {
		// Text inside double asterisks are bolded
		fullMsg += fmt.Sprintf("<**%v**> ", username)
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
	if _, err := m.session.ChannelMessageSendComplex(channelID, messageSendData); err != nil {
		// Occasionally, sending messages to Discord can time out; if this occurs,
		// do not bother retrying, since losing a single message is fairly meaningless
		m.logger.Infof("Failed to send \"%v\" to Discord: %v", fullMsg, err)
		return
	}
}

func (m *Manager) LobbySync(username string, msg string) {
	m.send(m.channelSyncWithLobby, username, msg)
}
