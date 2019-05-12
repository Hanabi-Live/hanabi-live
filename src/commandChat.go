/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: 'hi',
		room: 'lobby',
		// Room can also be "table"
	}
*/

package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
)

const (
	maxChatLength = 300
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
	if d.Username == "" && s != nil {
		d.Username = s.Username()
	}

	/*
		Validate
	*/

	// Validate the message
	if d.Msg == "" {
		if s != nil {
			s.Warning("You cannot send a blank message.")
		}
		return
	}

	// Truncate long messages
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	// Validate the room
	if d.Room != "lobby" && d.Room != "table" {
		s.Warning("That is not a valid room.")
		return
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	rawMsg := d.Msg
	sp := bluemonday.StrictPolicy()
	d.Msg = sp.Sanitize(d.Msg)

	/*
		Chat
	*/

	// Log the message
	text := ""
	if d.Username != "" {
		text += "<" + d.Username
		if d.DiscordDiscriminator != "" {
			text += "#" + d.DiscordDiscriminator
		}
		text += "> "
	}
	text += d.Msg
	log.Info(text)

	// Handle in-table chat in a different function; the rest of this function will be for lobby chat
	if d.Room == "table" {
		commandChatTable(s, d)
		return
	}

	// Add the message to the database
	if d.Discord {
		if err := db.ChatLog.InsertDiscord(d.Username, d.Msg, d.Room); err != nil {
			log.Error("Failed to insert a Discord chat message into the database:", err)
			s.Error("")
			return
		}
	} else if !d.OnlyDiscord {
		if err := db.ChatLog.Insert(userID, d.Msg, d.Room); err != nil {
			log.Error("Failed to insert a chat message into the database:", err)
			s.Error("")
			return
		}
	}

	// Convert Discord mentions from number to username
	d.Msg = chatFillMentions(d.Msg)

	// Convert Discord channel names from number to username
	d.Msg = chatFillChannels(d.Msg)

	// Lobby messages go to everyone
	if !d.OnlyDiscord {
		for _, s2 := range sessions {
			s2.NotifyChat(d.Msg, d.Username, d.Discord, d.Server, time.Now(), d.Room)
		}
	}

	// Send the chat message to the Discord "#general" channel if we are replicating a message
	to := discordLobbyChannel
	if d.Spam {
		// Send spammy messages to a separate channel
		to = discordBotChannel
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		// Scrub "@here" and "@everyone" from user messages
		// (the bot has permissions to perform these actions in the Discord server,
		// so we need to escape them to prevent abuse from lobby users)
		if !d.Server {
			rawMsg = strings.Replace(rawMsg, "@everyone", "AtEveryone", -1)
			rawMsg = strings.Replace(rawMsg, "@here", "AtHere", -1)
		}

		// We use "rawMsg" instead of "d.Msg" because we want to send the unsanitized message
		// The bluemonday library is intended for HTML rendering, and Discord can handle any special characters
		discordSend(to, d.Username, rawMsg)
	}

	// Check for commands
	chatCommand(s, d, nil) // We pass nil as the third argument because there is no associated table
}

func commandChatTable(s *Session, d *CommandData) {
	// If this is a server-generated message, it will have an explicit table ID set
	tableID := d.TableID
	if tableID == 0 && s != nil {
		// Otherwise, retrieve the ID of the table that the user is currently playing
		tableID = s.CurrentTable()
	} else if tableID == 0 {
		log.Error("The \"commandChatTable\" function was called with a table ID of 0.")
		return
	}

	// Validate that the user is in a table
	if tableID == -1 {
		s.Warning("You cannot send table chat if you are not in a table.")
		return
	}

	// Get the corresponding table
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that this player is in the table or spectating
	if !d.Server && t.GameSpec.GetPlayerIndex(s.UserID()) == -1 && t.GetSpectatorIndex(s.UserID()) == -1 {
		s.Warning("You are not playing or spectating table " + strconv.Itoa(tableID) + ", so you cannot send chat to it.")
		return
	}

	// Store the chat in memory for later
	userID := 0
	if !d.Server && s != nil {
		userID = s.UserID()
	}
	chatMsg := &TableChatMessage{
		UserID:   userID,
		Username: d.Username, // This was prepared above in the "commandChat()" function
		Msg:      d.Msg,
		Datetime: time.Now(),
	}
	t.Chat = append(t.Chat, chatMsg)

	// Send it to all of the players and spectators
	if !t.Game.Replay {
		for _, p := range t.GameSpec.Players {
			if p.Present {
				p.Session.NotifyChat(d.Msg, d.Username, d.Discord, d.Server, chatMsg.Datetime, d.Room)
				t.ChatRead[p.ID] = len(t.Chat)
			}
		}
	}
	for _, sp := range t.Spectators {
		sp.Session.NotifyChat(d.Msg, d.Username, d.Discord, d.Server, chatMsg.Datetime, d.Room)
		t.ChatRead[sp.ID] = len(t.Chat)
	}

	// Check for commands
	chatCommand(s, d, t)
}
