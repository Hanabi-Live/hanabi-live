/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: "hi",
	}
*/

package main

import (
	"time"
)

const (
	maxChatLength = 250
)

func commandChat(s *Session, d *CommandData) {
	// Local variables
	var userID int
	if d.Discord || d.Server {
		userID = 0
	} else {
		userID = s.UserID()
	}
	var username string
	if d.Username != "" || d.Server {
		username = d.Username
	} else {
		username = s.Username()
	}

	/*
		Validate
	*/

	// Validate the message
	if d.Msg == "" {
		if s != nil {
			s.Error("You cannot send a blank message.")
		}
		return
	}

	// Truncate long messages
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	// Validate the room
	if d.Room != "lobby" {
		s.Error("That is not a valid room.")
	}

	/*
		Chat
	*/

	// Add the message to the database
	if d.Discord {
		if err := db.ChatLog.InsertDiscord(username, d.Msg); err != nil {
			log.Error("Failed to insert a Discord chat message into the database:", err)
			if s != nil {
				s.Error("Failed to insert a Discord chat message into the database. Please contact an administrator.")
			}
			return
		}
	} else {
		if err := db.ChatLog.Insert(userID, d.Msg, d.Room); err != nil {
			log.Error("Failed to insert a chat message into the database:", err)
			if s != nil {
				s.Error("Failed to insert a chat message into the database. Please contact an administrator.")
			}
			return
		}
	}

	// Log the message
	text := ""
	if !d.Server || d.Discord {
		text += "<" + username + "> "
	}
	text += d.Msg
	log.Info(text)

	// Check for special commands (that should not be echoed)
	if s != nil {
		if d.Msg == "/debug" {
			debug(s, d)
			return
		} else if d.Msg == "/restart" {
			restart(s, d)
			return
		}
	}

	// Send the chat message to everyone
	for _, s2 := range sessions {
		s2.NotifyChat(d.Msg, username, d.Discord, d.Server, time.Now())
	}

	// Send the chat message to the Discord "#general" channel if we are replicating a message
	to := discordLobbyChannel
	if d.Server {
		// Send server messages to a separate channel
		to = discordBotChannel
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		discordSend(to, username, d.Msg)
	}
}

type ChatMessage struct {
	Msg      string    `json:"msg"`
	Who      string    `json:"who"`
	Discord  bool      `json:"discord"`
	Server   bool      `json:"server"`
	Datetime time.Time `json:"datetime"`
}

func chatMakeMessage(msg string, who string, discord bool, server bool, datetime time.Time) *ChatMessage {
	return &ChatMessage{
		Msg:      msg,
		Who:      who,
		Discord:  discord,
		Server:   server,
		Datetime: datetime,
	}
}
