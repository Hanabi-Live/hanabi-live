/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: 'hi',
		room: 'lobby', // Room can also be "table#", e.g. "table1", "table1234", etc.
	}
*/

package main

import (
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"
)

const (
	maxChatLength = 300
)

var (
	lobbyRoomRegExp = regexp.MustCompile(`table(\d+)`)
)

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
	if d.Room != "lobby" && !strings.HasPrefix(d.Room, "table") {
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
		// The bluemonday library is intended for HTML rendering,
		// and Discord can handle any special characters
		discordSend(to, d.Username, rawMsg)
	}

	// Check for commands
	// (unless they already successfully performed a Discord-only command)
	if !d.DiscordCommand {
		chatCommand(s, d, nil) // We pass nil as the third argument because there is no associated table
	}
}

func commandChatTable(s *Session, d *CommandData) {
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
	if !d.Server &&
		t.GetPlayerIndexFromID(s.UserID()) == -1 &&
		t.GetSpectatorIndexFromID(s.UserID()) == -1 {

		s.Warning("You are not playing or spectating at table " + strconv.Itoa(tableID) + ", " +
			"so you cannot send chat to it.")
		return
	}

	// Store the chat in memory
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
	if !t.Replay {
		for _, p := range t.Players {
			if p.Present {
				p.Session.NotifyChat(d.Msg, d.Username, d.Discord, d.Server, chatMsg.Datetime, d.Room)
			}
		}
	}
	for _, sp := range t.Spectators {
		sp.Session.NotifyChat(d.Msg, d.Username, d.Discord, d.Server, chatMsg.Datetime, d.Room)
	}

	// Check for commands
	chatCommand(s, d, t)
}
