package table

import (
	"strconv"
)

type unattendData struct {
	userID int
}

// Unattend requests that a user playing in an ongoing game is marked as being disconnected.
func (m *Manager) Unattend(userID int) {
	m.requests <- &request{
		Type: requestTypeUnattend,
		Data: &unattendData{
			userID: userID,
		},
	}
}

func (m *Manager) unattend(data interface{}) {
	var d *unattendData
	if v, ok := data.(*unattendData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
