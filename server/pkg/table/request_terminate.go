package table

import (
	"strconv"
)

type terminateData struct {
	userID int
}

func (m *Manager) Terminate(userID int) {
	m.newRequest(requestTypeTerminate, &terminateData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) terminate(data interface{}) {
	var d *terminateData
	if v, ok := data.(*terminateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
