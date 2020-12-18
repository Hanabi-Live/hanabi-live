package commands

func (m *Manager) Send(userID int, command string, data interface{}) {
	m.requests <- &request{
		userID:  userID,
		command: command,
		data:    data,
	}
}
