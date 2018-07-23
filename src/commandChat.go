/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: 'hi',
		room: 'lobby',
	}
*/

package main

import (
	"strings"
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
		if s == nil {
			log.Error("Failed to send a chat message because the sender's session was nil.")
			return
		}
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

	// Send the chat message to everyone
	for _, s2 := range sessions {
		s2.NotifyChat(d.Msg, username, d.Discord, d.Server, time.Now())
	}

	// Send the chat message to the Discord "#general" channel if we are replicating a message
	to := discordLobbyChannel
	if d.Server && !d.Echo {
		// Send server messages to a separate channel
		to = discordBotChannel
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		discordSend(to, username, d.Msg)
	}

	// Check for commands
	if !strings.HasPrefix(d.Msg, "/") {
		return
	}

	// First, check for Discord-only commands
	if _, ok := discordCommandMap[d.Msg]; ok {
		if d.Discord {
			// Do nothing, because the command was already handled in the "discord.go" file
			return
		} else {
			d := &CommandData{
				Msg:    "Sorry, but you can only perform the \"" + d.Msg + "\" command from Discord.",
				Room:   d.Room,
				Server: true,
				Echo:   true,
			}
			commandChat(nil, d)
			return
		}
	}

	// Second, check for commands that will work either in the lobby or from Discord
	if strings.HasPrefix(d.Msg, "/random ") || strings.HasPrefix(d.Msg, "/rand ") {
		chatRandom(s, d)
		return
	} else if d.Msg == "/here" {
		chatHere(s)
		return
	}

	// Third, check for commands that will only work from the lobby
	if !d.Discord {
		if d.Msg == "/debug" {
			debug(s, d)
			return
		} else if d.Msg == "/restart" {
			restart(s, d)
			return
		}
	}

	// If we have gotten this far, this is an invalid command
	d = &CommandData{
		Msg:    "That is not a valid command.",
		Room:   "lobby",
		Server: true,
		Echo:   true,
	}
	commandChat(nil, d)
}
