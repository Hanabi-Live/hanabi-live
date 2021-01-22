package core

import (
	"time"
)

type setShutdownData struct {
	enabled bool
}

func (m *Manager) SetShutdown(enabled bool) {
	m.newRequest(requestTypeSetShutdown, &setShutdownData{ // nolint: errcheck
		enabled: enabled,
	})
}

func (m *Manager) setShutdown(data interface{}) {
	var d *setShutdownData
	if v, ok := data.(*setShutdownData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.shuttingDown.SetTo(d.enabled)
	m.datetimeShutdownInit = time.Now()

	if d.enabled {
		m.Dispatcher.Tables.GracefulShutdown(m.datetimeShutdownInit)
	}
}
