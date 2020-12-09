package commands

import (
	"context"
	"fmt"
	"html"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
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
func commandChat(ctx context.Context, s *Session, d *CommandData) {
	// Local variables
	var userID int
	if d.Discord || d.Server {
		userID = 0
	} else {
		if s == nil {
			hLog.Error("Failed to send a chat message because the sender's session was nil.")
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

	chat(ctx, s, d, userID, rawMsg)
}

func chat(ctx context.Context, s *Session, d *CommandData, userID int, rawMsg string) {
	// Log the message
	var username string
	if d.Username == "" {
		username = ""
	} else if d.DiscordDiscriminator == "" {
		username = fmt.Sprintf("<%v> ", d.Username)
	} else {
		username = fmt.Sprintf("<%v#%v> ", d.Username, d.DiscordDiscriminator)
	}

	hLog.Infof("#%v %v%v", d.Room, username, d.Msg)

	// Handle in-game chat in a different function; the rest of this function will be for lobby chat
	if strings.HasPrefix(d.Room, "table") {
		commandChatTable(ctx, s, d)
		return
	}

	d.Msg = chatFillMentions(d.Msg) // Convert Discord mentions from number to username
	d.Msg = chatFillChannels(d.Msg) // Convert Discord channel links from number to name

	// Add the message to the database
	if d.Discord {
		if err := models.ChatLog.InsertDiscord(d.Username, d.Msg, d.Room); err != nil {
			hLog.Errorf("Failed to insert a Discord chat message into the database: %v", err)
			s.Error(DefaultErrorMsg)
			return
		}
	} else if !d.OnlyDiscord {
		if err := models.ChatLog.Insert(userID, d.Msg, d.Room); err != nil {
			hLog.Errorf("Failed to insert a chat message into the database: %v", err)
			s.Error(DefaultErrorMsg)
			return
		}
	}

	// Lobby messages go to everyone
	if !d.OnlyDiscord {
		sessionList := sessions2.GetList()
		for _, s2 := range sessionList {
			s2.Emit("chat", &ChatMessage{
				Msg:       d.Msg,
				Who:       d.Username,
				Discord:   d.Discord,
				Server:    d.Server,
				Datetime:  time.Now(),
				Room:      d.Room,
				Recipient: "",
			})
		}
	}

	// Replicate all lobby messages to Discord
	// (but don't send Discord messages that we are already replicating)
	if !d.Discord {
		// We use "rawMsg" instead of "d.Msg" because we want to send the unescaped message
		// (since Discord can handle escaping HTML special characters itself)
		discordSend(discordChannelSyncWithLobby, d.Username, rawMsg)
	}

	// Check for commands
	chatCommand(ctx, s, d, nil) // We pass nil because there is no associated table
}

func commandChatTable(ctx context.Context, s *Session, d *CommandData) {
	// Parse the table ID from the room
	match := lobbyRoomRegExp.FindStringSubmatch(d.Room)
	if match == nil {
		hLog.Errorf("Failed to parse the table ID from the room: %v", d.Room)
		if s != nil {
			s.Error("That is an invalid room.")
		}
		return
	}
	var tableID uint64
	if v, err := strconv.ParseUint(match[1], 10, 64); err != nil {
		hLog.Errorf("Failed to convert the table ID to an integer: %v", err)
		if s != nil {
			s.Errorf("The table ID of \"%v\" is not an integer.", match[1])
		}
		return
	} else {
		tableID = v
	}

	t, exists := getTableAndLock(ctx, s, tableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that this player is in the game or spectating
	var playerIndex int
	var spectatorIndex int
	if !d.Server {
		playerIndex = t.GetPlayerIndexFromID(s.UserID)
		spectatorIndex = t.GetSpectatorIndexFromID(s.UserID)
		if playerIndex == -1 && spectatorIndex == -1 {
			s.Warningf(
				"You are not playing or spectating at table %v, so you cannot send chat to it.",
				t.ID,
			)
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
		Msg:       d.Msg,
		Who:       d.Username,
		Discord:   d.Discord,
		Server:    d.Server,
		Datetime:  chatMsg.Datetime,
		Room:      d.Room,
		Recipient: "",
	})

	// Check for commands
	chatCommand(ctx, s, d, t)

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
			s.Warningf(
				"Chat messages cannot contain more than %v consecutive diacritics.",
				ConsecutiveDiacriticsAllowed,
			)
		}
		return msg, false
	}

	return msg, true
}
