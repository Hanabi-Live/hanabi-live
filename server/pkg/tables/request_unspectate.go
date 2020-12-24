package tables

import (
	"fmt"
)

type unspectateData struct {
	userID   int
	username string
	tableID  int
}

func (m *Manager) Unspectate(userID int, username string, tableID int) {
	m.newRequest(requestTypeUnspectate, &unspectateData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
	})
}

func (m *Manager) unspectate(data interface{}) interface{} {
	var d *unspectateData
	if v, ok := data.(*unspectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	fmt.Println(d)

	return true
}
