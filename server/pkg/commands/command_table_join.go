package commands

import (
	"encoding/json"
)

type tableJoinData struct {
	TableID  int    `json:"tableID"`
	Password string `json:"password"`
}

// tableJoin is sent when the user clicks on a table row in the lobby.
func (m *Manager) tableJoin(sessionData *SessionData, commandData []byte) {
	var d *tableJoinData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"tableJoin\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Join(sessionData.UserID, sessionData.Username, d.TableID, d.Password)
}
