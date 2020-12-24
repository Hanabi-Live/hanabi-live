package table

type Description struct {
	ID                int      `json:"id"`
	Name              string   `json:"name"`
	PasswordProtected bool     `json:"passwordProtected"`
	NumPlayers        int      `json:"numPlayers"`
	Running           bool     `json:"running"`
	VariantName       string   `json:"variantName"`
	Timed             bool     `json:"timed"`
	TimeBase          int      `json:"timeBase"`
	TimePerTurn       int      `json:"timePerTurn"`
	SharedReplay      bool     `json:"sharedReplay"`
	Progress          int      `json:"progress"`
	Players           []string `json:"players"`
	Spectators        []string `json:"spectators"`
}

func newDescription(t *table) *Description {
	if !t.Visible {
		return nil
	}

	players := make([]string, 0)
	for _, p := range t.Players {
		players = append(players, p.Username)
	}

	spectators := make([]string, 0)
	for _, sp := range t.spectators {
		spectators = append(spectators, sp.Username)
	}

	return &Description{
		ID:                t.ID,
		Name:              t.Name,
		PasswordProtected: len(t.PasswordHash) > 0,
		NumPlayers:        len(t.Players),
		Running:           t.Running,
		VariantName:       t.Options.VariantName,
		Timed:             t.Options.Timed,
		TimeBase:          t.Options.TimeBase,
		TimePerTurn:       t.Options.TimePerTurn,
		SharedReplay:      t.Replay,
		Progress:          t.Progress,
		Players:           players,
		Spectators:        spectators,
	}
}
