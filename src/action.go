package main

type Action struct {
	Type          string `json:"type"`
	Who           int    `json:"who"`
	Suit          int    `json:"suit"`
	Rank          int    `json:"rank"`
	Text          string `json:"text"`
	Target        int    `json:"target"`
	HandOrder     []int  `json:"handOrder"`
	Clue          Clue   `json:"clue"`
	Giver         int    `json:"giver"`
	List          []int  `json:"list"`
	Turn          int    `json:"turn"`
	Which         Which  `json:"which"`
	Num           int    `json:"num"`
	Order         int    `json:"order"`
	Size          int    `json:"size"`
	Clues         int    `json:"clues"`
	Score         int    `json:"score"`
	MaxScore      int    `json:"maxScore"`
	Loss          bool   `json:"loss"`
	DoubleDiscard bool   `json:"doubleDiscard"`
}

type Which struct {
	Index int `json:"index"`
	Rank  int `json:"rank"`
	Suit  int `json:"suit"`
	Order int `json:"order"`
}

// Scrub removes some information from an action so that we do not reveal
// to the client anything about the cards that they are drawing
func (a *Action) Scrub(g *Game, p *Player) {
	// The player will be nil if this is an action that is going to a spectator
	if p == nil {
		return
	}

	// Don't scrub in shared replays
	if g.SharedReplay {
		return
	}

	if a.Type == "draw" &&
		(a.Who == p.Index || characterHideCard(a, g, p)) {

		a.Rank = -1
		a.Suit = -1
	}
}
