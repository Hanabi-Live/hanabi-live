package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /here
func (m *Manager) commandHere(d *chatData, args []string, t dispatcher.TableManager) {
	if t != nil {
		m.ChatServer(constants.NotInLobbyFail, d.room)
		return
	}

	msg := "The /here command has been removed. If you look at the Discord voice channels to your left, there are almost certainly people from the Hyphen-ated group already playing or reviewing a game. Please politely ask to join them instead of pinging the entire server."
	m.ChatServer(msg, d.room)
}
