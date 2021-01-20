package chat

type chatPMData struct {
	userID    int
	username  string
	msg       string
	recipient string
	server    bool
}

func (m *Manager) chatPM(d *chatPMData) {
	// Validate and sanitize the chat message
	if v, valid := m.chatSanitize(d.userID, d.msg, false); !valid {
		return
	} else {
		d.msg = v
	}

	// Validate and sanitize the private message recipient
	if v, valid := m.chatSanitize(d.userID, d.recipient, false); !valid {
		return
	} else {
		d.recipient = v
	}

	// The rest of this function is handled in the sessions subpackage,
	// since it is contingent upon the user being online
	m.Dispatcher.Sessions.ChatPM(d.userID, d.username, d.msg, d.recipient, d.server)
}
