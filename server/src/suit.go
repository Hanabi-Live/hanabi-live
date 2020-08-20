package main

type Suit struct {
	Name         string
	Abbreviation string   `json:"abbreviation"`
	ClueColors   []string `json:"clueColors"`
	DisplayName  string   `json:"displayName"`
	OneOfEach    bool     `json:"oneOfEach"`
	Pip          string   `json:"pip"`
	Reversed     bool     `json:"reversed"`

	AllClueColors bool `json:"allClueColors"`
	AllClueRanks  bool `json:"allClueRanks"`
	NoClueColors  bool `json:"noClueColors"`
	NoClueRanks   bool `json:"noClueRanks"`
}
