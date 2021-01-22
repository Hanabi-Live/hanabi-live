package table

type chatServerData struct {
	msg string
}

func (m *Manager) ChatServer(msg string) {
	m.newRequest(requestTypeChatServer, &chatServerData{ // nolint: errcheck
		msg: msg,
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

	m.chat(0, "", d.msg, true)
}
