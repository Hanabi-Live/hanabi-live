package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type chatData struct {
	Msg  string `json:"msg"`
	Room string `json:"room"`
}

// chat is sent when the user presses enter after typing a text message.
func (m *Manager) chat(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *chatData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	if m.chatCheckMuted(sessionData) {
		return
	}

	m.Dispatcher.Chat.ChatNormal(sessionData.UserID, sessionData.Username, d.Msg, d.Room)
}

func (m *Manager) chatCheckMuted(sessionData *types.SessionData) bool {
	if sessionData.Muted {
		msg := "You have been muted by an administrator."
		m.Dispatcher.Sessions.NotifyWarning(sessionData.UserID, msg)
		return true
	}

	return false
}
