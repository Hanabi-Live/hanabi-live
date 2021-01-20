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
	// Local variables
	t := m.table

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	usernames := make([]string, 0)
	if t.Replay {
		for _, sp := range t.spectators {
			usernames = append(usernames, sp.username)
		}
	} else {
		for _, p := range t.Players {
			usernames = append(usernames, p.Username)
		}
	}

	if len(usernames) < 2 || len(usernames) > 6 {
		noun := "game"
		if t.Replay {
			noun = "shared replay"
		}
		msg := fmt.Sprintf(
			"You can only perform this command if the %v has between 2 and 6 players.",
			noun,
		)
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
		return
	}

	path := fmt.Sprintf("/shared-missing-scores/%v", strings.Join(usernames, "/"))
	msg := util.GetURLFromPath(m.useTLS, m.domain, path)
	m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
}
