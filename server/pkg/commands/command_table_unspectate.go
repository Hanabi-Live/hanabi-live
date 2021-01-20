package commands

import (
	"encoding/json"
)

type unspectateData struct {
	TableID int `json:"tableID"`
}

// nolint: godot
// tableUnspectate is sent when the user clicks on the "Lobby" button while they are:
// 1) spectating an ongoing game
// 2) viewing a reply
// 3) viewing a shared replay
func (m *Manager) tableUnspectate(sessionData *SessionData, commandData []byte) {
	var d *unspectateData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"unspectate\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Unspectate(sessionData.UserID, sessionData.Username, d.TableID)
}
