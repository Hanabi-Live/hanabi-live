package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /wrongchannel
func (m *Manager) commandWrongChannel(d *chatData, args []string, t dispatcher.TableManager) {
	if t != nil {
		m.ChatServer(constants.NotInLobbyFail, d.room)
		return
	}

	// This includes a discord link to the #convention-questions channel
	msg := "It looks like you are asking a question about the Hyphen-ated conventions or the Hyphen-ated group. Please ask all such questions in the <#456214043351580674> channel."
	m.ChatServer(msg, d.room)
}
