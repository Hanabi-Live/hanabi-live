package commands

func (m *Manager) Send(userID int, command string, data interface{}) {
	if m.requestsClosed.IsSet() {
		return
	}

	m.requests <- &request{
		reqType: requestTypeNormal,
		userID:  userID,
		command: command,
		data:    data,
	}
}
