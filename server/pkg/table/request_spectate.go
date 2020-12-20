package table

import (
	"strconv"
)

type spectateData struct {
	userID int
}

// Spectate requests that the user is added as a spectator (in either an ongoing game or a replay).
func (m *Manager) Spectate(userID int) {
	m.newRequest(requestTypeSpectate, &spectateData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) spectate(data interface{}) {
	var d *spectateData
	if v, ok := data.(*spectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
