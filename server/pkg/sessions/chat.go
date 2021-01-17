package sessions

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
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
	// There is no "room" field because that is contained within each chat message
	List   []*chatData `json:"list"`
	Unread int         `json:"unread"`
}

const (
	// When sending the in-game chat history, only send the last X messages to prevent clients from
	// becoming overloaded (in case someone maliciously spams a lot of messages).
	chatLimit = 1000
)

func (m *Manager) chatGetListFromDatabaseHistory(
	room string,
	chatHistory []*models.DBChatMessage,
) *chatListData {
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

		if m.Dispatcher.Discord != nil {
			// Convert Discord objects to plain text (e.g. channel links from number to name)
			dbChatMessage.Message = m.Dispatcher.Discord.ChatFill(dbChatMessage.Message)
		}

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

	return &chatListData{
		List:   chatDataList,
		Unread: 0,
	}
}

func (m *Manager) chatSendPastFromTable(
	userID int,
	room string,
	chat []*table.ChatMessage,
	chatRead int,
) {
	chatDataList := make([]*chatData, 0)

	// See the "chatLimit" comment above
	i := 0
	if len(chat) > chatLimit {
		i = len(chat) - chatLimit
	}
	for ; i < len(chat); i++ {
		// We have to convert the *table.ChatMessage to a *chatData
		cm := chat[i]
		chatData := &chatData{
			Msg:       cm.Msg,
			Who:       cm.Username,
			Discord:   false,
			Server:    cm.Server,
			Datetime:  cm.Datetime,
			Room:      room,
			Recipient: "",
		}
		chatDataList = append(chatDataList, chatData)
	}

	m.send(userID, "chatList", &chatListData{
		List:   chatDataList,
		Unread: len(chat) - chatRead,
	})
}
