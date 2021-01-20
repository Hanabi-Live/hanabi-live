package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type unattendData struct {
	TableID int `json:"tableID"`
}

// tableUnattend is sent when the user clicks on the "Lobby" button while they are playing in an
// ongoing game.
func (m *Manager) tableUnattend(sessionData *types.SessionData, commandData []byte) {
	var d *unattendData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"unattend\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	t := m.Dispatcher.Tables.GetTable(d.TableID)
	if t == nil {
		msg := fmt.Sprintf("Table %v does not exist, so you cannot unattend it.", d.TableID)
		m.Dispatcher.Sessions.NotifyWarning(sessionData.UserID, msg)
		return
	}

	t.Unattend(sessionData.UserID, sessionData.Username)
}
