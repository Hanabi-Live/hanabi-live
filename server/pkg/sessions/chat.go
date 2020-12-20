package sessions

import (
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

type chatData struct {
	Msg       string    `json:"msg"`
	Who       string    `json:"who"`
	Discord   bool      `json:"discord"`
	Server    bool      `json:"server"`
	Datetime  time.Time `json:"datetime"`
	Room      string    `json:"room"`
	Recipient string    `json:"recipient"`
}

type chatListData struct {
	List   []*chatData `json:"list"`
	Unread int         `json:"unread"`
}

func (m *Manager) chatSendHistoryFromDatabase(
	userID int,
	room string,
	chatHistory []*models.DBChatMessage,
) {
	chatDataList := make([]*chatData, 0)

	// The chat messages were queried from the database in order from newest to oldest
	// We want to send them to the client in the reverse order so that the newest messages display
	// at the bottom
	for i := len(chatHistory) - 1; i >= 0; i-- {
		dbChatMessage := chatHistory[i]

		discord := false
		server := false
		if dbChatMessage.Name == "__server" {
			server = true
		}
		if dbChatMessage.DiscordName.Valid {
			server = false
			discord = true
			dbChatMessage.Name = dbChatMessage.DiscordName.String
		}

		dbChatMessage.Message = m.chatFillMentions(dbChatMessage.Message)

		chatData := &chatData{
			Msg:       dbChatMessage.Message,
			Who:       dbChatMessage.Name,
			Discord:   discord,
			Server:    server,
			Datetime:  dbChatMessage.Datetime,
			Room:      room,
			Recipient: "",
		}
		chatDataList = append(chatDataList, chatData)
	}

	m.send(userID, "chatList", &chatListData{
		List:   chatDataList,
		Unread: 0,
	})
}

/*
func chatSendPastFromTable(s *Session, t *Table) {
	chatList := make([]*ChatMessage, 0)
	i := 0
	if len(t.Chat) > ChatLimit {
		i = len(t.Chat) - ChatLimit
	}
	for ; i < len(t.Chat); i++ {
		// We have to convert the *GameChatMessage to a *ChatMessage
		gcm := t.Chat[i]
		cm := &ChatMessage{
			Msg:       gcm.Msg,
			Who:       gcm.Username,
			Discord:   false,
			Server:    gcm.Server,
			Datetime:  gcm.Datetime,
			Room:      t.GetRoomName(),
			Recipient: "",
		}
		chatList = append(chatList, cm)
	}
	s.Emit("chatList", &ChatListMessage{
		List:   chatList,
		Unread: len(t.Chat) - t.ChatRead[s.UserID],
	})
}
*/

// chatSendServerMsg is a helper function for sending an ephemeral message from the server to a
// user. (The message will not be written to the database.)
func (m *Manager) chatSendServerMsg(userID int, msg string, room string) {
	m.send(userID, "chat", &chatData{
		Msg:       msg,
		Who:       "",
		Discord:   false,
		Server:    true,
		Datetime:  time.Now(),
		Room:      room,
		Recipient: "",
	})
}

func (m *Manager) chatFillMentions(msg string) string {
	if m.Dispatcher.Discord == nil {
		return msg
	}

	// Discord mentions are in the form of "<@12345678901234567>"
	// By the time the message gets here, it will be sanitized to "&lt;@12345678901234567&gt;"
	// They can also be in the form of "<@!12345678901234567>" (with a "!" after the "@"),
	// if a nickname is set for that person
	// We want to convert this to the username,
	// so that the lobby displays messages in a manner similar to the Discord client
	for {
		match := m.mentionRegExp.FindStringSubmatch(msg)
		if match == nil || len(match) <= 1 {
			break
		}
		discordID := match[1]
		username := m.Dispatcher.Discord.GetNickname(discordID)
		msg = strings.ReplaceAll(msg, "&lt;@"+discordID+"&gt;", "@"+username)
		msg = strings.ReplaceAll(msg, "&lt;@!"+discordID+"&gt;", "@"+username)
	}

	return msg
}
