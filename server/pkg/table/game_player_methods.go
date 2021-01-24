// GamePlayer subroutines

package table

import (
	"math"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
)

func (p *gamePlayer) cycleHand() {
	// Local variables
	g := p.game
	t := g.table

	if !t.Options.CardCycle {
		return
	}

	// Find the chop card
	chopIndex := p.getChopIndex()

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

func (p *gamePlayer) discardCard(c *card) {
	// Local variables
	g := p.game
	t := g.table
	m := t.manager

	// Add the action to the action log
	if !c.Failed {
		// If this is a failed play, then we already added the action in the "PlayCard()"" function
		g.DBActions = append(g.DBActions, &options.GameAction{
			Type:   constants.ActionTypeDiscard,
			Target: c.Order,
			Value:  0, // This is unused for discard actions
		})
	}

	// Mark that the card is discarded
	c.Discarded = true

	g.Actions = append(g.Actions, types.ActionDiscard{
		Type:        "discard",
		PlayerIndex: p.Index,
		Order:       c.Order,
		Rank:        c.Rank,
		SuitIndex:   c.SuitIndex,
		Failed:      c.Failed,
	})
	m.notifyGameAction()

	// This could have been a discard (or misplay) or a card needed to get the maximum score
	newMaxScore := g.getMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore
	}
}

func (p *gamePlayer) drawCard() {
	// Local variables
	g := p.game
	t := g.table
	m := t.manager

	// Don't draw any more cards if the deck is empty
	if g.DeckIndex >= len(g.Deck) {
		return
	}

	// Put it in the player's hand
	c := g.Deck[g.DeckIndex]
	g.DeckIndex++
	p.Hand = append(p.Hand, c)

	g.Actions = append(g.Actions, types.ActionDraw{
		Type:        "draw",
		PlayerIndex: p.Index,
		Order:       c.Order,
		SuitIndex:   c.SuitIndex,
		Rank:        c.Rank,
	})
	m.notifyGameAction()

	// If a card slides from slot 1 to slot 2, we might need to reveal the identity of the card to
	// a player with the "Slow-Witted" detrimental character
	m.characterSendCardIdentityOfSlot2(p.Index)

	// Check to see if that was the last card drawn
	// (in "All or Nothing" games, the game goes on until all the cards are played)
	if g.DeckIndex >= len(g.Deck) && !t.Options.AllOrNothing {
		// Mark the turn upon which the game will end
		g.EndTurn = g.Turn + len(g.Players) + 1
		m.characterAdjustEndTurn()
	}
}

func (p *gamePlayer) getCardIndex(order int) int {
	for i, c := range p.Hand {
		if c.Order == order {
			return i
		}
	}

	return -1
}

func (p *gamePlayer) getCardSlot(order int) int {
	// For example, slot 1 is the newest (left-most) card, which is at index 4 (in a 3-player game)
	for i, c := range p.Hand {
		if c.Order == order {
			return len(p.Hand) - i
		}
	}

	return -1
}

// getCardsTouchedByClue returns a slice of card orders.
// (In this context, "orders" are the card positions in the deck, not in the hand.)
func (p *gamePlayer) getCardsTouchedByClue(clue *types.Clue) []int {
	// Local variables
	g := p.game

	list := make([]int, 0)
	for _, c := range p.Hand {
		if g.touchesCard(clue, c) {
			list = append(list, c.Order)
		}
	}

	return list
}

// GetChopIndex gets the index of the oldest (right-most) unclued card.
func (p *gamePlayer) getChopIndex() int {
	for i := 0; i < len(p.Hand); i++ {
		if !p.Hand[i].Touched {
			return i
		}
	}

	// Their hand is filled with clued cards,
	// so the chop is considered to be their newest (left-most) card
	return len(p.Hand) - 1
}

func (p *gamePlayer) getNextPlayer() int {
	// Local variables
	g := p.game

	i := p.Index + 1
	if i == len(g.Players) {
		return 0
	}

	return i
}

func (p *gamePlayer) getPreviousPlayer() int {
	// Local variables
	g := p.game

	i := p.Index - 1
	if i == -1 {
		return len(g.Players) - 1
	}

	return i
}

// GiveClue returns false if the clue is illegal.
func (p *gamePlayer) giveClue(target int, actionType constants.ActionType, value int) {
	// Local variables
	g := p.game
	t := g.table
	m := t.manager
	clue := types.NewClue(actionType, value) // Convert the incoming data to a clue object

	// Add the action to the action log
	g.DBActions = append(g.DBActions, &options.GameAction{
		Type:   actionType,
		Target: target,
		Value:  clue.Value,
	})

	// Keep track that someone clued (i.e. doing 1 clue costs 1 "Clue Token")
	g.ClueTokens -= t.Variant.GetAdjustedClueTokens(1)
	g.LastClueTypeGiven = clue.Type

	// Apply the positive and negative clues to the cards in the hand
	p2 := g.Players[target] // The target of the clue
	cardsTouched := make([]int, 0)
	for _, c := range p2.Hand {
		if g.touchesCard(clue, c) {
			c.Touched = true
			cardsTouched = append(cardsTouched, c.Order)
		}
	}

	g.Actions = append(g.Actions, types.ActionClue{
		Type:   "clue",
		Clue:   clue,
		Giver:  p.Index,
		List:   cardsTouched,
		Target: target,
		Turn:   g.Turn,
	})
	m.notifyGameAction()

	// Do post-clue tasks
	m.characterPostClue(p, clue, p2)

	// Handle the "Card Cycling" feature
	p.cycleHand()
}

func (p *gamePlayer) inHand(order int) bool {
	for _, c := range p.Hand {
		if c.Order == order {
			return true
		}
	}

	return false
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

func (p *gamePlayer) playCard(c *card) {
	// Local variables
	g := p.game
	t := g.table
	m := t.manager

	// Add the action to the action log
	g.DBActions = append(g.DBActions, &options.GameAction{
		Type:   constants.ActionTypePlay,
		Target: c.Order,
		Value:  0, // This is unused for play actions
	})

	// Find out if this successfully plays
	var failed bool
	if t.Variant.HasReversedSuits() {
		// In the "Up or Down" and "Reversed" variants, cards might not play in order
		failed = variantReversiblePlay(g, c)
	} else {
		failed = c.Rank != g.Stacks[c.SuitIndex]+1
	}

	// Handle "Detrimental Character Assignment" restrictions
	if m.characterCheckMisplay(p, c) {
		failed = true
	}

	// Handle if the card does not play
	if failed {
		c.Failed = true
		g.Strikes++

		g.Actions = append(g.Actions, types.ActionStrike{
			Type:  "strike",
			Num:   g.Strikes,
			Turn:  g.Turn,
			Order: c.Order,
		})
		m.notifyGameAction()

		p.discardCard(c)
		return
	}

	// Handle successful card plays
	c.Played = true
	g.Score++
	g.Stacks[c.SuitIndex] = c.Rank
	if c.Rank == 0 {
		g.Stacks[c.SuitIndex] = -1 // A rank 0 card is the "START" card
	}

	g.Actions = append(g.Actions, types.ActionPlay{
		Type:        "play",
		PlayerIndex: p.Index,
		Order:       c.Order,
		SuitIndex:   c.SuitIndex,
		Rank:        c.Rank,
	})
	m.notifyGameAction()

	// Give the team a clue if the final card of the suit was played
	var extraClue bool
	if t.Variant.HasReversedSuits() {
		// Handle custom variants that do not play in order from 1 to 5
		extraClue = (c.Rank == 5 || c.Rank == 1) &&
			g.PlayStackDirections[c.SuitIndex] == variants.StackDirectionFinished
	} else {
		// Normally, the final card of a suit is a 5
		extraClue = c.Rank == 5 // nolint: gomnd
	}

	if extraClue {
		// Some variants do not grant an extra clue when successfully playing a 5
		if t.Variant.ShouldGiveClueTokenForPlaying5() {
			g.ClueTokens++
		}

		// The extra clue is wasted if the team is at the maximum amount of clues already
		clueLimit := t.Variant.GetAdjustedClueTokens(constants.MaxClueNum)
		if g.ClueTokens > clueLimit {
			g.ClueTokens = clueLimit
		}
	}

	// Update the progress
	// nolint: gomnd
	progressFloat := float64(g.Score) / float64(g.MaxScore) * 100 // In percent
	progress := int(math.Round(progressFloat))
	oldProgress := t.Progress
	if progress != oldProgress {
		t.Progress = progress
		m.notifyProgress()
	}

	// In some variants, playing a card has the potential to reduce the maximum score
	newMaxScore := g.getMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore
	}
}

func (p *gamePlayer) playDeck() {
	// Local variables
	g := p.game

	// Make the player draw the final card in the deck
	p.drawCard()

	// Play the card freshly drawn
	finalCardOrder := len(g.Deck) - 1
	c := p.removeCard(finalCardOrder)
	c.Slot = -1
	p.playCard(c)
}

func (p *gamePlayer) removeCard(target int) *card {
	// Local variables
	g := p.game
	t := g.table
	m := t.manager

	// Get the target card
	i := p.getCardIndex(target)
	c := p.Hand[i]

	// Mark what the "slot" number is
	// e.g. slot 1 is the newest (left-most) card, which is index 5 (in a 3-player game)
	c.Slot = p.getCardSlot(target)

	// Remove it from the hand
	p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)

	m.characterPostRemoveCard(p, c)

	return c
}

/*

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

*/
