package table

import (
	"fmt"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) MissingScores(userID int) {
	m.newRequest(requestTypeMissingScores, nil) // nolint: errcheck
}

func (m *Manager) missingScores(data interface{}) {
	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	usernames := make([]string, 0)
	if m.table.Replay {
		for _, sp := range m.table.spectators {
			usernames = append(usernames, sp.Username)
		}
	} else {
		for _, p := range m.table.Players {
			usernames = append(usernames, p.Username)
		}
	}

	if len(usernames) < 2 || len(usernames) > 6 {
		noun := "game"
		if m.table.Replay {
			noun = "shared replay"
		}
		msg := fmt.Sprintf(
			"You can only perform this command if the %v has between 2 and 6 players.",
			noun,
		)
		m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())
		return
	}

	path := fmt.Sprintf("/shared-missing-scores/%v", strings.Join(usernames, "/"))
	msg := util.GetURLFromPath(m.useTLS, m.domain, path)
	m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())
}
