package main

import (
	"html"
	"time"
)

// commandChatPM is sent when a user sends a private message
//
// Example data:
// {
//   msg: 'i secretly adore you',
//   recipient: 'Alice',
// }
func commandChatPM(s *Session, d *CommandData) {
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
	var recipientSession *Session
	sessionsMutex.RLock()
	for _, s2 := range sessions {
		if normalizeString(s2.Username) == normalizedUsername {
			recipientSession = s2
			break
		}
	}
	sessionsMutex.RUnlock()
	if recipientSession == nil {
		s.Warning("User \"" + d.Recipient + "\" is not currently online.")
		return
	}

	// Escape all HTML special characters (to stop various attacks against other players)
	d.Msg = html.EscapeString(d.Msg)

	chatPM(s, d, recipientSession)
}

func chatPM(s *Session, d *CommandData, recipientSession *Session) {
	// Log the message
	logger.Info("PM <" + s.Username + "> --> <" + recipientSession.Username + "> " + d.Msg)

	// Add the message to the database
	if err := models.ChatLogPM.Insert(s.UserID, d.Msg, recipientSession.UserID); err != nil {
		logger.Error("Failed to insert a private message into the database:", err)
		s.Error("")
		return
	}

	chatMessage := &ChatMessage{
		Msg:       d.Msg,
		Who:       s.Username,
		Datetime:  time.Now(),
		Recipient: recipientSession.Username,
	}

	// Echo the private message back to the person who sent it
	s.Emit("chat", chatMessage)

	// Send the private message to the recipient
	recipientSession.Emit("chat", chatMessage)
}
