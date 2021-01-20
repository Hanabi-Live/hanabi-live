package sessions

type notifyChatTypingData struct {
	recipientUserID int
	tableID         int
	username        string
	typing          bool
}

func (m *Manager) NotifyChatTyping(recipientUserID int, tableID int, username string, typing bool) {
	m.newRequest(requestTypeNotifyChatTyping, &notifyChatTypingData{ // nolint: errcheck
		recipientUserID: recipientUserID,
		tableID:         tableID,
		username:        username,
		typing:          typing,
	})
}

func (m *Manager) notifyChatTyping(data interface{}) {
	var d *notifyChatTypingData
	if v, ok := data.(*notifyChatTypingData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	type chatTypingData struct {
		TableID  int    `json:"tableID"`
		Username string `json:"username"`
		Typing   bool   `json:"typing"`
	}
	m.send(d.recipientUserID, "chatTyping", &chatTypingData{
		TableID:  d.tableID,
		Username: d.username,
		Typing:   d.typing,
	})
}
