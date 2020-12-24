package sessions

type notifyAllTableGoneData struct {
	tableID int
}

func (m *Manager) NotifyAllTableGone(tableID int) {
	m.newRequest(requestTypeNotifyAllTableGone, &notifyAllTableGoneData{ // nolint: errcheck
		tableID: tableID,
	})
}

func (m *Manager) notifyAllTableGone(data interface{}) {
	var d *notifyAllTableGoneData
	if v, ok := data.(*notifyAllTableGoneData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type tableGoneData struct {
		TableID int `json:"tableID"`
	}
	m.sendAll("tableGone", &tableGoneData{
		TableID: d.tableID,
	})
}
