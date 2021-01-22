package core

import (
	"fmt"
	"runtime"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) Shutdown() {
	m.newRequest(requestTypeSetShutdown, nil) // nolint: errcheck
}

func (m *Manager) shutdown(data interface{}) {
	m.logger.Info("Initiating an immediate server shutdown.")

	m.shutdownAllManagers()

	m.Dispatcher.Sessions.NotifyAllShutdownImmediate()

	msg := fmt.Sprintf("The server successfully shut down at: %v", util.GetCurrentTimestamp())
	m.Dispatcher.Chat.ChatServer(msg, constants.Lobby)

	if runtime.GOOS == "windows" {
		m.logger.Info("Manually kill the server now.")
	} else if err := m.executeScript("stop.sh"); err != nil {
		m.logger.Errorf("Failed to execute the \"stop.sh\" script: %v", err)
	}
}

func (m *Manager) shutdownAllManagers() {
	m.logger.Info("Shutting down all managers...")
	m.Dispatcher.Chat.Shutdown()
	m.Dispatcher.Commands.Shutdown()
	m.Dispatcher.Sessions.Shutdown()
	m.Dispatcher.Tables.Shutdown()
	// (we don't care about shutting down the HTTP server, since that cannot modify the database)
	m.logger.Info("All managers have been shut down.")
}
