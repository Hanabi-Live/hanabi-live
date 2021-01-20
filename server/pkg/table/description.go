package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

func newDescription(t *table) *types.TableDescription {
	players := make([]string, 0)
	for _, p := range t.Players {
		players = append(players, p.Username)
	}

	spectators := make([]string, 0)
	for _, sp := range t.spectators {
		spectators = append(spectators, sp.username)
	}

	return &types.TableDescription{
		ID:   t.ID,
		Name: t.Name,

		Players:    players,
		Spectators: spectators,

		Visible:           t.Visible,
		PasswordProtected: len(t.PasswordHash) > 0,
		Running:           t.Running,
		Replay:            t.Replay,
		Progress:          t.Progress,

		NumPlayers:  len(t.Players),
		VariantName: t.Options.VariantName,
		Timed:       t.Options.Timed,
		TimeBase:    t.Options.TimeBase,
		TimePerTurn: t.Options.TimePerTurn,
	}
}
