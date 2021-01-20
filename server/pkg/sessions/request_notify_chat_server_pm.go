package sessions

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type notifyChatServerPMData struct {
	recipientUserID   int
	recipientUsername string
	msg               string
}

// NotifyChatServerPM is a helper function for sending a private message from the server to a user.
// (The message will not be written to the database and will have the "[PM]" prefix.)
func (m *Manager) NotifyChatServerPM(recipientUserID int, recipientUsername string, msg string) {
	m.newRequest(requestTypeNotifyChatServerPM, &notifyChatServerPMData{ // nolint: errcheck
		recipientUserID:   recipientUserID,
		recipientUsername: recipientUsername,
		msg:               msg,
	})
}

func (m *Manager) notifyChatServerPM(data interface{}) {
	var d *notifyChatServerPMData
	if v, ok := data.(*notifyChatServerPMData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.send(d.recipientUserID, "chat", &chatData{
		Username:  constants.WebsiteName,
		Msg:       d.msg,
		Room:      "",
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Recipient: d.recipientUsername,
	})
}
