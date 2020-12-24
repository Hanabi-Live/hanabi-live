package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type SessionsManager interface {
	New(data interface{}) error

	NotifyAllChat(msg string, who string, discord bool, server bool, room string)
	NotifyAllError(msg string)
	NotifyAllTable(tableDescription interface{})
	NotifyAllUser(changedUserID int)
	NotifyError(userID int, msg string)
	NotifyGame(userID int, gameData interface{})
	NotifyJoined(userID int, tableID int)
	NotifyWarning(userID int, msg string)

	SetStatus(userID int, status constants.Status, tableID int)
}
