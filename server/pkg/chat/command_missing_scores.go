package chat

import (
	"fmt"
	"strings"
)

// /missingscores
func (m *Manager) commandMissingScores() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	usernames := make([]string, 0)
	if t.Replay {
		for _, sp := range t.Spectators {
			usernames = append(usernames, sp.Name)
		}
	} else {
		for _, p := range t.Players {
			usernames = append(usernames, p.Name)
		}
	}

	if len(usernames) < 2 || len(usernames) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	path := fmt.Sprintf("/shared-missing-scores/%v", strings.Join(usernames, "/"))
	msg := getURLFromPath(path)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
