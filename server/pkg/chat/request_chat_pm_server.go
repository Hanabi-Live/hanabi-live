package chat

type chatPMServerData struct {
	msg       string
	recipient string
}

func (m *Manager) ChatPMServer(msg string, recipient string) {
	m.newRequest(requestTypeChatPMServer, &chatPMServerData{ // nolint: errcheck
		msg:       msg,
		recipient: recipient,
	})
}

func (m *Manager) chatPMServer(data interface{}) {
	var d *chatPMServerData
	if v, ok := data.(*chatPMServerData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.chatPM(&chatPMData{
		userID:    0,
		username:  "",
		msg:       d.msg,
		recipient: d.recipient,
		server:    true,
	})
}
