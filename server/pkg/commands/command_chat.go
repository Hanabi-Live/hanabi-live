package commands

import (
	"encoding/json"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type chatData struct {
	Msg  string `json:"msg"`
	Room string `json:"room"`
}

// chat is sent when the user presses enter after typing a text message.
func (m *Manager) chat(sessionData *types.SessionData, commandData []byte) {
	var d *chatData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"chat\" command contained invalid data."
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
