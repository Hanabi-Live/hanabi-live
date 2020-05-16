package main

import (
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/microcosm-cc/bluemonday"
)

const (
	maxChatLength = 300
)

var (
	lobbyRoomRegExp = regexp.MustCompile(`table(\d+)`)
)

// commandChat is sent when the user presses enter after typing a text message
// It is also used by the server to send chat messages
// Unlike many other commands, this command can be called with a nil session (by the server),
// so we have to check for this before displaying WebSocket error messages
//
// Example data:
// {
//   msg: 'hi',
//   room: 'lobby', // Room can also be "table1", "table1234", etc.
// }
func commandChat(s *Session, d *CommandData) {
	// Local variables
	var userID int
	if d.Discord || d.Server {
		userID = 0
	} else {
		if s == nil {
			logger.Error("Failed to send a chat message because the sender's session was nil.")
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

	// Check to see if their IP has been muted
	if s != nil && s.Muted() {
		s.Warning("You have been muted by an administrator.")
		return
	}

	// Truncate long messages
	// (we do this first to prevent wasting CPU cycles on validating extremely long messages)
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	// Trim whitespace from both sides of the message
	d.Msg = strings.TrimSpace(d.Msg)

	// Validate blank messages
	if d.Msg == "" {
		if s != nil {
			s.Warning("You cannot send a blank message.")
		}
		return
	}

	// Validate that the message does not contain any whitespace
	// (other than a normal space character)
	for _, letter := range d.Msg {
		if unicode.IsSpace(letter) && letter != ' ' {
			s.Warning("Chat messages must not contain any whitespace characters " +
				"(other than a normal space).")
			return
		}
	}

	// Validate that the message does not have two or more consecutive diacritics (accents)
	// This prevents the attack where messages can have a lot of diacritics and cause overflow
	// into sections above and below the text
	if hasConsecutiveDiacritics(d.Msg) {
		s.Warning("Usernames cannot contain two or more consecutive diacritics.")
		return
	}

	// Before we sanitize the message, make a copy first,
	// since we do not want to send HTML-escaped text to Discord
	rawMsg := d.Msg

	// Sanitize the message using the bluemonday library
	// to stop various attacks against other players
	sp := bluemonday.StrictPolicy()
	d.Msg = sp.Sanitize(d.Msg)

	// Validate the room
	if d.Room != "lobby" && !strings.HasPrefix(d.Room, "table") {
		if s != nil {
			s.Warning("That is not a valid room.")
		}
		return
	}

	/*
		Chat
	*/

	// Log the message
	text := "#" + d.Room + " "
	if d.Username != "" {
		text += "<" + d.Username
		if d.DiscordDiscriminator != "" {
			text += "#" + d.DiscordDiscriminator
		}
		text += "> "
	}
	text += d.Msg
	logger.Info(text)

	// Handle in-game chat in a different function; the rest of this function will be for lobby chat
	if strings.HasPrefix(d.Room, "table") {
		commandChatTable(s, d)
		return
	}

	// Add the message to the database
	if d.Discord {
		if err := models.ChatLog.InsertDiscord(d.Username, d.Msg, d.Room); err != nil {
			logger.Error("Failed to insert a Discord chat message into the database:", err)
			s.Error("")
			return
		}
	} else if !d.OnlyDiscord {
		if err := models.ChatLog.Insert(userID, d.Msg, d.Room); err != nil {
			logger.Error("Failed to insert a chat message into the database:", err)
			s.Error("")
			return
		}
	}

	d.Msg = chatFillMentions(d.Msg) // Convert Discord mentions from number to username
	d.Msg = chatFillChannels(d.Msg) // Convert Discord channel names from number to username

	// Lobby messages go to everyone
	if !d.OnlyDiscord {
		for _, s2 := range sessions {
			s2.Emit("chat", &ChatMessage{
				Msg:      d.Msg,
				Who:      d.Username,
				Discord:  d.Discord,
				Server:   d.Server,
				Datetime: time.Now(),
				Room:     d.Room,
			})
		}
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		// Scrub "@here" and "@everyone" from user messages
		// (the bot has permissions to perform these actions in the Discord server,
		// so we need to escape them to prevent abuse from lobby users)
		if !d.Server {
			rawMsg = strings.ReplaceAll(rawMsg, "@everyone", "AtEveryone")
			rawMsg = strings.ReplaceAll(rawMsg, "@here", "AtHere")
		}

		// We use "rawMsg" instead of "d.Msg" because we want to send the unsanitized message
		// The bluemonday library is intended for HTML rendering,
		// and Discord can handle any special characters
		discordSend(discordLobbyChannel, d.Username, rawMsg)
	}

	// Check for commands
	chatCommand(s, d, nil)
	// (we pass nil as the third argument here because there is no associated table)
}

func commandChatTable(s *Session, d *CommandData) {
	// Parse the table ID from the room
	match := lobbyRoomRegExp.FindStringSubmatch(d.Room)
	if match == nil {
		logger.Error("Failed to parse the table ID from the room:", d.Room)
		if s != nil {
			s.Error("That is an invalid room.")
		}
		return
	}
	var tableID int
	if v, err := strconv.Atoi(match[1]); err != nil {
		logger.Error("Failed to convert the table ID to a number:", err)
		if s != nil {
			s.Error("That is an invalid room.")
		}
		return
	} else {
		tableID = v
	}

	// Get the corresponding table
	var t *Table
	if v, ok := tables[tableID]; !ok {
		if s == nil {
			logger.Error("Table " + strconv.Itoa(tableID) + " does not exist.")
		} else {
			s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		}
		return
	} else {
		t = v
	}

	// Validate that this player is in the game or spectating
	var i int
	var j int
	if !d.Server {
		i = t.GetPlayerIndexFromID(s.UserID())
		j = t.GetSpectatorIndexFromID(s.UserID())
		if i == -1 && j == -1 {
			s.Warning("You are not playing or spectating at table " + strconv.Itoa(tableID) + ", " +
				"so you cannot send chat to it.")
			return
		}
	}

	// Store the chat in memory
	userID := 0
	if s != nil {
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
	t.NotifyChat(&ChatMessage{
		Msg:      d.Msg,
		Who:      d.Username,
		Discord:  d.Discord,
		Server:   d.Server,
		Datetime: chatMsg.Datetime,
		Room:     d.Room,
	})

	// Check for commands
	chatCommand(s, d, t)

	// If this user was typing, set them so that they are not typing
	// Check for spectators first in case this is a shared replay that the player happened to be in
	if d.Server {
		return
	}
	if j != -1 {
		// They are a spectator
		sp := t.Spectators[j]
		if sp.Typing {
			sp.Typing = false
		}
	} else if i != -1 {
		// They are a player
		p := t.Players[i]
		if p.Typing {
			p.Typing = false
		}
	}
}
