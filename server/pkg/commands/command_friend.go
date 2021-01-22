package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type friendData struct {
	Username string `json:"username"`
	Add      bool   `json:"add"`
}

// friend is sent when a user adds a new friend.
func (m *Manager) friend(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *friendData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Chat.Friend(
		sessionData.UserID,
		sessionData.Username,
		sessionData.Friends,
		d.Username,
		d.Add,
	)
}
