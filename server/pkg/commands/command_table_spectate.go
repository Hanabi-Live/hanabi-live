package commands

import (
	"encoding/json"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type tableSpectateData struct {
	TableID int `json:"tableID"`
	// A ShadowingPlayerIndex of "-1" must be specified if they do not want to shadow a player
	ShadowingPlayerIndex int `json:"shadowingPlayerIndex"`
}

// nolint: godot
// tableSpectate is sent when:
// 1) the user clicks on the "Spectate" button in the lobby
// 2) the user creates a solo replay
// 3) the user creates a shared replay
// 4) on behalf of a user when they reconnect after having been in a shared replay
func (m *Manager) tableSpectate(sessionData *types.SessionData, commandData []byte) {
	var d *tableSpectateData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"unspectate\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.Spectate(sessionData.UserID, sessionData.Username, d.TableID)
}
