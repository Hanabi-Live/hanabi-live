package commands

import (
	"encoding/json"
)

type chatPMData struct {
	Msg       string `json:"msg"`
	Recipient string `json:"recipient"`
}

// chatPM is sent when a user sends a private message.
func (m *Manager) commandChatPM(sessionData *SessionData, commandData []byte) {
	var d *chatPMData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"chatPM\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	if m.chatCheckMuted(sessionData) {
		return
	}

	m.Dispatcher.Chat.ChatPM(sessionData.UserID, sessionData.Username, d.Msg, d.Recipient)
}
