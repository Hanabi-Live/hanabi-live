package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type chatPMData struct {
	Msg       string `json:"msg"`
	Recipient string `json:"recipient"`
}

// chatPM is sent when a user sends a private message.
func (m *Manager) chatPM(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *chatPMData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	if m.chatCheckMuted(sessionData) {
		return
	}

	m.Dispatcher.Chat.ChatPM(sessionData.UserID, sessionData.Username, d.Msg, d.Recipient)
}
