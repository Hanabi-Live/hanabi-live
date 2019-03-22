package main

/*
	Actions represent a change in the game state
	Different actions will have different fields
*/

type ActionDraw struct {
	Type  string `json:"type"`
	Who   int    `json:"who"` // Who got dealt the card
	Rank  int    `json:"rank"`
	Suit  int    `json:"suit"`
	Order int    `json:"order"` // The ID of the card, based on its ordering in the deck
}
type ActionStatus struct {
	Type          string `json:"type"`
	Clues         int    `json:"clues"`
	Score         int    `json:"score"`
	MaxScore      int    `json:"maxScore"`
	DoubleDiscard bool   `json:"doubleDiscard"`
}
type ActionStackDirections struct {
	Type       string `json:"type"`
	Directions []int  `json:"directions"`
}
type ActionText struct {
	Type string `json:"type"`
	Text string `json:"text"`
}
type ActionTurn struct {
	Type string `json:"type"`
	Num  int    `json:"num"`
	Who  int    `json:"who"` // The index of which player's turn it is
}
type ActionClue struct {
	Type   string `json:"type"`
	Clue   Clue   `json:"clue"` // Defined in "command.go"
	Giver  int    `json:"giver"`
	List   []int  `json:"list"` // The list of cards that the clue "touches"
	Target int    `json:"target"`
	Turn   int    `json:"turn"` // The client records the turn that each clue is given (for the clue log)
}
type ActionPlay struct {
	Type  string `json:"type"`
	Which Which  `json:"which"`
}
type ActionDiscard struct {
	Type   string `json:"type"`
	Failed bool   `json:"failed"`
	Which  Which  `json:"which"`
}
type ActionReorder struct {
	Type      string `json:"type"`
	Target    int    `json:"target"`
	HandOrder []int  `json:"handOrder"`
}
type ActionStrike struct {
	Type  string `json:"type"`
	Num   int    `json:"num"`   // Whether it was the first strike, the second strike, etc.
	Turn  int    `json:"turn"`  // The turn that the strike happened
	Order int    `json:"order"` // The order of the card that was played
}
type ActionDeckOrder struct {
	Type string       `json:"type"`
	Deck []CardSimple `json:"deck"`
}
type Which struct { // Used by "ActionPlay" and "ActionDiscard"
	Index int `json:"index"` // The index of the player
	Suit  int `json:"suit"`
	Rank  int `json:"rank"`
	Order int `json:"order"` // The ID of the card (based on its order in the deck)
}
type CardSimple struct { // Used by "ActionDeckOrder"
	Suit int `json:"suit"`
	Rank int `json:"rank"`
}

// Scrub removes some information from an action so that we do not reveal
// to the client anything about the cards that they are drawing
func (a *ActionDraw) Scrub(g *Game, p *Player) {
	// The player will be nil if this is an action that is going to a spectator
	if p == nil {
		return
	}

	// Don't scrub in replays
	if g.Replay {
		return
	}

	if a.Who == p.Index || characterHideCard(a, g, p) {
		a.Rank = -1
		a.Suit = -1
	}
}
