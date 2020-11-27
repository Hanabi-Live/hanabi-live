package main

import (
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const (
	MaxChatLength       = 300
	MaxChatLengthServer = 600
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
		userID = s.UserID
	}
	if d.Username == "" && s != nil {
		d.Username = s.Username
	}

	// Check to see if their IP has been muted
	if s != nil && s.Muted {
		s.Warning("You have been muted by an administrator.")
		return
	}

	// Sanitize and validate the chat message
	if v, valid := sanitizeChatInput(s, d.Msg, d.Server); !valid {
		return
	} else {
		d.Msg = v
	}

	// Make a copy of the message before we HTML-escape it,
	// because we do not want to send HTML-escaped text to Discord
	rawMsg := d.Msg

	// Escape all HTML special characters to stop XSS attacks and so forth
	// (but make an exception for server messages so that the server can properly send links)
	if !d.Server || d.Discord {
		d.Msg = html.EscapeString(d.Msg)
	}

	// Validate the room
	if d.Room != "lobby" && !strings.HasPrefix(d.Room, "table") {
		if s != nil {
			s.Warning("That is not a valid room.")
		}
		return
	}

	chat(s, d, userID, rawMsg)
}

func chat(s *Session, d *CommandData, userID int, rawMsg string) {
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

	d.Msg = chatFillMentions(d.Msg) // Convert Discord mentions from number to username
	d.Msg = chatFillChannels(d.Msg) // Convert Discord channel links from number to name

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

	// Lobby messages go to everyone
	if !d.OnlyDiscord {
		sessionsMutex.RLock()
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
		sessionsMutex.RUnlock()
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		// We use "rawMsg" instead of "d.Msg" because we want to send the unescaped message
		// (since Discord can handle escaping HTML special characters itself)
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
	var tableID uint64
	if v, err := strconv.ParseUint(match[1], 10, 64); err != nil {
		logger.Error("Failed to convert the table ID to a number:", err)
		if s != nil {
			s.Error("That is an invalid room.")
		}
		return
	} else {
		tableID = v
	}

	t, exists := getTableAndLock(s, tableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that this player is in the game or spectating
	var playerIndex int
	var spectatorIndex int
	if !d.Server {
		playerIndex = t.GetPlayerIndexFromID(s.UserID)
		spectatorIndex = t.GetSpectatorIndexFromID(s.UserID)
		if playerIndex == -1 && spectatorIndex == -1 {
			s.Warning("You are not playing or spectating at table " + strconv.FormatUint(t.ID, 10) +
				", so you cannot send chat to it.")
			return
		}
	}

	// Store the chat in memory
	userID := 0
	if s != nil {
		userID = s.UserID
	}
	chatMsg := &TableChatMessage{
		UserID:   userID,
		Username: d.Username, // This was prepared above in the "commandChat()" function
		Msg:      d.Msg,
		Datetime: time.Now(),
		Server:   d.Server,
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
	if spectatorIndex != -1 {
		sp := t.Spectators[spectatorIndex]
		if sp.Typing {
			sp.Typing = false
		}
	} else if playerIndex != -1 {
		p := t.Players[playerIndex]
		if p.Typing {
			p.Typing = false
		}
	}
}

func sanitizeChatInput(s *Session, msg string, server bool) (string, bool) {
	// Truncate long messages
	// (we do this first to prevent wasting CPU cycles on validating extremely long messages)
	maxLength := MaxChatLength
	if server {
		maxLength = MaxChatLengthServer
	}
	if len(msg) > maxLength {
		msg = msg[0 : maxLength-1]
	}

	// Remove any non-printable characters, if any
	msg = removeNonPrintableCharacters(msg)

	// Check for valid UTF8
	if !utf8.Valid([]byte(msg)) {
		if s != nil {
			s.Warning("Chat messages must contain valid UTF8 characters.")
		}
		return msg, false
	}

	// Replace any whitespace that is not a space with a space
	msg2 := msg
	for _, letter := range msg2 {
		if unicode.IsSpace(letter) && letter != ' ' {
			msg = strings.ReplaceAll(msg, string(letter), " ")
		}
	}

	// Trim whitespace from both sides
	msg = strings.TrimSpace(msg)

	// Validate blank messages
	if msg == "" {
		if s != nil {
			s.Warning("Chat messages cannot be blank.")
		}
		return msg, false
	}

	// Validate that the message does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if numConsecutiveDiacritics(msg) > ConsecutiveDiacriticsAllowed {
		if s != nil {
			s.Warning("Chat messages cannot contain more than " +
				strconv.Itoa(ConsecutiveDiacriticsAllowed) + " consecutive diacritics.")
		}
		return msg, false
	}

	return msg, true
}
