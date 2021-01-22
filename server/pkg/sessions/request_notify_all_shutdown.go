package sessions

import (
	"time"
)

type notifyAllShutdownData struct {
	shuttingDown         bool
	datetimeShutdownInit time.Time
}

func (m *Manager) NotifyAllShutdown(shuttingDown bool, datetimeShutdownInit time.Time) {
	m.newRequest(requestTypeNotifyAllShutdown, &notifyAllShutdownData{ // nolint: errcheck
		shuttingDown:         shuttingDown,
		datetimeShutdownInit: datetimeShutdownInit,
	})
}

func (m *Manager) notifyAllShutdown(data interface{}) {
	var d *notifyAllShutdownData
	if v, ok := data.(*notifyAllShutdownData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type shutdownData struct {
		ShuttingDown         bool      `json:"shuttingDown"`
		DatetimeShutdownInit time.Time `json:"datetimeShutdownInit"`
	}
	m.sendAll("shutdown", &shutdownData{
		ShuttingDown:         d.shuttingDown,
		DatetimeShutdownInit: d.datetimeShutdownInit,
	})
}
