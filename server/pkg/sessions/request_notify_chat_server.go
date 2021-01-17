package sessions

import (
	"time"
)

type notifyChatServerData struct {
	userID int
	msg    string
	room   string
}

// NotifyChatServer is a helper function for sending a private message from the server to a user.
// (The message will not be written to the database.)
func (m *Manager) NotifyChatServer(userID int, msg string, room string) {
	m.newRequest(requestTypeNotifyAllChat, &notifyChatServerData{ // nolint: errcheck
		msg:  msg,
		room: room,
	})
}

func (m *Manager) notifyChatServer(data interface{}) {
	var d *notifyChatServerData
	if v, ok := data.(*notifyChatServerData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.send(d.userID, "chat", &chatData{
		Msg:       d.msg,
		Who:       "",
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Room:      d.room,
		Recipient: "",
	})
}
