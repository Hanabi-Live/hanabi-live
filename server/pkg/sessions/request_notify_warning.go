package sessions

type notifyWarningData struct {
	userID int
	msg    string
}

func (m *Manager) NotifyWarning(userID int, msg string) {
	if m.requestsClosed.IsSet() {
		return
	}

	m.requests <- &request{
		Type: requestTypeNotifyWarning,
		Data: &notifyWarningData{
			userID: userID,
			msg:    msg,
		},
	}
}

func (m *Manager) notifyWarning(data interface{}) {
	var d *notifyWarningData
	if v, ok := data.(*notifyWarningData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type WarningData struct {
		Warning string `json:"warning"`
	}
	m.send(d.userID, "warning", &WarningData{
		Warning: d.msg,
	})

	m.logger.Infof("Error - User %v - %v", d.userID, d.msg)
}
