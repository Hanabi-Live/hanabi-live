package commands

import (
	"encoding/json"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type actionData struct {
	TableID    int                  `json:"tableID"`
	ActionType constants.ActionType `json:"type"`

	// If a play or a discard, corresponds to the order of the the card that was played/discarded
	// If a clue, corresponds to the index of the player that received the clue
	// If a game over, corresponds to the index of the player that caused the game to end
	Target int `json:"target"`

	// Optional; only present if a clue
	// If a color clue, then 0 if red, 1 if yellow, etc.
	// If a rank clue, then 1 if 1, 2 if 2, etc.
	// If a game over, then the value corresponds to the "endCondition" values in "constants.go"
	Value int `json:"value"`
}

// action is sent when the user performs an in-game action.
func (m *Manager) action(commandName string, commandData []byte, sessionData *types.SessionData) {
	var d *actionData
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

	t.Action(sessionData.UserID, sessionData.Username, d.ActionType, d.Target, d.Value)
}
