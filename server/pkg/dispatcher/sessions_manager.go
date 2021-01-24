package dispatcher

import (
	"context"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"nhooyr.io/websocket"
)

type SessionsManager interface {
	ChatPM(userID int, username string, msg string, recipient string, server bool)
	Logout(userID int, username string)
	New(ctx context.Context, conn *websocket.Conn, userID int, username string, ip string) error
	NotifyAllChat(username string, msg string, room string, discord bool, server bool)
	NotifyAllError(msg string)
	NotifyAllMaintenance(maintenanceMode bool)
	NotifyAllShutdown(shuttingDown bool, datetimeShutdownInit time.Time)
	NotifyAllShutdownImmediate()
	NotifyAllTable(tableDescription *types.TableDescription)
	NotifyAllUser(changedUserID int)
	NotifyChatListFromTable(
		recipientUserID int,
		room string,
		chatHistory []*types.TableChatMessage,
		chatRead int,
	)
	NotifyChat(recipientUserID int, username string, msg string, room string)
	NotifyChatServer(recipientUserID int, msg string, room string)
	NotifyChatServerPM(recipientUserID int, recipientUsername string, msg string)
	NotifyChatTyping(recipientUserID int, tableID int, username string, typing bool)
	NotifyError(userID int, msg string)
	NotifyFriends(userID int, friends []string)
	NotifyGame(userID int, gameData *types.GameData)
	NotifyGameAction(userID int, tableID int, action interface{})
	NotifyJoined(userID int, tableID int)
	NotifyNote(userID int, tableID int, order int, notes []*types.Note)
	NotifySpectators(userID int, tableID int, spectators []*types.SpectatorDescription)
	NotifySoundLobby(userID int, file string)
	NotifyTableLeft(userID int, tableID int)
	NotifyTableProgress(userIDs []int, tableID int, progress int)
	NotifyTableStart(userID int, tableID int)
	NotifyWarning(userID int, msg string)
	SetFriend(userID int, friendID int, add bool)
	SetStatus(userID int, status constants.Status, tableID int)
	Shutdown()
}
