package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type terminateData struct {
	TableID int `json:"tableID"`
}

// tableTerminate is sent when the user clicks the terminate button.
func (m *Manager) tableTerminate(
	commandName string,
	commandData []byte,
	sessionData *types.SessionData,
) {
	var d *terminateData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	t := m.Dispatcher.Tables.GetTable(d.TableID)
	if t == nil {
		msg := fmt.Sprintf("Table %v does not exist, so you cannot unattend it.", d.TableID)
		m.Dispatcher.Sessions.NotifyWarning(sessionData.UserID, msg)
		return
	}

	t.TerminateNormal(sessionData.UserID)
}
