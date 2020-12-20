package table

import (
	"strconv"
)

type unspectateData struct {
	userID int
}

// Unspectate requests that the user is removed from being a spectator (in either an ongoing game or
// a replay).
func (m *Manager) Unspectate(userID int) {
	m.newRequest(requestTypeUnspectate, &unspectateData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) unspectate(data interface{}) {
	var d *unspectateData
	if v, ok := data.(*unspectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
