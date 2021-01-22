package sessions

type notifyAllSoundLobbyData struct {
	file string
}

func (m *Manager) NotifyAllSoundLobby(file string) {
	m.newRequest(requestTypeNotifyAllSoundLobby, &notifyAllSoundLobbyData{ // nolint: errcheck
		file: file,
	})
}

func (m *Manager) notifyAllSoundLobby(data interface{}) {
	var d *notifyAllSoundLobbyData
	if v, ok := data.(*notifyAllSoundLobbyData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.sendAll("soundLobby", &soundLobbyData{
		File: d.file,
	})
}
