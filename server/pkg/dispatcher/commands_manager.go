package dispatcher

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type CommandsManager interface {
	Send(sessionData *types.SessionData, commandName string, commandData []byte)
	Shutdown()
}
