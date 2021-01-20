package chat

type chatPMNormalData struct {
	userID    int
	username  string
	msg       string
	recipient string
}

func (m *Manager) ChatPMNormal(userID int, username string, msg string, recipient string) {
	m.newRequest(requestTypeChatPMNormal, &chatPMNormalData{ // nolint: errcheck
		userID:    userID,
		username:  username,
		msg:       msg,
		recipient: recipient,
	})
}

func (m *Manager) chatPMNormal(data interface{}) {
	var d *chatPMNormalData
	if v, ok := data.(*chatPMNormalData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.chatPM(&chatPMData{
		userID:    d.userID,
		username:  d.username,
		msg:       d.msg,
		recipient: d.recipient,
		server:    false,
	})
}
