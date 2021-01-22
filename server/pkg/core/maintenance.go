package core

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

func (m *Manager) maintenance(enabled bool) {
	m.maintenanceMode.SetTo(enabled)
	m.Dispatcher.Sessions.NotifyAllMaintenance(enabled)

	var whatsHappeningString string
	var verb string
	if enabled {
		whatsHappeningString = "The server is entering maintenance mode."
		verb = "enabled"
	} else {
		whatsHappeningString = "Server maintenance is complete."
		verb = "disabled"
	}

	msg := fmt.Sprintf("%v New game creation has been %v.", whatsHappeningString, verb)
	m.Dispatcher.Chat.ChatServer(msg, constants.Lobby)
}
