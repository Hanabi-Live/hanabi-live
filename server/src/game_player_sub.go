// GamePlayer subroutines

package main

import (
	"strconv"
	"strings"
	"time"
)

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

func (p *GamePlayer) InitTime(options *Options) {
	if options.Timed {
		p.Time = time.Duration(options.TimeBase) * time.Second
	} else {
		// In non-timed games, start each player with 0 "time left"
		// It will decrement into negative numbers to show how much time they are taking
		p.Time = time.Duration(0)
	}
}

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card positions in the deck, not in the hand)
func (p *GamePlayer) FindCardsTouchedByClue(clue Clue) []int {
	// Local variables
	g := p.Game

	list := make([]int, 0)
	for _, c := range p.Hand {
		if variantIsCardTouched(g.Options.VariantName, clue, c) {
			list = append(list, c.Order)
		}
	}

	return list
}

func (p *GamePlayer) IsFirstCardTouchedByClue(clue Clue) bool {
	g := p.Game
	card := p.Hand[len(p.Hand)-1]
	return variantIsCardTouched(g.Options.VariantName, clue, card)
}

func (p *GamePlayer) IsLastCardTouchedByClue(clue Clue) bool {
	g := p.Game
	card := p.Hand[0]
	return variantIsCardTouched(g.Options.VariantName, clue, card)
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

// CheckSurprise checks to see if a player has a "wrong" note on a card that
// they just played or discarded
// This code mirrors the "morph()" client-side function
func (p *GamePlayer) CheckSurprise(c *Card) {
	// Local variables
	g := p.Game

	// Disable the surprise sound in certain variants
	if strings.HasPrefix(g.Options.VariantName, "Throw It in a Hole") {
		return
	}

	note := p.Notes[c.Order]
	if note == "" {
		return
	}

	// Only examine the text to the right of the rightmost pipe
	// (pipes are a conventional way to append new information to a note
	if strings.Contains(note, "|") {
		match := noteRegExp.FindStringSubmatch(note)
		if match != nil {
			note = match[1]
		}
	}
	note = strings.ToLower(note)   // Make all letters lowercase to simply the matching logic below
	note = strings.TrimSpace(note) // Remove all leading and trailing whitespace

	var noteSuit *Suit
	noteRank := -1
	for _, rank := range []int{1, 2, 3, 4, 5} {
		rankStr := strconv.Itoa(rank)
		if note == rankStr {
			noteRank = rank
			break
		}

		for _, suit := range variants[g.Options.VariantName].Suits {
			suitAbbrev := strings.ToLower(suit.Abbreviation)
			suitName := strings.ToLower(suit.Name)
			if note == suitAbbrev+rankStr || // e.g. "b1" or "B1"
				note == suitName+rankStr || // e.g. "blue1" or "Blue1" or "BLUE1"
				note == suitName+" "+rankStr || // e.g. "blue 1" or "Blue 1" or "BLUE 1"
				note == rankStr+suitAbbrev || // e.g. "1b" or "1B"
				note == rankStr+suitName || // e.g. "1blue" or "1Blue" or "1BLUE"
				note == rankStr+" "+suitName { // e.g. "1 blue" or "1 Blue" or "1 BLUE"

				noteSuit = suit
				noteRank = rank
				break
			}
		}
		if noteSuit != nil || noteRank != -1 {
			break
		}
	}

	// Only the rank was specified
	if noteSuit == nil && noteRank != -1 {
		if noteRank != c.Rank {
			p.Surprised = true
			return
		}
	}

	// The suit and the rank were specified
	if noteSuit != nil && noteRank != -1 {
		variant := variants[g.Options.VariantName]
		suit := variant.Suits[c.SuitIndex]
		if noteSuit.Name != suit.Name || noteRank != c.Rank {
			p.Surprised = true
			return
		}
	}
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
