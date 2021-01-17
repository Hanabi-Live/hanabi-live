package dispatcher

import (
	"context"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"nhooyr.io/websocket"
)

type SessionsManager interface {
	New(ctx context.Context, conn *websocket.Conn, userID int, username string, ip string) error

	NotifyAllChat(username string, msg string, room string, discord bool, server bool)
	NotifyAllError(msg string)
	NotifyAllTable(tableDescription interface{})
	NotifyAllUser(changedUserID int)
	NotifyChatServer(userID int, msg string, room string)
	NotifyError(userID int, msg string)
	NotifyGame(userID int, gameData interface{})
	NotifyJoined(userID int, tableID int)
	NotifyWarning(userID int, msg string)

	SetStatus(userID int, status constants.Status, tableID int)
}
