package table

func (m *Manager) TerminateServer() {
	m.newRequest(requestTypeTerminateServer, nil) // nolint: errcheck
}

func (m *Manager) terminateServer(data interface{}) {
	// Local variables
	t := m.table

	// Only terminate ongoing games
	if !t.Running || t.Replay {
		return
	}

	/*
		// TODO
		m.action(&actionData{
			type:        constants.ActionTypeEndGame,
			 // A player index of -1 indicates that it is the server performing the termination
			target: -1,
			value:       constants.EndConditionTerminated,
		})
	*/
}
