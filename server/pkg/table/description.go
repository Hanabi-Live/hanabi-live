package table

type Description struct {
	ID                int      `json:"id"`
	Name              string   `json:"name"`
	PasswordProtected bool     `json:"passwordProtected"`
	Joined            bool     `json:"joined"`
	NumPlayers        int      `json:"numPlayers"`
	Owned             bool     `json:"owned"`
	Running           bool     `json:"running"`
	Variant           string   `json:"variant"`
	Timed             bool     `json:"timed"`
	TimeBase          int      `json:"timeBase"`
	TimePerTurn       int      `json:"timePerTurn"`
	SharedReplay      bool     `json:"sharedReplay"`
	Progress          int      `json:"progress"`
	Players           []string `json:"players"`
	Spectators        []string `json:"spectators"`
}

func makeDescription(t *table, userID int) *Description {
	if !t.Visible {
		return nil
	}

	playerIndex := t.GetPlayerIndexFromID(userID)

	players := make([]string, 0)
	for _, p := range t.Players {
		players = append(players, p.Name)
	}

	spectators := make([]string, 0)
	for _, sp := range t.Spectators {
		spectators = append(spectators, sp.Name)
	}

	return &Description{
		ID:                t.ID,
		Name:              t.Name,
		PasswordProtected: len(t.PasswordHash) > 0,
		Joined:            playerIndex != -1,
		NumPlayers:        len(t.Players),
		Owned:             userID == t.OwnerID,
		Running:           t.Running,
		Variant:           t.Options.VariantName,
		Timed:             t.Options.Timed,
		TimeBase:          t.Options.TimeBase,
		TimePerTurn:       t.Options.TimePerTurn,
		SharedReplay:      t.Replay,
		Progress:          t.Progress,
		Players:           players,
		Spectators:        spectators,
	}
}
