package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type TableManager interface {
	Action(userID int, username string, actionType constants.ActionType, target int, value int)
	AutomaticStart(userID int, numPlayers int)
	Chat(userID int, username string, msg string, server bool)
	FindVariant()
	Impostor(userID int)
	Kick(userID int, targetUsername string)
	MissingScores()
	Pause(userID int, setting string)
	StartIn(userID int, minutesToWait float64)
	Suggest(turn int)
	Tags()
	TerminateNormal(userID int, username string)
	Unattend(userID int, username string)
}
