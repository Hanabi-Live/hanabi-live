package chat

import (
	"context"
	"fmt"
	"html"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type chatData struct {
	userID               int
	username             string
	msg                  string
	room                 string
	discord              bool
	discordDiscriminator string
	onlyDiscord          bool
	server               bool
}

const (
	maxChatLength       = 300
	maxChatLengthServer = 600
)

func (m *Manager) Chat(
	userID int,
	username string,
	msg string,
	room string,
	discord bool,
	discordDiscriminator string,
	onlyDiscord bool,
	server bool,
) {
	m.newRequest(requestTypeChat, &chatData{ // nolint: errcheck
		userID:               userID,
		username:             username,
		msg:                  msg,
		room:                 room,
		discord:              discord,
		discordDiscriminator: discordDiscriminator,
		onlyDiscord:          onlyDiscord,
		server:               server,
	})
}

func (m *Manager) chat(data interface{}) {
	var d *chatData
	if v, ok := data.(*chatData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Validate the room
	if d.room != "lobby" && !strings.HasPrefix(d.room, "table") {
		msg := "That is not a valid room."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate and sanitize the chat message
	if v, valid := m.chatSanitize(d.userID, d.msg, d.server); !valid {
		return
	} else {
		d.msg = v
	}

	// Make a copy of the message before we HTML-escape it,
	// because we do not want to send HTML-escaped text to Discord
	rawMsg := d.msg

	// Escape all HTML special characters to stop XSS attacks and so forth
	// (but make an exception for server messages so that the server can properly send links)
	if !d.server {
		d.msg = html.EscapeString(d.msg)
	}

	// Log the message
	var username string
	if d.username == "" {
		username = ""
	} else if d.discordDiscriminator == "" {
		username = fmt.Sprintf("<%v> ", d.username)
	} else {
		username = fmt.Sprintf("<%v#%v> ", d.username, d.discordDiscriminator)
	}
	m.logger.Infof("#%v %v%v", d.room, username, d.msg)

	if strings.HasPrefix(d.room, "table") {
		m.chatTable(d)
	} else {
		m.chatLobby(d, rawMsg)
	}
}

func (m *Manager) chatSanitize(userID int, msg string, server bool) (string, bool) {
	// Validate long messages
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	maxLength := maxChatLength
	if server {
		maxLength = maxChatLengthServer
	}
	if len(msg) > maxLength {
		errMsg := fmt.Sprintf("Chat messages cannot be longer than %v characters.", maxLength)
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return "", false
	}

	// Check for non-printable characters
	if util.ContainsNonPrintableCharacters(msg) {
		errMsg := "Chat messages cannot contain non-printable characters."
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return "", false
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(msg)) {
		errMsg := "Chat messages must contain valid UTF8 characters."
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return "", false
	}

	// Validate that the message does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if util.NumConsecutiveDiacritics(msg) > constants.ConsecutiveDiacriticsAllowed {
		errMsg := fmt.Sprintf(
			"Chat messages cannot contain more than %v consecutive diacritics.",
			constants.ConsecutiveDiacriticsAllowed,
		)
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return "", false
	}

	newMsg := msg

	// Replace any whitespace that is not a space with a space
	for _, r := range msg {
		if unicode.IsSpace(r) && r != ' ' {
			newMsg = strings.ReplaceAll(newMsg, string(r), " ")
		}
	}

	// Trim whitespace from both sides
	newMsg = strings.TrimSpace(newMsg)

	// Validate blank messages
	if newMsg == "" {
		errMsg := "Chat messages cannot be blank."
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return "", false
	}

	return newMsg, true
}

func (m *Manager) chatTable(d *chatData) {
	// Parse the table ID from the room
	match := m.lobbyRoomRegExp.FindStringSubmatch(d.Room)
	if match == nil {
		m.logger.Infof("Failed to parse the table ID from the room: %v", d.Room)
		msg := "That is not a valid room."
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		return
	}
	var tableID uint64
	if v, err := strconv.ParseUint(match[1], 10, 64); err != nil {
		m.logger.Infof("Failed to convert the table ID to an integer: %v", err)
		msg := fmt.Sprintf("The table ID of \"%v\" is not an integer.", match[1])
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		return
	} else {
		tableID = v
	}

	// Pass it along to the respective table manager
	// TODO

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

	// Check for commands
	chatCommand(ctx, s, d, t)
}

func (m *Manager) chatLobby(d *chatData, rawMsg string) {
	if m.Dispatcher.Discord != nil {
		// Convert Discord objects to plain text (e.g. channel links from number to name)
		d.msg = m.Dispatcher.Discord.ChatFill(d.msg)
	}

	// Add the message to the database
	if d.discord {
		if err := m.models.ChatLog.InsertDiscord(
			context.Background(),
			d.username,
			d.msg,
			d.room,
		); err != nil {
			m.logger.Errorf("Failed to insert a Discord chat message into the database: %v", err)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
			return
		}
	} else if !d.onlyDiscord {
		if err := m.models.ChatLog.Insert(
			context.Background(),
			d.userID,
			d.msg,
			d.room,
		); err != nil {
			m.logger.Errorf("Failed to insert a chat message into the database: %v", err)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
			return
		}
	}

	// Lobby messages go to everyone
	if !d.onlyDiscord {
		m.Dispatcher.Sessions.NotifyAllChat(d.msg, d.username, d.discord, d.server, d.room)
	}

	// Replicate all lobby messages to Discord
	// (but don't send Discord messages that we are already replicating)
	if !d.discord && m.Dispatcher.Discord != nil {
		// We use "rawMsg" instead of "d.Msg" because we want to send the unescaped message
		// (since Discord can handle escaping HTML special characters itself)
		m.Dispatcher.Discord.LobbySync(d.username, rawMsg)
	}

	// Check for commands
	checkCommand(sessionData, d, nil) // We pass nil because there is no associated table
}
