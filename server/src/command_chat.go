package main

import (
	"context"
	"errors"
	"html"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/jackc/pgx/v4"
)

const (
	MaxChatLength       = 300
	MaxChatLengthServer = 600
)

// commandChat is sent when the user presses enter after typing a text message
// It is also used by the server to send chat messages
// Unlike many other commands, this command can be called with a nil session (by the server),
// so we have to check for this before displaying WebSocket error messages
//
// Example data:
//
//	{
//	  msg: 'hi',
//	  room: 'lobby', // Room can also be "table1", "table1234", etc.
//	}
func commandChat(ctx context.Context, s *Session, d *CommandData) {
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

	// Convert the wire-format room to a typed destination once.
	target, valid := parseChatTarget(d.Room)
	if !valid {
		if s != nil {
			s.Warning("That is not a valid room.")
		}
		return
	}

	chat(ctx, s, d, target, userID, rawMsg)
}

func chat(ctx context.Context, s *Session, d *CommandData, target chatTarget, userID int, rawMsg string) {
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
	if target.kind == ChatTargetKindTable {
		commandChatTable(ctx, s, d, target.tableID)
		return
	}

	d.Msg = chatFillAll(d.Msg) // Convert Discord mentions from number to username, role or channel

	// Handle /token before writing to chat history.
	if command, _ := chatParseCommand(d.Msg); command == "token" {
		chatCommandShouldOutput(ctx, s, d, nil) // We pass nil because there is no associated table
		return
	}

	// Add the message to the database
	var chatID int
	var datetime time.Time
	if d.Discord {
		insertResult, err := models.ChatLog.InsertDiscord(d.Username, d.Msg, d.Room, d.DiscordMessageID)
		if errors.Is(err, pgx.ErrNoRows) {
			// Discord can deliver the same message more than once.
			return
		}
		if err != nil {
			logger.Error("Failed to insert a Discord chat message into the database: " +
				err.Error())
			if s != nil {
				s.Error(DefaultErrorMsg)
			}
			return
		}
		chatID = insertResult.ID
		datetime = insertResult.DatetimeSent
	} else if !d.OnlyDiscord {
		insertResult, err := models.ChatLog.Insert(userID, d.Msg, d.Room)
		if err != nil {
			logger.Error("Failed to insert a chat message into the database: " + err.Error())
			if s != nil {
				s.Error(DefaultErrorMsg)
			}
			return
		}
		chatID = insertResult.ID
		datetime = insertResult.DatetimeSent
	}

	// Check for command handler
	if !chatCommandShouldOutput(ctx, s, d, nil) { // We pass nil because there is no associated table
		return
	}

	// Lobby messages go to everyone
	if !d.OnlyDiscord {
		sessionList := sessions.GetList()
		message := (lobbyChatEvent{
			content: chatMessageContent{
				msg:      d.Msg,
				who:      d.Username,
				source:   chatMessageSource(d.Discord, d.Server),
				datetime: datetime,
			},
			room:   d.Room,
			chatID: chatID,
		}).wire()
		for _, s2 := range sessionList {
			s2.Emit("chat", message)
		}
	}

	// Replicate all lobby messages to Discord
	// (but do not send Discord messages that we are already replicating)
	if !d.Discord {
		// We use "rawMsg" instead of "d.Msg" because we want to send the unescaped message
		// (since Discord can handle escaping HTML special characters itself)
		discordMessageID := discordSend(discordChannelSyncWithLobby, d.Username, rawMsg)
		if chatID > 0 && discordMessageID != "" {
			deleted, err := models.ChatLog.LinkDiscordMessageID(chatID, discordMessageID)
			if err != nil {
				logger.Error("Failed to associate the Discord copy with its lobby message: " + err.Error())
			} else if deleted {
				// A Discord delete arrived before the send response was saved.
				chatBroadcastDeletion(chatID)
			}
		}

		// Some messages are also sent to website-development
		if sendMessageToWebDevChannel {
			sendMessageToWebDevChannel = false
			discordSend(discordChannelWebsiteDev, d.Username, rawMsg)
		}
	}

	// Check for commands
	chatCommand(ctx, s, d, nil) // We pass nil because there is no associated table
}

func commandChatTable(ctx context.Context, s *Session, d *CommandData, tableID uint64) {
	// tableID has already been parsed from the incoming room.
	// Handle /split before the message is added to chat history.
	if command, args := chatParseCommand(d.Msg); !d.Server && command == "split" {
		d.Args = args
		commandTableSplit(ctx, s, d, tableID)
		return
	}

	// Handle /splitauto before the message is added to chat history.
	if command, args := chatParseCommand(d.Msg); !d.Server && (command == "splitauto" || command == "sa") {
		d.Args = args
		commandTableSplitAuto(ctx, s, d, tableID)
		return
	}

	t, exists := getTableAndLock(ctx, s, tableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that this player is in the game or spectating
	if !d.Server {
		if !t.IsPlayerOrSpectating(s.UserID) {
			s.Warning("You are not playing or spectating at table " + strconv.FormatUint(t.ID, 10) +
				", so you cannot send chat to it.")
			return
		}
	}

	// Handle /token before writing to table chat history.
	if command, _ := chatParseCommand(d.Msg); !d.Server && command == "token" {
		chatCommandShouldOutput(ctx, s, d, t)
		return
	}

	if t.Ending || t.duplicateRequest(s, d) {
		return
	}
	if d.Server && d.NoTablesLock && t.Running && t.usesRecovery() && !t.mutationActive {
		// Membership changes can announce while holding the global tables lock.
		// Admit the notice now, but acquire only this table's lock when persisting it.
		notice := *d
		notice.NoTableLock, notice.NoTablesLock = false, false
		incomingCommands.runBackground(func() {
			commandChatTable(NewMiscContext("tableNotice"), nil, &notice, tableID)
		})
		return
	}
	if t.Running && !t.Replay {
		if !t.mutate(ctx, s, d, func() { appendTableChat(ctx, s, d, t) }) {
			return
		}
	} else {
		appendTableChat(ctx, s, d, t)
	}

	if d.Server {
		return
	}
	// Interpret user commands only after the content is durable. Server notices
	// may share a gameplay transaction and must never execute command effects.
	chatCommand(ctx, s, d, t)
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if spectatorIndex != -1 {
		t.Spectators[spectatorIndex].Typing = false
	} else if playerIndex != -1 {
		t.Players[playerIndex].Typing = false
	}
}

func appendTableChat(ctx context.Context, s *Session, d *CommandData, t *Table) {
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

	// Chat is activity in a shared replay, even if the leader has not moved the replay.
	// The table lock is already held, so refresh the timestamp before the idle checker wakes.
	if t.RecordReplayChatActivity(chatMsg) {
		t.scheduleIdleTimer(ctx)
	}

	// Send it to all of the players and spectators
	t.NotifyChat((tableChatEvent{
		content: chatMessageContent{
			msg:      d.Msg,
			who:      d.Username,
			source:   chatMessageSource(d.Discord, d.Server),
			datetime: chatMsg.Datetime,
		},
		room: d.Room,
	}).wire())
}

func sanitizeChatInput(s *Session, msg string, server bool) (string, bool) {
	// Truncate long messages
	// (we do this first to prevent wasting CPU cycles on validating extremely long messages)
	maxLength := MaxChatLength
	if server {
		maxLength = MaxChatLengthServer
	}
	msg = truncateToMaxBytes(msg, maxLength)

	// Check for valid UTF8
	if !utf8.ValidString(msg) {
		if s != nil {
			s.Warning("Chat messages must contain valid UTF8 characters.")
		}
		return msg, false
	}

	// Remove any non-printable characters, if any
	msg = removeNonPrintableCharacters(msg)

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
