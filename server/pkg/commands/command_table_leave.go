package commands

import (
	"encoding/json"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type tableLeaveData struct {
	TableID int `json:"tableID"`
}

// tableLeave is sent when the user clicks on the "Leave Game" button in the lobby.
func (m *Manager) tableLeave(sessionData *types.SessionData, commandData []byte) {
	var d *tableLeaveData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"tableLeave\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Leave(sessionData.UserID, sessionData.Username, d.TableID)
}
