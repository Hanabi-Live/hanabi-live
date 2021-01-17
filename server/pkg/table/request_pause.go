package table

import (
	"strconv"
)

type pauseData struct {
	userID  int
	setting string
}

func (m *Manager) Pause(userID int, setting string) {
	m.newRequest(requestTypePause, &pauseData{ // nolint: errcheck
		userID:  userID,
		setting: setting,
	})
}

func (m *Manager) pause(data interface{}) {
	var d *pauseData
	if v, ok := data.(*pauseData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
