package sessions

type notifyErrorData struct {
	userID int
	msg    string
}

// NotifyError is used to inform a user if their command was unsuccessful or something else went
// wrong.
func (m *Manager) NotifyError(userID int, msg string) {
	m.newRequest(requestTypeNotifyError, &notifyErrorData{ // nolint: errcheck
		userID: userID,
		msg:    msg,
	})
}

func (m *Manager) notifyError(data interface{}) {
	var d *notifyErrorData
	if v, ok := data.(*notifyErrorData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type ErrorData struct {
		Error string `json:"error"`
	}
	m.send(d.userID, "error", &ErrorData{
		Error: d.msg,
	})

	m.logger.Infof("Error - User %v - %v", d.userID, d.msg)
}
