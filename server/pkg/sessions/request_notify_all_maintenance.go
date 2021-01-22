package sessions

type notifyAllMaintenanceData struct {
	maintenanceMode bool
}

func (m *Manager) NotifyAllMaintenance(maintenanceMode bool) {
	m.newRequest(requestTypeNotifyAllMaintenance, &notifyAllMaintenanceData{ // nolint: errcheck
		maintenanceMode: maintenanceMode,
	})
}

func (m *Manager) notifyAllMaintenance(data interface{}) {
	var d *notifyAllMaintenanceData
	if v, ok := data.(*notifyAllMaintenanceData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type maintenanceData struct {
		MaintenanceMode bool `json:"maintenanceMode"`
	}
	m.sendAll("maintenance", &maintenanceData{
		MaintenanceMode: d.maintenanceMode,
	})
}
