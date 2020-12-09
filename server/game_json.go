package main

type GameJSON struct {
	ID      int             `json:"id,omitempty"` // Optional element only used for game exports
	Players []string        `json:"players"`
	Deck    []*CardIdentity `json:"deck"`
	Actions []*GameAction   `json:"actions"`
	// Options is an optional element
	// Thus, it must be a pointer so that we can tell if the value was specified or not
	Options *OptionsJSON `json:"options,omitempty"`
	// Notes is an optional element that contains the notes for each player
	Notes [][]string `json:"notes,omitempty"`
	// Characters is an optional element that specifies the "Detrimental Character" assignment for
	// each player, if any
	Characters []*CharacterAssignment `json:"characters,omitempty"`
	// Seed is an optional value that specifies the server-side seed for the game (e.g. "p2v0s1")
	// This allows the server to reconstruct the game without the deck being present and to properly
	// write the game back to the database
	Seed string `json:"seed,omitempty"`
}
