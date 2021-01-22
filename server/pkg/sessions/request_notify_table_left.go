package sessions

type notifyTableLeftData struct {
	userID  int
	tableID int
}

func (m *Manager) NotifyTableLeft(userID int, tableID int) {
	m.newRequest(requestTypeNotifyTableLeft, &notifyTableLeftData{ // nolint: errcheck
		userID:  userID,
		tableID: tableID,
	})
}

func (m *Manager) notifyTableLeft(data interface{}) {
	var d *notifyTableLeftData
	if v, ok := data.(*notifyTableLeftData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type tableLeftData struct {
		TableID int `json:"tableID"`
	}
	m.send(d.userID, "tableLeft", &tableLeftData{
		TableID: d.tableID,
	})
}
