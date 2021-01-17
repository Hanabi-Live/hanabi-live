package table

import (
	"strconv"
)

type startData struct {
	userID int
}

func (m *Manager) Start(userID int) {
	m.newRequest(requestTypeStart, &startData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) start(data interface{}) {
	var d *startData
	if v, ok := data.(*startData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
