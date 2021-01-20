package sessions

import (
	"time"
)

type notifyChatServerData struct {
	recipientUserID int
	msg             string
	room            string
}

// NotifyChatServer is a helper function for sending a private message from the server to a user.
// (The message will not be written to the database and will not have the "[PM]" prefix.)
func (m *Manager) NotifyChatServer(recipientUserID int, msg string, room string) {
	m.newRequest(requestTypeNotifyChatServer, &notifyChatServerData{ // nolint: errcheck
		recipientUserID: recipientUserID,
		msg:             msg,
		room:            room,
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

	m.send(d.recipientUserID, "chat", &chatData{
		Username:  "",
		Msg:       d.msg,
		Room:      d.room,
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Recipient: "",
	})
}
