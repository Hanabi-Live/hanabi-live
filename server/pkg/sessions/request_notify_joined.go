package sessions

type notifyJoinedData struct {
	userID  int
	tableID int
}

func (m *Manager) NotifyJoined(userID int, tableID int) {
	m.newRequest(requestTypeNotifyJoined, &notifyJoinedData{ // nolint: errcheck
		userID:  userID,
		tableID: tableID,
	})
}

func (m *Manager) notifyJoined(data interface{}) {
	var d *notifyJoinedData
	if v, ok := data.(*notifyJoinedData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type joinedData struct {
		TableID int `json:"tableID"`
	}
	m.send(d.userID, "joined", &joinedData{
		TableID: d.tableID,
	})
}
