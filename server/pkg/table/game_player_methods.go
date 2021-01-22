// GamePlayer subroutines

package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card positions in the deck, not in the hand)
func (p *gamePlayer) findCardsTouchedByClue(clue *types.Clue) []int {
	// Local variables
	g := p.game

	list := make([]int, 0)
	for _, card := range p.Hand {
		if g.touchesCard(clue, card) {
			list = append(list, card.Order)
		}
	}

	return list
}

func (p *gamePlayer) isFirstCardTouchedByClue(clue *types.Clue) bool {
	// Local variables
	g := p.game
	card := p.Hand[len(p.Hand)-1]

	return g.touchesCard(clue, card)
}

func (p *gamePlayer) isLastCardTouchedByClue(clue *types.Clue) bool {
	// Local variables
	g := p.game
	card := p.Hand[0]

	return g.touchesCard(clue, card)
}

/*

// GetChopIndex gets the index of the oldest (right-most) unclued card
// (used for the "Card Cycling" feature)
func (p *GamePlayer) GetChopIndex() int {
	for i := 0; i < len(p.Hand); i++ {
		if !p.Hand[i].Touched {
			return i
		}
	}

	// Their hand is filled with clued cards,
	// so the chop is considered to be their newest (left-most) card
	return len(p.Hand) - 1
}

func (p *GamePlayer) InitTime(options *options.Options) {
	if options.Timed {
		// In timed games, each player starts with the base time specified in the options
		p.Time = time.Duration(options.TimeBase) * time.Second
	} else {
		// In non-timed games, each player starts with 0 "time left"
		// It will decrement into negative numbers to show how much time they are taking
		p.Time = time.Duration(0)
	}
}

func (p *GamePlayer) InHand(order int) bool {
	for _, c := range p.Hand {
		if c.Order == order {
			return true
		}
	}

	return false
}

func (p *GamePlayer) GetCardIndex(order int) int {
	for i, c := range p.Hand {
		if c.Order == order {
			return i
		}
	}

	return -1
}

func (p *GamePlayer) GetCardSlot(order int) int {
	// For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game)
	for i, c := range p.Hand {
		if c.Order == order {
			return len(p.Hand) - i
		}
	}

	return -1
}

func (p *GamePlayer) GetNextPlayer() int {
	i := p.Index + 1
	if i == len(p.Game.Players) {
		return 0
	}
	return i
}

func (p *GamePlayer) GetPreviousPlayer() int {
	i := p.Index - 1
	if i == -1 {
		return len(p.Game.Players) - 1
	}
	return i
}

func (p *GamePlayer) CycleHand() {
	// Local variables
	g := p.Game

	if !g.Options.CardCycle {
		return
	}

	// Find the chop card
	chopIndex := p.GetChopIndex()

	// We don't need to reorder anything if the chop is slot 1 (the left-most card)
	if chopIndex == len(p.Hand)-1 {
		return
	}

	chopCard := p.Hand[chopIndex]

	// Remove the chop card from their hand
	p.Hand = append(p.Hand[:chopIndex], p.Hand[chopIndex+1:]...)

	// Add it to the end (the left-most position)
	p.Hand = append(p.Hand, chopCard)
}

*/
