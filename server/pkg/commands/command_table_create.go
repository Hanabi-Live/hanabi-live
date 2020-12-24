package commands

import (
	"encoding/json"

	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

type tableCreateData struct {
	Name     string           `json:"name"`
	Options  *options.Options `json:"options"`
	Password string           `json:"password"`
	GameJSON *table.GameJSON  `json:"gameJSON"`
}

// tableCreate is sent when the user submits the "Create a New Game" form.
func (m *Manager) tableCreate(sessionData *SessionData, commandData []byte) {
	var d *tableCreateData
	if err := json.Unmarshal(commandData, &d); err != nil {
		msg := "Your \"tableCreate\" command contained invalid data."
		m.Dispatcher.Sessions.NotifyError(sessionData.UserID, msg)
		return
	}

	m.Dispatcher.Tables.New(
		sessionData.UserID,
		sessionData.Username,
		d.Name,
		d.Options,
		d.Password,
		d.GameJSON,
		false,
	)
}
