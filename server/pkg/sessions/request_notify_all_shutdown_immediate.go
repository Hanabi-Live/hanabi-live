package sessions

func (m *Manager) NotifyAllShutdownImmediate() {
	m.newRequest(requestTypeNotifyAllShutdownImmediate, nil) // nolint: errcheck
}

func (m *Manager) notifyAllShutdownImmediate(data interface{}) {
	msg := "The server is going down for scheduled maintenance.<br />" +
		"The server might be down for a while; please see the Discord server for more specific updates."
	m.notifyAllError(&notifyAllErrorData{
		msg: msg,
	})

	m.notifyAllSoundLobby(&notifyAllSoundLobbyData{
		file: "shutdown",
	})
}
