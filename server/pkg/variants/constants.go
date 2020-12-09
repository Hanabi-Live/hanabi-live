package variants

const (
	DefaultVariantName = "No Variant"

	// The "Up or Down" variants have "START" cards
	// Rank 0 is the stack base
	// Rank 1-5 are the normal cards
	// Rank 6 is a card of unknown rank
	// Rank 7 is a "START" card
	StartCardRank = 7

	// A "reversed" version of every suit exists
	suitReversedSuffix = " Reversed"
)

// iota starts at 0 and counts upwards
// i.e. stackDirectionUndecided = 0, stackDirectionUp = 1, etc.

const (
	StackDirectionUndecided = iota
	StackDirectionUp
	StackDirectionDown
	StackDirectionFinished
)
