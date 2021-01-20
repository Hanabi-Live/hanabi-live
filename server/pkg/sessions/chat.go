package sessions

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

const (
	// When sending the in-game chat history, only send the last X messages to prevent clients from
	// becoming overloaded (in case someone maliciously spams a lot of messages).
	chatLimit = 1000
)

type chatData struct {
	Username  string    `json:"username"`
	Msg       string    `json:"msg"`
	Room      string    `json:"room"`
	Discord   bool      `json:"discord"`
	Server    bool      `json:"server"`
	Datetime  time.Time `json:"datetime"`
	Recipient string    `json:"recipient"`
}

type chatListData struct {
	// There is no "room" field because that is contained within each chat message
	List   []*chatData `json:"list"`
	Unread int         `json:"unread"`
}

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
			Username:  dbChatMessage.Name,
			Msg:       dbChatMessage.Message,
			Room:      room,
			Discord:   discord,
			Server:    server,
			Datetime:  dbChatMessage.Datetime,
			Recipient: "",
		}
		chatDataList = append(chatDataList, chatData)
	}

	return &chatListData{
		List:   chatDataList,
		Unread: 0,
	}
}

func (m *Manager) chatGetListFromTableHistory(
	room string,
	chatHistory []*table.ChatMessage,
	chatRead int,
) *chatListData {
	chatDataList := make([]*chatData, 0)

	// See the "chatLimit" comment above
	i := 0
	if len(chatHistory) > chatLimit {
		i = len(chatHistory) - chatLimit
	}
	for ; i < len(chatHistory); i++ {
		// We have to convert the *table.ChatMessage to a *chatData
		cm := chatHistory[i]
		chatData := &chatData{
			Username:  cm.Username,
			Msg:       cm.Msg,
			Room:      room,
			Discord:   false,
			Server:    cm.Server,
			Datetime:  cm.Datetime,
			Recipient: "",
		}
		chatDataList = append(chatDataList, chatData)
	}

	return &chatListData{
		List:   chatDataList,
		Unread: len(chatHistory) - chatRead,
	}
}
