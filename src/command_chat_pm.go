package main

import (
	"strconv"
	"strings"
	"time"
)

// commandChatPM is sent when a user sends a private message
//
// Example data:
// {
//   msg: 'i secretly adore you',
//   recipient: 'Alice',
//   room: 'lobby', // Room can also be "table1", "table1234", etc.
// }
func commandChatPM(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Check to see if their IP has been muted
	if s != nil && s.Muted() {
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
	normalizedUsername := normalizeUsername(d.Recipient)
	if normalizedUsername == normalizeUsername(s.Username()) {
		s.Warning("You cannot send a private message to yourself.")
		return
	}

	// Validate that the recipient is online
	var recipientSession *Session
	for _, s2 := range sessions {
		if normalizeUsername(s2.Username()) == normalizedUsername {
			recipientSession = s2
			break
		}
	}
	if recipientSession == nil {
		s.Warning("User \"" + d.Recipient + "\" is not currently online.")
		return
	}

	// Validate the room
	if d.Room != "lobby" && !strings.HasPrefix(d.Room, "table") {
		s.Warning("That is not a valid room.")
		return
	}
	if strings.HasPrefix(d.Room, "table") {
		// Parse the table ID from the room
		match := lobbyRoomRegExp.FindStringSubmatch(d.Room)
		if match == nil {
			logger.Error("Failed to parse the table ID from the room:", d.Room)
			s.Error("That is an invalid room.")
			return
		}
		var tableID int
		if v, err := strconv.Atoi(match[1]); err != nil {
			logger.Error("Failed to convert the table ID to a number:", err)
			s.Error("That is an invalid room.")
			return
		} else {
			tableID = v
		}

		// Get the corresponding table
		var t *Table
		if v, ok := tables[tableID]; !ok {
			s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
			return
		} else {
			t = v
		}

		// Validate that this player is in the game or spectating
		if t.GetPlayerIndexFromID(s.UserID()) == -1 && t.GetSpectatorIndexFromID(s.UserID()) == -1 {
			s.Warning("You are not playing or spectating at table " + strconv.Itoa(tableID) + ", " +
				"so you cannot send chat to it.")
			return
		}
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	d.Msg = bluemondayStrictPolicy.Sanitize(d.Msg)

	/*
		Private message
	*/

	// Log the message
	logger.Info("PM <" + s.Username() + "> --> <" + recipientSession.Username() + "> " + d.Msg)

	// Add the message to the database
	if err := models.ChatLogPM.Insert(s.UserID(), d.Msg, recipientSession.UserID()); err != nil {
		logger.Error("Failed to insert a private message into the database:", err)
		s.Error("")
		return
	}

	chatMessage := &ChatMessage{
		Msg:       d.Msg,
		Who:       s.Username(),
		Datetime:  time.Now(),
		Room:      d.Room,
		Recipient: recipientSession.Username(),
	}

	// Echo the private message back to the person who sent it
	s.Emit("chat", chatMessage)

	// Send the private message to the recipient
	recipientSession.Emit("chat", chatMessage)
}
