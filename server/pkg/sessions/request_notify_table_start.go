package sessions

type notifyTableStartData struct {
	userID  int
	tableID int
}

func (m *Manager) NotifyTableStart(userID int, tableID int) {
	m.newRequest(requestTypeNotifyTableStart, &notifyTableStartData{ // nolint: errcheck
		userID:  userID,
		tableID: tableID,
	})
}

func (m *Manager) notifyTableStart(data interface{}) {
	var d *notifyTableStartData
	if v, ok := data.(*notifyTableStartData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type tableStartData struct {
		TableID int `json:"tableID"`
	}
	m.send(d.userID, "tableStart", &tableStartData{
		TableID: d.tableID,
	})
}
