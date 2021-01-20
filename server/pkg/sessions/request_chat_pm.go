package sessions

import (
	"context"
	"fmt"
	"html"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type chatPMData struct {
	userID    int
	username  string
	msg       string
	recipient string
	server    bool
}

func (m *Manager) ChatPM(userID int, username string, msg string, recipient string, server bool) {
	m.newRequest(requestTypeChatPM, &chatPMData{ // nolint: errcheck
		userID:    userID,
		username:  username,
		msg:       msg,
		recipient: recipient,
		server:    server,
	})
}

func (m *Manager) chatPM(data interface{}) {
	var d *chatPMData
	if v, ok := data.(*chatPMData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Validate that they are not sending a private message to themselves
	normalizedRecipient := util.NormalizeString(d.recipient)
	if normalizedRecipient == util.NormalizeString(d.username) {
		msg := "You cannot send a private message to yourself."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate that the recipient is online
	var recipientSession *session
	for _, s := range m.sessions {
		if util.NormalizeString(s.username) == normalizedRecipient {
			recipientSession = s
			break
		}
	}
	if recipientSession == nil {
		m.notifyWarning(&notifyWarningData{
			userID: d.userID,
			msg:    fmt.Sprintf("User \"%v\" is not currently online.", d.recipient),
		})
		return
	}

	// Escape all HTML special characters (to stop various attacks against other players)
	d.msg = html.EscapeString(d.msg)

	// Log the message
	m.logger.Infof("PM <%v> --> <%v> %v", d.username, recipientSession.username, d.msg)

	// Add the message to the database
	if err := m.models.ChatLogPM.Insert(
		context.Background(),
		d.userID,
		d.msg,
		recipientSession.userID,
	); err != nil {
		m.logger.Errorf("Failed to insert a private message into the database: %v", err)
		m.notifyError(&notifyErrorData{
			userID: d.userID,
			msg:    constants.DefaultErrorMsg,
		})
		return
	}
}

/*
	chatMessage := &ChatMessage{
		Username:       s.Username,
		Msg:       d.Msg,
		Room:      "",
		Discord:   false,
		Server:    false,
		Datetime:  time.Now(),
		Recipient: recipientSession.Username,
	}

	// Echo the private message back to the person who sent it
	s.Emit("chat", chatMessage)

	// Send the private message to the recipient
	recipientSession.Emit("chat", chatMessage)
}
*/
