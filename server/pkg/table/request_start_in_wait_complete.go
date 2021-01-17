package table

import (
	"time"
)

type startInWaitCompleteData struct {
	datetimePlannedStart time.Time
}

func (m *Manager) StartInWaitComplete(datetimePlannedStart time.Time) {
	m.newRequest(requestTypeStartInWaitComplete, &startInWaitCompleteData{ // nolint: errcheck
		datetimePlannedStart: datetimePlannedStart,
	})
}

func (m *Manager) startInWaitComplete(data interface{}) {
	var d *startInWaitCompleteData
	if v, ok := data.(*startInWaitCompleteData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Check to see if the game has already started
	if m.table.Running {
		return
	}

	// Check to see if the planned start time has changed
	if d.datetimePlannedStart != m.table.DatetimePlannedStart {
		return
	}

	// Check to see if the owner is present
	for _, p := range m.table.Players {
		if p.UserID == m.table.OwnerID {
			if !p.Present {
				msg := "Aborting automatic game start since the table creator is away."
				m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())
				return
			}

			m.logger.Infof(
				"%v - Automatically starting (from the /startin command).",
				m.table.getName(),
			)
			m.Start(m.table.OwnerID)
			return
		}
	}

	msg := "Aborting automatic game start since the owner was not found."
	m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())

	m.logger.Errorf(
		"%v - Failed to find the owner of the game when attempting to automatically start it.",
		m.table.getName(),
	)
}
