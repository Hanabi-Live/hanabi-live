// Actions represent a change in the game state
// Different actions will have different fields

package main

// Used to implement the "Slow-Witted" detrimental character
type ActionCardIdentity struct {
	Type        string `json:"type"`
	PlayerIndex int    `json:"playerIndex"` // Needed so that we can validate who holds the card
	Order       int    `json:"order"`
	SuitIndex   int    `json:"suitIndex"`
	Rank        int    `json:"rank"`
}

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
	Duration    int64   `json:"duration"`
}

type ActionPlayStackDirections struct {
	Type       string `json:"type"`
	Directions []int  `json:"directions"`
}

type ActionStrike struct {
	Type  string `json:"type"`
	Num   int    `json:"num"`   // Whether it was the first strike, the second strike, etc.
	Turn  int    `json:"turn"`  // The turn that the strike happened
	Order int    `json:"order"` // The order of the card that was played
}

type Clue struct {
	Type  int `json:"type"`
	Value int `json:"value"`
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
