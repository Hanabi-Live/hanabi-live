package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type tableJoinData struct {
	TableID  int    `json:"tableID"`
	Password string `json:"password"`
}

// tableJoin is sent when the user clicks on a table row in the lobby.
func (m *Manager) tableJoin(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *tableJoinData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Join(sessionData.UserID, sessionData.Username, d.TableID, d.Password)
}
