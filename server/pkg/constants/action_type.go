package constants

// When in a game, players can send certain types of "actions" to the server to communicate what
// kind of move they want to perform.
type ActionType int

const (
	ActionTypePlay ActionType = iota
	ActionTypeDiscard
	ActionTypeColorClue
	ActionTypeRankClue
	ActionTypeEndGame // Players cannot send this (internal only)
)
