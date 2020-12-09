package commands

import (
	"context"
	"html"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// commandChatPM is sent when a user sends a private message
//
// Example data:
// {
//   msg: 'i secretly adore you',
//   recipient: 'Alice',
// }
func commandChatPM(ctx context.Context, s *Session, d *CommandData) {
	// Check to see if their IP has been muted
	if s != nil && s.Muted {
		s.Warning("You have been muted by an administrator.")
		return
	}

	// Sanitize and validate the chat message
	if v, valid := sanitizeChatInput(s, d.Msg, false); !valid {
		return
	} else {
		d.Msg = v
	}

	// Sanitize and validate the private message recipient
	if v, valid := sanitizeChatInput(s, d.Recipient, false); !valid {
		return
	} else {
		d.Recipient = v
	}

	// Validate that they are not sending a private message to themselves
	normalizedUsername := normalizeString(d.Recipient)
	if normalizedUsername == normalizeString(s.Username) {
		s.Warning("You cannot send a private message to yourself.")
		return
	}

	// Validate that the recipient is online
	sessionList := sessions2.GetList()
	var recipientSession *Session
	for _, s2 := range sessionList {
		if normalizeString(s2.Username) == normalizedUsername {
			recipientSession = s2
			break
		}
	}
	if recipientSession == nil {
		s.Warningf("User \"%v\" is not currently online.", d.Recipient)
		return
	}

	// Escape all HTML special characters (to stop various attacks against other players)
	d.Msg = html.EscapeString(d.Msg)

	chatPM(s, d, recipientSession)
}

func chatPM(s *Session, d *CommandData, recipientSession *Session) {
	// Log the message
	hLog.Infof("PM <%v> --> <%v> %v", s.Username, recipientSession.Username, d.Msg)

	// Add the message to the database
	if err := models.ChatLogPM.Insert(s.UserID, d.Msg, recipientSession.UserID); err != nil {
		hLog.Errorf("Failed to insert a private message into the database: %v", err)
		s.Error(DefaultErrorMsg)
		return
	}

	chatMessage := &ChatMessage{
		Msg:       d.Msg,
		Who:       s.Username,
		Discord:   false,
		Server:    false,
		Datetime:  time.Now(),
		Room:      "",
		Recipient: recipientSession.Username,
	}

	// Echo the private message back to the person who sent it
	s.Emit("chat", chatMessage)

	// Send the private message to the recipient
	recipientSession.Emit("chat", chatMessage)
}
