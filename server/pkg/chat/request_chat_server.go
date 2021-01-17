package chat

type chatServerData struct {
	msg  string
	room string
}

// ChatServer is a helper function to send a message from the server to a user.
// (e.g. to give feedback to a user after they type a command, to notify that the server is shutting
// down, etc.)
func (m *Manager) ChatServer(msg string, room string) {
	m.newRequest(requestTypeChatServer, &chatServerData{ // nolint: errcheck
		msg:  msg,
		room: room,
	})
}

func (m *Manager) chatServer(data interface{}) {
	var d *chatServerData
	if v, ok := data.(*chatServerData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.chat(&chatData{
		userID:               0,
		username:             "",
		msg:                  d.msg,
		room:                 d.room,
		discord:              false,
		discordDiscriminator: "",
		server:               true,
	})
}
