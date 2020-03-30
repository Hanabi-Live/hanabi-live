package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
)

func commandChatPM(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate the message
	if d.Msg == "" {
		s.Warning("You cannot send a blank message.")
		return
	}

	// Truncate long messages
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	// Validate the recipient
	if d.Recipient == "" {
		s.Warning("You cannot send a private message to a blank recipient.")
		return
	}

	// Validate that they are not sending a private message to themselves
	if strings.EqualFold(d.Recipient, s.Username()) {
		s.Warning("You cannot send a private message to yourself.")
		return
	}

	// Validate that the recipient is online
	var recipientSession *Session
	for _, s2 := range sessions {
		if strings.EqualFold(s2.Username(), d.Recipient) {
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
	sp := bluemonday.StrictPolicy()
	d.Msg = sp.Sanitize(d.Msg)

	/*
		Chat
	*/

	// Log the message
	logger.Info("PM <" + s.Username() + "> --> <" + recipientSession.Username() + "> " + d.Msg)

	// Add the message to the database
	if err := models.ChatLogPM.Insert(s.UserID(), d.Msg, recipientSession.UserID()); err != nil {
		logger.Error("Failed to insert a private message into the database:", err)
		s.Error("")
		return
	}

	// Echo the private message back to the person who sent it
	chatMessage := &ChatMessage{
		Msg:       d.Msg,
		Who:       s.Username(),
		Datetime:  time.Now(),
		Room:      d.Room,
		Recipient: recipientSession.Username(),
	}
	s.Emit("chat", chatMessage)
	recipientSession.Emit("chat", chatMessage)
}
