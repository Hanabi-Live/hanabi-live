package sessions

type notifyAllErrorData struct {
	msg string
}

func (m *Manager) NotifyAllError(msg string) {
	m.newRequest(requestTypeNotifyAllError, &notifyAllErrorData{ // nolint: errcheck
		msg: msg,
	})
}

func (m *Manager) notifyAllError(data interface{}) {
	var d *notifyAllErrorData
	if v, ok := data.(*notifyAllErrorData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type ErrorData struct {
		Error string `json:"error"`
	}
	m.sendAll("error", &ErrorData{
		Error: d.msg,
	})

	m.logger.Infof("Error - All users - %v", d.msg)
}
