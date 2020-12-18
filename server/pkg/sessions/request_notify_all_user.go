package sessions

type notifyAllUserData struct {
	changedUserID int
}

func (m *Manager) NotifyAllUser(changedUserID int) {
	if m.requestsClosed.IsSet() {
		return
	}

	m.requests <- &request{
		Type: requestTypeNotifyAllUserLeft,
		Data: &notifyAllUserData{
			changedUserID: changedUserID,
		},
	}
}

func (m *Manager) notifyAllUser(data interface{}) {
	var d *notifyAllUserData
	if v, ok := data.(*notifyAllUserData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	var s *session
	if v, ok := m.sessions[d.changedUserID]; !ok {
		// Other server components might be trying to send a message to a user who has already
		// disconnected, so just ignore this request
		return
	} else {
		s = v
	}

	m.sendAll("user", makeUser(s))
}
