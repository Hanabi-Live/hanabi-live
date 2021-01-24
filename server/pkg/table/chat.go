package table

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func (m *Manager) chat(userID int, username string, msg string, server bool) {
	// Local variables
	t := m.table
	i := t.getPlayerIndexFromID(userID)
	j := t.getSpectatorIndexFromID(userID)

	// Validate that this player is in the game or spectating
	if !server && i == -1 && j == -1 {
		errMsg := fmt.Sprintf(
			"You are not playing or spectating at table %v, so you cannot send chat to it.",
			t.ID,
		)
		m.Dispatcher.Sessions.NotifyWarning(userID, errMsg)
		return
	}

	// Store the chat in memory
	chatMsg := &types.TableChatMessage{
		UserID:   userID,
		Username: username,
		Msg:      msg,
		Datetime: time.Now(),
		Server:   server,
	}
	t.Chat = append(t.Chat, chatMsg)

	// Send it to all of the players and spectators
	m.notifyChat(username, msg)

	// If this user was typing, set them so that they are not typing
	if !server {
		m.chatStopTyping(i, j)
	}
}

func (m *Manager) chatStopTyping(i int, j int) {
	// Local variables
	t := m.table

	// Check for spectators first in case this is a shared replay that the player happened to be in
	if j != -1 {
		sp := t.spectators[j]
		sp.typing = false
	} else if i != -1 {
		p := t.Players[i]
		p.Typing = false
	}
}
