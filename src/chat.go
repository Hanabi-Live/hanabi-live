package main

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// When sending the in-game chat history,
	// only send the last X messages to prevent clients from becoming overloaded
	// (in case someone maliciously spams a lot of messages)
	chatLimit = 1000
)

var (
	mentionRegExp = regexp.MustCompile(`&lt;@!*(\d+?)&gt;`)
	channelRegExp = regexp.MustCompile(`&lt;#(\d+?)&gt;`)
)

/*
	Chat-related subroutines
*/

type ChatMessage struct {
	Msg      string    `json:"msg"`
	Who      string    `json:"who"`
	Discord  bool      `json:"discord"`
	Server   bool      `json:"server"`
	Datetime time.Time `json:"datetime"`
	Room     string    `json:"room"`
}

func isAdmin(s *Session, d *CommandData) bool {
	// Validate that this message was not sent from Discord
	if d.Discord {
		chatServerSend("You can not issue that command from Discord.", d.Room)
		return false
	}

	// Validate that they are an administrator
	if !s.Admin() {
		chatServerSend("You can only perform that command if you are an administrator.", d.Room)
		return false
	}

	return true
}

func chatMakeMessage(msg string, who string, discord bool, server bool, datetime time.Time, room string) *ChatMessage {
	return &ChatMessage{
		Msg:      msg,
		Who:      who,
		Discord:  discord,
		Server:   server,
		Datetime: datetime,
		Room:     room,
	}
}

// chatServerSend is a helper function to send a message from the server
// (e.g. to give feedback to a user after they type a command,
// to notify that the server is shutting down, etc.)
func chatServerSend(msg string, room string) {
	commandChat(nil, &CommandData{
		Msg:    msg,
		Room:   room,
		Server: true,
	})
}

func chatFillMentions(msg string) string {
	/*
		Discord mentions are in the form of "<@12345678901234567>"
		By the time the message gets here, it will be sanitized to "&lt;@12345678901234567&gt;"
		They can also be in the form of "<@!12345678901234567>" (with a "!" after the "@")
		if a nickname is set for that person
		We want to convert this to the username,
		so that the lobby displays messages in a manner similar to the Discord client
	*/

	if discord == nil {
		return msg
	}

	for {
		match := mentionRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		username := discordGetNickname(discordID)
		msg = strings.Replace(msg, "&lt;@"+discordID+"&gt;", "@"+username, -1)
		msg = strings.Replace(msg, "&lt;@!"+discordID+"&gt;", "@"+username, -1)
	}
	return msg
}

func chatFillChannels(msg string) string {
	/*
		Discord channels are in the form of "<#380813128176500736>"
		By the time the message gets here, it will be sanitized to "&lt;#380813128176500736&gt;"
	*/

	if discord == nil {
		return msg
	}

	for {
		match := channelRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		channel := discordGetChannel(discordID)
		msg = strings.Replace(msg, "&lt;#"+discordID+"&gt;", "#"+channel, -1)
	}
	return msg
}

type ChatListMessage struct {
	List   []*ChatMessage `json:"list"`
	Unread int            `json:"unread"`
}

func chatSendPastFromDatabase(s *Session, room string, count int) {
	var rawMsgs []DBChatMessage
	if v, err := models.ChatLog.Get(room, count); err != nil {
		logger.Error("Failed to get the lobby chat history for user \""+s.Username()+"\":", err)
		return
	} else {
		rawMsgs = v
	}

	msgs := make([]*ChatMessage, 0)
	for i := len(rawMsgs) - 1; i >= 0; i-- {
		// The chat messages were queried from the database in order from newest to newest
		// We want to send them to the client in the reverse order so that
		// the newest messages display at the bottom
		rawMsg := rawMsgs[i]
		discord := false
		server := false
		if rawMsg.Name == "__server" {
			server = true
		}
		if rawMsg.DiscordName.Valid {
			server = false
			discord = true
			rawMsg.Name = rawMsg.DiscordName.String
		}
		rawMsg.Message = chatFillMentions(rawMsg.Message)
		msg := chatMakeMessage(rawMsg.Message, rawMsg.Name, discord, server, rawMsg.Datetime, room)
		msgs = append(msgs, msg)
	}
	s.Emit("chatList", &ChatListMessage{
		List: msgs,
	})
}

func chatSendPastFromTable(s *Session, t *Table) {
	chatList := make([]*ChatMessage, 0)
	i := 0
	if len(t.Chat) > chatLimit {
		i = len(t.Chat) - chatLimit
	}
	for ; i < len(t.Chat); i++ {
		// We have to convert the *GameChatMessage to a *ChatMessage
		gcm := t.Chat[i]
		room := "table" + strconv.Itoa(t.ID)
		cm := chatMakeMessage(gcm.Msg, gcm.Username, false, gcm.Server, gcm.Datetime, room)
		chatList = append(chatList, cm)
	}
	s.Emit("chatList", &ChatListMessage{
		List:   chatList,
		Unread: len(t.Chat) - t.ChatRead[s.UserID()],
	})
}
