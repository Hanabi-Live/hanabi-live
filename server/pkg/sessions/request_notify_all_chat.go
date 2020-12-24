package sessions

import (
	"time"
)

type notifyAllChatData struct {
	msg     string
	who     string
	discord bool
	server  bool
	room    string
}

func (m *Manager) NotifyAllChat(msg string, who string, discord bool, server bool, room string) {
	m.newRequest(requestTypeNotifyAllChat, &notifyAllChatData{ // nolint: errcheck
		msg:     msg,
		who:     who,
		discord: discord,
		server:  server,
		room:    room,
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
		Msg:       d.msg,
		Who:       d.who,
		Discord:   d.discord,
		Server:    d.server,
		Datetime:  time.Now(),
		Room:      d.room,
		Recipient: "",
	})
}
