package table

type Clue struct {
	Type  int `json:"type"`
	Value int `json:"value"`
}

func NewClue(actionType int, value int) Clue {
	return Clue{
		// A color clue is action type 2
		// A rank clue is action type 3
		// Remap these to 0 and 1, respectively
		Type:  actionType - 2,
		Value: value,
	}
}
