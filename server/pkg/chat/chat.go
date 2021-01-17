package chat

import (
	"context"
	"fmt"
	"html"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

const (
	maxChatLength       = 300
	maxChatLengthServer = 600
)

type chatData struct {
	userID               int
	username             string
	msg                  string
	room                 string
	discord              bool
	discordDiscriminator string
	server               bool
}

func (m *Manager) chat(d *chatData) {
	// Validate the room
	if d.room != constants.Lobby && !strings.HasPrefix(d.room, constants.TableRoomPrefix) {
		msg := "That is not a valid room."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate and sanitize the chat message
	if v, valid := m.chatSanitize(d); !valid {
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
	var logUsername string
	if d.username == "" {
		logUsername = ""
	} else if d.discordDiscriminator == "" {
		logUsername = d.username
	} else {
		logUsername = fmt.Sprintf("%v#%v", d.username, d.discordDiscriminator)
	}
	m.logger.Infof("#%v <%v> %v", d.room, logUsername, d.msg)

	if d.room == constants.Lobby {
		m.chatLobby(d, rawMsg)
	} else {
		m.chatTable(d)
	}
}

func (m *Manager) chatSanitize(d *chatData) (string, bool) {
	// Validate long messages
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	maxLength := maxChatLength
	if d.server {
		maxLength = maxChatLengthServer
	}
	if len(d.msg) > maxLength {
		msg := fmt.Sprintf("Chat messages cannot be longer than %v characters.", maxLength)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return "", false
	}

	// Check for non-printable characters
	if util.ContainsNonPrintableCharacters(d.msg) {
		msg := "Chat messages cannot contain non-printable characters."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return "", false
	}

	// Check for valid UTF8
	if !utf8.Valid([]byte(d.msg)) {
		msg := "Chat messages must contain valid UTF8 characters."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return "", false
	}

	// Validate that the message does not contain an unreasonable amount of consecutive diacritics
	// (accents)
	if util.NumConsecutiveDiacritics(d.msg) > constants.ConsecutiveDiacriticsAllowed {
		msg := fmt.Sprintf(
			"Chat messages cannot contain more than %v consecutive diacritics.",
			constants.ConsecutiveDiacriticsAllowed,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return "", false
	}

	newMsg := d.msg

	// Replace any whitespace that is not a space with a space
	for _, r := range d.msg {
		if unicode.IsSpace(r) && r != ' ' {
			newMsg = strings.ReplaceAll(newMsg, string(r), " ")
		}
	}

	// Trim whitespace from both sides
	newMsg = strings.TrimSpace(newMsg)

	// Validate blank messages
	if newMsg == "" {
		msg := "Chat messages cannot be blank."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return "", false
	}

	return newMsg, true
}

func (m *Manager) chatLobby(d *chatData, rawMsg string) {
	if m.Dispatcher.Discord != nil {
		// Convert Discord objects to plain text
		// (e.g. channel links from number to name)
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
	} else {
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
	m.Dispatcher.Sessions.NotifyAllChat(d.username, d.msg, d.room, d.discord, d.server)

	// Replicate all lobby messages to Discord
	// (but don't send Discord messages that we are already replicating)
	if !d.discord && m.Dispatcher.Discord != nil {
		// We use "rawMsg" instead of "d.Msg" because we want to send the unescaped message
		// (since Discord can handle escaping HTML special characters itself)
		m.Dispatcher.Discord.LobbySync(d.username, rawMsg)
	}

	m.checkCommand(d, nil) // (we pass nil because there is no associated table)
}

func (m *Manager) chatTable(d *chatData) {
	// Parse the table ID from the room
	match := m.lobbyRoomRegExp.FindStringSubmatch(d.room)
	if match == nil {
		m.logger.Infof("Failed to parse the table ID from the room: %v", d.room)
		msg := "That is not a valid room."
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		return
	}

	var tableID int
	if v, err := strconv.Atoi(match[1]); err != nil {
		m.logger.Infof("Failed to convert the table ID to an integer: %v", err)
		msg := fmt.Sprintf("The table ID of \"%v\" is not an integer.", match[1])
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		return
	} else {
		tableID = v
	}

	// Get the table manager associated with this table
	t := m.Dispatcher.Tables.GetTable(tableID)
	if t == nil {
		msg := fmt.Sprintf("Table %v does not exist.", match[1])
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		return
	}

	// Send the chat message to the table
	t.Chat(d.userID, d.username, d.msg, false)

	m.checkCommand(d, t)
}
