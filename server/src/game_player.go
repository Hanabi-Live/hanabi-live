// This file contains the definition for GamePlayer as well as its main functions
// (that relate to in-game actions)

package main

import (
	"math"
	"strconv"
	"time"
)

// GamePlayer is the object that represents the game state related aspects of the player
// (we separate the player object into two different objects;
// one for the table and one for the game)
type GamePlayer struct {
	// Some entries are copied from the Player object for convenience
	Name  string
	Index int
	// This is a reference to the parent game
	Game *Game `json:"-"` // Skip circular references when encoding

	// These relate to the game state
	Hand              []*Card
	Time              time.Duration
	Notes             []string
	RequestedPause    bool
	Character         string
	CharacterMetadata int
}

// GiveClue returns false if the clue is illegal
func (p *GamePlayer) GiveClue(d *CommandData) {
	// Local variables
	g := p.Game
	t := g.Table
	variant := variants[t.Options.VariantName]
	clue := NewClue(d) // Convert the incoming data to a clue object

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	var actionType int
	if clue.Type == ClueTypeColor {
		actionType = ActionTypeColorClue
	} else if clue.Type == ClueTypeRank {
		actionType = ActionTypeRankClue
	}
	g.Actions2 = append(g.Actions2, &GameAction{
		Type:   actionType,
		Target: d.Target,
		Value:  clue.Value,
	})

	// Keep track that someone clued (i.e. doing 1 clue costs 1 "Clue Token")
	g.ClueTokens -= variant.GetAdjustedClueTokens(1)
	g.LastClueTypeGiven = clue.Type

	// Apply the positive and negative clues to the cards in the hand
	p2 := g.Players[d.Target] // The target of the clue
	cardsTouched := make([]int, 0)
	for _, c := range p2.Hand {
		if variantIsCardTouched(g.Options.VariantName, clue, c) {
			c.Touched = true
			cardsTouched = append(cardsTouched, c.Order)
		}
	}

	g.Actions = append(g.Actions, ActionClue{
		Type:   "clue",
		Clue:   clue,
		Giver:  p.Index,
		List:   cardsTouched,
		Target: d.Target,
		Turn:   g.Turn,
	})
	t.NotifyGameAction()

	// Do post-clue tasks
	characterPostClue(d, g, p)

	// Handle the "Card Cycling" feature
	p.CycleHand()
}

func (p *GamePlayer) RemoveCard(target int) *Card {
	// Local variables
	g := p.Game

	// Get the target card
	i := p.GetCardIndex(target)
	c := p.Hand[i]

	// Mark what the "slot" number is
	// e.g. slot 1 is the newest (left-most) card, which is index 5 (in a 3-player game)
	c.Slot = p.GetCardSlot(target)

	// Remove it from the hand
	p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)

	characterPostRemoveCard(g, p, c)

	return c
}

func (p *GamePlayer) PlayCard(c *Card) {
	// Local variables
	g := p.Game
	t := g.Table
	variant := variants[t.Options.VariantName]

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	g.Actions2 = append(g.Actions2, &GameAction{
		Type:   ActionTypePlay,
		Target: c.Order,
	})

	// Find out if this successfully plays
	var failed bool
	if variant.HasReversedSuits() {
		// In the "Up or Down" and "Reversed" variants, cards might not play in order
		failed = variantReversiblePlay(g, c)
	} else {
		failed = c.Rank != g.Stacks[c.SuitIndex]+1
	}

	// Handle "Detrimental Character Assignment" restrictions
	if characterCheckMisplay(g, p, c) { // (this returns true if it should misplay)
		failed = true
	}

	// Handle if the card does not play
	if failed {
		c.Failed = true
		g.Strikes++

		g.Actions = append(g.Actions, ActionStrike{
			Type:  "strike",
			Num:   g.Strikes,
			Turn:  g.Turn,
			Order: c.Order,
		})
		t.NotifyGameAction()

		p.DiscardCard(c)
		return
	}

	// Handle successful card plays
	c.Played = true
	g.Score++
	g.Stacks[c.SuitIndex] = c.Rank
	if c.Rank == 0 {
		g.Stacks[c.SuitIndex] = -1 // A rank 0 card is the "START" card
	}

	g.Actions = append(g.Actions, ActionPlay{
		Type:        "play",
		PlayerIndex: p.Index,
		Order:       c.Order,
		SuitIndex:   c.SuitIndex,
		Rank:        c.Rank,
	})
	t.NotifyGameAction()

	// Give the team a clue if the final card of the suit was played
	// (this will always be a 5 unless it is a custom variant)
	extraClue := c.Rank == 5

	// Handle custom variants that do not play in order from 1 to 5
	if variant.HasReversedSuits() {
		extraClue = (c.Rank == 5 || c.Rank == 1) &&
			g.PlayStackDirections[c.SuitIndex] == StackDirectionFinished
	}

	if extraClue {
		// Some variants do not grant an extra clue when successfully playing a 5
		if variant.ShouldGiveClueTokenForPlaying5() {
			g.ClueTokens++
		}

		// The extra clue is wasted if the team is at the maximum amount of clues already
		clueLimit := variant.GetAdjustedClueTokens(MaxClueNum)
		if g.ClueTokens > clueLimit {
			g.ClueTokens = clueLimit
		}
	}

	// Update the progress
	progressFloat := float64(g.Score) / float64(g.MaxScore) * 100 // In percent
	progress := int(math.Round(progressFloat))
	oldProgress := t.Progress
	if progress != oldProgress {
		t.Progress = progress
		t.NotifyProgress()
	}

	// In some variants, playing a card has the potential to reduce the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore
	}
}

func (p *GamePlayer) DiscardCard(c *Card) {
	// Local variables
	g := p.Game
	t := g.Table

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	if !c.Failed {
		// If this is a failed play, then we already added the action in the "PlayCard()"" function
		g.Actions2 = append(g.Actions2, &GameAction{
			Type:   ActionTypeDiscard,
			Target: c.Order,
		})
	}

	// Mark that the card is discarded
	c.Discarded = true

	g.Actions = append(g.Actions, ActionDiscard{
		Type:        "discard",
		PlayerIndex: p.Index,
		Order:       c.Order,
		Rank:        c.Rank,
		SuitIndex:   c.SuitIndex,
		Failed:      c.Failed,
	})
	t.NotifyGameAction()

	// This could have been a discard (or misplay) or a card needed to get the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore
	}
}

func (p *GamePlayer) DrawCard() {
	// Local variables
	g := p.Game
	t := g.Table

	// Don't draw any more cards if the deck is empty
	if g.DeckIndex >= len(g.Deck) {
		return
	}

	// Put it in the player's hand
	c := g.Deck[g.DeckIndex]
	g.DeckIndex++
	p.Hand = append(p.Hand, c)

	g.Actions = append(g.Actions, ActionDraw{
		Type:        "draw",
		PlayerIndex: p.Index,
		Order:       c.Order,
		SuitIndex:   c.SuitIndex,
		Rank:        c.Rank,
	})
	t.NotifyGameAction()

	// If a card slides from slot 1 to slot 2, we might need to reveal the identity of the card to
	// a player with the "Slow-Witted" detrimental character
	characterSendCardIdentityOfSlot2(g, p.Index)

	// Check to see if that was the last card drawn
	// (in "All or Nothing" games, the game goes on until all the cards are played)
	if g.DeckIndex >= len(g.Deck) && !g.Options.AllOrNothing {
		// Mark the turn upon which the game will end
		g.EndTurn = g.Turn + len(g.Players) + 1
		characterAdjustEndTurn(g)
		logger.Info(t.GetName() + "Marking to end the game on turn: " + strconv.Itoa(g.EndTurn))
	}
}

func (p *GamePlayer) PlayDeck() {
	// Local variables
	g := p.Game

	// Make the player draw the final card in the deck
	p.DrawCard()

	// Play the card freshly drawn
	c := p.RemoveCard(len(g.Deck) - 1) // The final card
	c.Slot = -1
	p.PlayCard(c)
}
