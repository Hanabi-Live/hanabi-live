package main

import (
	"strconv"
	"strings"
)

type Card struct {
	Order         int // Assigned after the deck is shuffled
	Suit          int
	Rank          int
	Slot          int // Assigned after the card is removed from a player's hand
	Touched       bool
	Clues         []*CardClue // This is a list that includes both positive and negative clues
	PossibleSuits []*Suit
	PossibleRanks []int
	PossibleCards map[string]int // Maps card identities to count
	Revealed      bool
	Discarded     bool
	Played        bool
	Failed        bool
	// After a player takes their final turn,
	// all of the remaining cards in their hand are marked with the following bool
	CannotBePlayed   bool
	InsistentTouched bool // Used by the "Insistent" character
}

func NewCard(g *Game, suitInt int, rank int) *Card {
	c := &Card{
		Suit: suitInt,
		Rank: rank,
		// We can't set the order here because the deck will be shuffled later
		Clues: make([]*CardClue, 0),
		PossibleSuits: append(
			variants[g.Options.Variant].Suits[:0:0],
			variants[g.Options.Variant].Suits...,
		),
		PossibleRanks: append(
			variants[g.Options.Variant].Ranks[:0:0],
			variants[g.Options.Variant].Ranks...,
		),
		PossibleCards: make(map[string]int),
	}

	return c
}

func (c *Card) Name(g *Game) string {
	name := variants[g.Options.Variant].Suits[c.Suit].Name // The name of the suit that this card is
	name += " "
	if c.Rank == startCardRank {
		name += "START"
	} else {
		name += strconv.Itoa(c.Rank)
	}
	return name
}

// NeedsToBePlayed returns true if the card is not yet played
// and is still needed to be played in order to get the maximum score
func (c *Card) NeedsToBePlayed(g *Game) bool {
	// First, check to see if a copy of this card has already been played
	for _, c2 := range g.Deck {
		if c2.Suit == c.Suit &&
			c2.Rank == c.Rank &&
			c2.Played {

			return false
		}
	}

	// Determining if the card needs to be played in the "Up or Down" variants is more complicated
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		return variantUpOrDownNeedsToBePlayed(g, c)
	}

	// Second, check to see if it is still possible to play this card
	// (the preceding cards in the suit might have already been discarded)
	for i := 1; i < c.Rank; i++ {
		total, discarded := g.GetSpecificCardNum(c.Suit, i)
		if total == discarded {
			// The suit is "dead", so this card does not need to be played anymore
			return false
		}
	}

	// By default, all cards not yet played will need to be played
	return true
}

func (c *Card) RemovePossibility(suit *Suit, rank int, removeAll bool) {
	// Every card has a possibility map that maps card identities to count
	mapIndex := suit.Name + strconv.Itoa(rank)
	cardsLeft := c.PossibleCards[mapIndex]
	if cardsLeft > 0 {
		// Remove one or all possibilities for this card,
		// (depending on whether the card was clued
		// or if we saw someone draw a copy of this card)
		cardsLeft := cardsLeft - 1
		if removeAll {
			cardsLeft = 0
		}
		c.PossibleCards[mapIndex] = cardsLeft
	}
}
