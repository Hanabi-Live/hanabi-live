package chat

type chatNormalData struct {
	userID   int
	username string
	msg      string
	room     string
}

func (m *Manager) ChatNormal(
	userID int,
	username string,
	msg string,
	room string,
) {
	m.newRequest(requestTypeChatNormal, &chatNormalData{ // nolint: errcheck
		userID:   userID,
		username: username,
		msg:      msg,
		room:     room,
	})
}

func (m *Manager) chatNormal(data interface{}) {
	var d *chatNormalData
	if v, ok := data.(*chatNormalData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.chat(&chatData{
		userID:               d.userID,
		username:             d.username,
		msg:                  d.msg,
		room:                 d.room,
		discord:              false,
		discordDiscriminator: "",
		server:               false,
	})
}
