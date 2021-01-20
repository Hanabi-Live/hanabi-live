package commands

import (
	"encoding/json"
)

type friendData struct {
	Username string `json:"username"`
	Add      bool   `json:"add"`
}

// friend is sent when a user adds a new friend.
func (m *Manager) friend(sessionData *SessionData, commandData []byte) {
	var d *friendData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"friend\" command contained invalid data."
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
