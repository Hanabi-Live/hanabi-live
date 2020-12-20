package commands

import (
	"github.com/Zamiell/hanabi-live/server/pkg/tables"
)

// tableCreate is sent when the user submits the "Create a New Game" form.
func (m *Manager) tableCreate(userID int, username string, data interface{}) {
	var d *tables.NewData
	if v, ok := data.(*tables.NewData); !ok {
		m.Dispatcher.Sessions.NotifyError("Your \"tableCreate\" command contained invalid data.")
		return
	} else {
		d = v
	}

	m.Dispatcher.Tables.New(userID, username, d)
}
