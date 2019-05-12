package main

// This struct holds elements of a game that must be constructed before the game
// is initialized, i.e. in the pre-game table.
type GameSpec struct {
	Options         *Options
	Players         []*Player
	Seed            string
}

type Options struct {
	Variant              string
	Timed                bool
	BaseTime             int
	TimePerTurn          int
	Speedrun             bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool
	Correspondence       bool // A table option to control the idle-timeout

	// The rest of the options are parsed from the table name
	SetSeed       string
	SetReplay     int
	SetReplayTurn int
	SetDeal       string
}

func (spec *GameSpec) GetPlayerIndex(id int) int {
	for i, p := range spec.Players {
		if p.ID == id {
			return i
		}
	}
	return -1
}

func (spec *GameSpec) GetHandSize() int {
	numPlayers := len(spec.Players)
	if numPlayers == 2 || numPlayers == 3 {
		return 5
	} else if numPlayers == 4 || numPlayers == 5 {
		return 4
	} else if numPlayers == 6 {
		return 3
	}

	// log.Fatal("Failed to get the hand size for " + strconv.Itoa(numPlayers) + " players for table: " + t.Name)
	return -1
}
