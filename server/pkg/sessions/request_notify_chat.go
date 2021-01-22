package sessions

import (
	"time"
)

type notifyChatData struct {
	recipientUserID int
	username        string
	msg             string
	room            string
}

// NotifyChatServer is a helper function for sending a private message from the server to a user.
// (The message will not be written to the database and will not have the "[PM]" prefix.)
func (m *Manager) NotifyChat(recipientUserID int, username string, msg string, room string) {
	m.newRequest(requestTypeNotifyChat, &notifyChatData{ // nolint: errcheck
		recipientUserID: recipientUserID,
		username:        username,
		msg:             msg,
		room:            room,
	})
}

func (m *Manager) notifyChat(data interface{}) {
	var d *notifyChatData
	if v, ok := data.(*notifyChatData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.send(d.recipientUserID, "chat", &chatData{
		Username:  d.username,
		Msg:       d.msg,
		Room:      d.room,
		Discord:   false,
		Server:    false,
		Datetime:  time.Now(),
		Recipient: "",
	})
}
