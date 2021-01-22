package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type tableUnspectateData struct {
	TableID int `json:"tableID"`
}

// nolint: godot
// tableUnspectate is sent when the user clicks on the "Lobby" button while they are:
// 1) spectating an ongoing game
// 2) viewing a reply
// 3) viewing a shared replay
func (m *Manager) tableUnspectate(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *tableUnspectateData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := fmt.Sprintf("Your \"%v\" command contained invalid data.", commandName)
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Unspectate(sessionData.UserID, sessionData.Username, d.TableID)
}
