package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type notifyChatListFromTableData struct {
	recipientUserID int
	room            string
	chatHistory     []*types.TableChatMessage
	chatRead        int
}

func (m *Manager) NotifyChatListFromTable(
	recipientUserID int,
	room string,
	chatHistory []*types.TableChatMessage,
	chatRead int,
) {
	m.newRequest(requestTypeNotifyChatListFromTable, &notifyChatListFromTableData{ // nolint: errcheck
		recipientUserID: recipientUserID,
		room:            room,
		chatHistory:     chatHistory,
		chatRead:        chatRead,
	})
}

func (m *Manager) notifyChatListFromTable(data interface{}) {
	var d *notifyChatListFromTableData
	if v, ok := data.(*notifyChatListFromTableData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	chatListData := m.chatGetListFromTableHistory(d.room, d.chatHistory, d.chatRead)
	m.send(d.recipientUserID, "chatList", chatListData)
}
