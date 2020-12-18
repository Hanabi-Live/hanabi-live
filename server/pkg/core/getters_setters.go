package core

import (
	"time"
)

func (m *Manager) ShuttingDown() bool {
	return m.shuttingDown.IsSet()
}

func (m *Manager) DatetimeShutdownInit() time.Time {
	return m.datetimeShutdownInit
}

func (m *Manager) MaintenanceMode() bool {
	return m.maintenanceMode.IsSet()
}
