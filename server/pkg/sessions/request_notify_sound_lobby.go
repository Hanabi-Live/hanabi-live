package sessions

type notifySoundLobbyData struct {
	userID int
	file   string
}

type soundLobbyData struct {
	File string `json:"file"`
}

func (m *Manager) NotifySoundLobby(userID int, file string) {
	m.newRequest(requestTypeNotifySoundLobby, &notifySoundLobbyData{ // nolint: errcheck
		userID: userID,
		file:   file,
	})
}

func (m *Manager) notifySoundLobby(data interface{}) {
	var d *notifySoundLobbyData
	if v, ok := data.(*notifySoundLobbyData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.send(d.userID, "soundLobby", &soundLobbyData{
		File: d.file,
	})
}
