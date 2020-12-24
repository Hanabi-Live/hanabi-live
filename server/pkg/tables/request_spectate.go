package tables

import (
	"fmt"
)

type spectateData struct {
	userID   int
	username string
	tableID  int
}

func (m *Manager) Spectate(userID int, username string, tableID int) {
	m.newRequest(requestTypeSpectate, &spectateData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
	})
}

func (m *Manager) spectate(data interface{}) interface{} {
	var d *spectateData
	if v, ok := data.(*spectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	fmt.Println(d)

	return true
}
