package dispatcher

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"nhooyr.io/websocket"
)

type SessionsManager interface {
	ChatPM(userID int, username string, msg string, recipient string, server bool)
	New(ctx context.Context, conn *websocket.Conn, userID int, username string, ip string) error

	NotifyAllChat(username string, msg string, room string, discord bool, server bool)
	NotifyAllError(msg string)
	NotifyAllTable(tableDescription interface{})
	NotifyAllUser(changedUserID int)
	NotifyChatListFromTable(
		userID int,
		room string,
		chatHistory interface{},
		chatRead int,
	)
	NotifyChatServer(userID int, msg string, room string)
	NotifyChatTyping(userID int, tableID int, username string, typing bool)
	NotifyError(userID int, msg string)
	NotifyFriends(userID int, friends []string)
	NotifyGame(userID int, gameData interface{})
	NotifyJoined(userID int, tableID int)
	NotifyNote(userID int, tableID int, order int, notes interface{})
	NotifySpectators(userID int, tableID int, spectators interface{})
	NotifySoundLobby(userID int, file string)
	NotifyWarning(userID int, msg string)

	SetStatus(userID int, status constants.Status, tableID int)
}
