package table

type Description struct {
	ID   int    `json:"id"`
	Name string `json:"name"`

	Players    []string `json:"players"`
	Spectators []string `json:"spectators"`

	Visible           bool `json:"visible"`
	PasswordProtected bool `json:"passwordProtected"`
	Running           bool `json:"running"`
	Replay            bool `json:"replay"`
	Progress          int  `json:"progress"`

	NumPlayers  int    `json:"numPlayers"`
	VariantName string `json:"variantName"`
	Timed       bool   `json:"timed"`
	TimeBase    int    `json:"timeBase"`
	TimePerTurn int    `json:"timePerTurn"`
}

func newDescription(t *table) *Description {
	players := make([]string, 0)
	for _, p := range t.Players {
		players = append(players, p.Username)
	}

	spectators := make([]string, 0)
	for _, sp := range t.spectators {
		spectators = append(spectators, sp.username)
	}

	return &Description{
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
