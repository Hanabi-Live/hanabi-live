package sessions

import (
	"time"
)

type notifyAllChatData struct {
	username string
	msg      string
	room     string
	discord  bool
	server   bool
}

func (m *Manager) NotifyAllChat(
	username string,
	msg string,
	room string,
	discord bool,
	server bool,
) {
	m.newRequest(requestTypeNotifyAllChat, &notifyAllChatData{ // nolint: errcheck
		username: username,
		msg:      msg,
		room:     room,
		discord:  discord,
		server:   server,
	})
}

func (m *Manager) notifyAllChat(data interface{}) {
	var d *notifyAllChatData
	if v, ok := data.(*notifyAllChatData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.sendAll("chat", &chatData{
		Username:  d.username,
		Msg:       d.msg,
		Room:      d.room,
		Discord:   d.discord,
		Server:    d.server,
		Datetime:  time.Now(),
		Recipient: "",
	})
}
