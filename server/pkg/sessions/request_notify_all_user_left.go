package sessions

type notifyAllUserLeftData struct {
	leftUserID int
}

func (m *Manager) NotifyAllUserLeft(leftUserID int) {
	if m.requestsClosed.IsSet() {
		return
	}

	m.requests <- &request{
		Type: requestTypeNotifyAllUserLeft,
		Data: &notifyAllUserLeftData{
			leftUserID: leftUserID,
		},
	}
}

func (m *Manager) notifyAllUserLeft(data interface{}) {
	var d *notifyAllUserLeftData
	if v, ok := data.(*notifyAllUserLeftData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type UserLeftData struct {
		UserID int `json:"userID"`
	}
	m.sendAll("userLeft", &UserLeftData{
		UserID: d.leftUserID,
	})
}
