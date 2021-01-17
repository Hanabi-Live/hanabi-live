package table

import (
	"fmt"
	"time"
)

type chatData struct {
	userID   int
	username string
	msg      string
	server   bool
}

func (m *Manager) Chat(userID int, username string, msg string, server bool) {
	m.newRequest(requestTypeChat, &chatData{ // nolint: errcheck
		userID:   userID,
		username: username,
		msg:      msg,
		server:   server,
	})
}

func (m *Manager) chat(data interface{}) {
	var d *chatData
	if v, ok := data.(*chatData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Validate that this player is in the game or spectating
	var playerIndex int
	var spectatorIndex int
	if !d.server {
		playerIndex = m.table.getPlayerIndexFromID(d.userID)
		spectatorIndex = m.table.getSpectatorIndexFromID(d.userID)
		if playerIndex == -1 && spectatorIndex == -1 {
			msg := fmt.Sprintf(
				"You are not playing or spectating at table %v, so you cannot send chat to it.",
				m.table.ID,
			)
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return
		}
	}

	// Store the chat in memory
	chatMsg := &ChatMessage{
		UserID:   d.userID,
		Username: d.username,
		Msg:      d.msg,
		Datetime: time.Now(),
		Server:   d.server,
	}
	m.table.Chat = append(m.table.Chat, chatMsg)

	// Send it to all of the players and spectators
	m.Dispatcher.Sessions.NotifyAllChat(d.msg, d.username, false, d.server, m.table.getRoomName())

	// If this user was typing, set them so that they are not typing
	// Check for spectators first in case this is a shared replay that the player happened to be in
	if d.server {
		return
	}
	if spectatorIndex != -1 {
		sp := m.table.spectators[spectatorIndex]
		if sp.Typing {
			sp.Typing = false
		}
	} else if playerIndex != -1 {
		p := m.table.Players[playerIndex]
		if p.Typing {
			p.Typing = false
		}
	}
}
