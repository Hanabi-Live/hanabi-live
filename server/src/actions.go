// Actions represent a change in the game state
// Different actions will have different fields

package main

import "strings"

type ActionClue struct {
	Type   string `json:"type"`
	Clue   Clue   `json:"clue"`
	Giver  int    `json:"giver"`
	List   []int  `json:"list"` // The list of cards that the clue "touches"
	Target int    `json:"target"`
	// The client records the turn that each clue is given (for the clue log)
	Turn int `json:"turn"`
}

type ActionDiscard struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"`
	Order       int    `json:"order"` // The ID of the card (based on its order in the deck)
	SuitIndex   int    `json:"suitIndex"`
	Rank        int    `json:"rank"`
	Failed      bool   `json:"failed"`
}

type ActionDraw struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"`
	Order       int    `json:"order"` // The ID of the card, based on its ordering in the deck
	SuitIndex   int    `json:"suitIndex"`
	Rank        int    `json:"rank"`
}

type ActionGameDuration struct {
	Type     string `json:"type"`
	Duration int64  `json:"duration"`
}

type ActionGameOver struct {
	Type         string `json:"type"`
	EndCondition int    `json:"endCondition"`
	PlayerIndex  int    `json:"playerIndex"`
}

type ActionPlay struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"`
	Order       int    `json:"order"` // The ID of the card (based on its order in the deck)
	SuitIndex   int    `json:"suitIndex"`
	Rank        int    `json:"rank"`
}

type ActionPlayerTimes struct {
	Type        string  `json:"type"`
	PlayerTimes []int64 `json:"playerTimes"`
}

type ActionReorder struct {
	Type      string `json:"type"`
	Target    int    `json:"target"`
	HandOrder []int  `json:"handOrder"`
}

type ActionPlayStackDirections struct {
	Type       string `json:"type"`
	Directions []int  `json:"directions"`
}

type ActionStatus struct {
	Type          string `json:"type"`
	Clues         int    `json:"clues"`
	Score         int    `json:"score"`
	MaxScore      int    `json:"maxScore"`
	DoubleDiscard bool   `json:"doubleDiscard"`
}

type ActionStrike struct {
	Type  string `json:"type"`
	Num   int    `json:"num"`   // Whether it was the first strike, the second strike, etc.
	Turn  int    `json:"turn"`  // The turn that the strike happened
	Order int    `json:"order"` // The order of the card that was played
}

type ActionTurn struct {
	Type               string `json:"type"`
	Num                int    `json:"num"`
	CurrentPlayerIndex int    `json:"currentPlayerIndex"`
}

type Clue struct {
	Type  int `json:"type"`
	Value int `json:"value"`
}

// Scrub removes some information from an action so that we do not reveal to the client anything
// about the cards that they are drawing
func (a *ActionDraw) Scrub(t *Table, userID int) {
	// Local variables
	g := t.Game

	// Find their player index
	var p *GamePlayer
	i := t.GetPlayerIndexFromID(userID)
	j := t.GetSpectatorIndexFromID(userID)
	if i > -1 {
		// The person requesting the draw action is one of the active players
		p = g.Players[i]
	} else if j > -1 && t.Spectators[j].Shadowing {
		// The person requesting the draw action is shadowing one of the active players
		p = g.Players[t.Spectators[j].PlayerIndex]
	} else {
		return
	}

	if a.PlayerIndex == p.Index || // They are drawing the card
		// They are playing a special character that should not be able to see the card
		characterHideCard(a, g, p) {

		a.Rank = -1
		a.SuitIndex = -1
	}
}

// Scrub removes some information from played cards so that we do not reveal to the client anything
// about the cards that are played (in some specific variants)
func (a *ActionPlay) Scrub(t *Table) {
	if !strings.HasPrefix(t.Options.VariantName, "Throw It in a Hole") {
		return
	}

	a.Rank = -1
	a.SuitIndex = -1
}

func NewClue(d *CommandData) Clue {
	return Clue{
		// A color clue is action type 2
		// A rank clue is action type 3
		// Remap these to 0 and 1, respectively
		Type:  d.Type - 2,
		Value: d.Value,
	}
}
