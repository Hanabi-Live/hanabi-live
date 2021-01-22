package core

type setMaintenanceData struct {
	enabled bool
}

func (m *Manager) SetMaintenance(enabled bool) {
	m.newRequest(requestTypeSetMaintenance, &setMaintenanceData{ // nolint: errcheck
		enabled: enabled,
	})
}

func (m *Manager) setMaintenance(data interface{}) {
	var d *setMaintenanceData
	if v, ok := data.(*setMaintenanceData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.maintenance(d.enabled)
}
