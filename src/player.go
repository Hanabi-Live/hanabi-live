package main

import (
	"math"
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

type Player struct {
	ID      int
	Name    string
	Index   int
	Present bool
	Stats   models.Stats

	Hand  []*Card
	Time  time.Duration
	Notes []string

	Session *Session
}

func (p *Player) GiveClue(g *Game, d *CommandData) bool {
	// Find out what cards this clue touches
	list := make([]int, 0)
	for _, c := range g.Players[d.Target].Hand {
		touched := false
		if d.Clue.Type == 0 {
			// Number clue
			if c.Rank == d.Clue.Value {
				touched = true
			}
		} else if d.Clue.Type == 1 {
			// Color clue
			if variantIsCardTouched(g.Options.Variant, d.Clue.Value, c.Suit) {
				touched = true
			}
		}
		if touched {
			list = append(list, c.Order)
			c.Touched = true
		}
	}
	if len(list) == 0 {
		return false
	}

	// Keep track that someone clued
	g.Clues--
	g.DiscardSignal.Outstanding = false

	// Send the "notify" message about the clue
	g.Actions = append(g.Actions, Action{
		Clue:   d.Clue,
		Giver:  p.Index,
		List:   list,
		Target: d.Target,
		Type:   "clue",
	})
	g.NotifyAction()

	// Send the "message" message about the clue
	text := p.Name + " tells " + g.Players[d.Target].Name + " about "
	words := []string{
		"one",
		"two",
		"three",
		"four",
		"five",
	}
	text += words[len(list)-1] + " "

	if d.Clue.Type == 0 {
		// Number clue
		text += strconv.Itoa(d.Clue.Value)
	} else if d.Clue.Type == 1 {
		// Color clue
		text += variantGetClueName(g.Options.Variant, d.Clue.Value)
	}
	if len(list) > 1 {
		text += "s"
	}
	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	return true
}

func (p *Player) RemoveCard(target int) *Card {
	// Remove the card from their hand
	var removedCard *Card
	for i, c := range p.Hand {
		if c.Order == target {
			removedCard = c

			// Mark what the "slot" number is
			// e.g. slot 1 is the newest (left-most) card, which is index 5 (in a 3 player game)
			removedCard.Slot = len(p.Hand) - i

			p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)
			break
		}
	}

	if removedCard == nil {
		log.Fatal("The target of " + strconv.Itoa(target) + " is not in the hand of " + p.Name + ".")
	}

	return removedCard
}

func (p *Player) PlayCard(g *Game, c *Card) {
	// Find out if this successfully plays
	if c.Rank != g.Stacks[c.Suit]+1 {
		// The card does not play
		g.BlindPlays = 0
		c.Failed = true
		g.Strikes += 1

		// Send the "notify" message about the strike
		g.Actions = append(g.Actions, Action{
			Type: "strike",
			Num:  g.Strikes,
		})
		g.NotifyAction()

		p.DiscardCard(g, c)
		return
	}

	// Success; the card plays
	g.Score++
	g.Stacks[c.Suit]++

	// Send the "notify" message about the play
	g.Actions = append(g.Actions, Action{
		Type: "played",
		Which: Which{
			Index: p.Index,
			Rank:  c.Rank,
			Suit:  c.Suit,
			Order: c.Order,
		},
	})
	g.NotifyAction()

	// Send the "message" about the play
	text := p.Name + " plays " + c.Name(g) + " from "
	if c.Slot == -1 {
		text += "the deck"
	} else {
		text += "slot #" + strconv.Itoa(c.Slot)
	}
	if !c.Touched {
		text += " (blind)"
		g.BlindPlays++
		if g.BlindPlays > 4 {
			// There isn't a sound effect for more than 4 blind plays in a row
			g.BlindPlays = 4
		}
		g.Sound = "blind" + strconv.Itoa(g.BlindPlays)
	} else {
		g.BlindPlays = 0
	}
	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Give the team a clue if a 5 was played
	if c.Rank == 5 {
		g.Clues++
		if g.Clues > 8 {
			// The extra clue is wasted if they are at 8 clues already
			g.Clues = 8
		}
	}

	// Update the progress
	progress := float64(g.Score) / float64(g.MaxScore()) * 100 // In percent
	g.Progress = int(math.Round(progress))                     // Round it to the nearest integer
}

func (p *Player) DiscardCard(g *Game, c *Card) {
	// Keep track that someone discarded
	// (used for the "Reorder Cards" feature)
	if g.Options.ReorderCards {
		g.DiscardSignal.Outstanding = true
		g.DiscardSignal.TurnExpiration = g.Turn + len(g.Players) - 1
		log.Info("Discard signal outstanding, expiring on turn:", g.DiscardSignal.TurnExpiration)
	}

	// Mark that the card is discarded
	c.Discarded = true

	g.Actions = append(g.Actions, Action{
		Type: "discard",
		Which: Which{
			Index: p.Index,
			Rank:  c.Rank,
			Suit:  c.Suit,
			Order: c.Order,
		},
	})
	g.NotifyAction()

	text := p.Name + " "
	if c.Failed {
		text += "fails to play"
		g.Sound = "fail"
	} else {
		text += "discards"
	}
	text += " " + c.Name(g) + " from "
	if c.Slot == -1 {
		text += "the deck"
	} else {
		text += "slot #" + strconv.Itoa(c.Slot)
	}
	if !c.Failed && c.Touched {
		text += " (clued)"
	}
	if c.Failed && c.Slot != -1 && !c.Touched {
		text += " (blind)"
	}

	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Find out if this was a discard of a "critical" card
	if !c.Failed { // Ignore misplays
		// Search through the deck
		critical := true
		for _, deckCard := range g.Deck {
			if deckCard.Order == c.Order {
				// Skip over the card that was just discarded
				continue
			}

			if deckCard.Suit == c.Suit && deckCard.Rank == c.Rank && !deckCard.Discarded {
				critical = false
				break
			}
		}

		if critical {
			// Also check to see if the suit is "dead"
			// (meaning that the discarded card is trash and not actually critical)
			for i := 1; i < c.Rank; i++ {
				// Start with the 1s, then the 2s, etc., checking to see if they are all discarded
				totalCardsNotDiscarded := 3
				if i > 1 {
					totalCardsNotDiscarded = 2
				}
				if variantIsSuit1oE(g.Options.Variant, c.Suit) {
					totalCardsNotDiscarded = 1
				}
				for _, deckCard := range g.Deck {
					if deckCard.Suit == c.Suit && deckCard.Rank == i && deckCard.Discarded {
						totalCardsNotDiscarded--
					}
				}
				if totalCardsNotDiscarded == 0 {
					// The suit is "dead"
					critical = false
					break
				}
			}
		}

		if critical {
			// Play a sad sound because this discard just lost the game
			g.Sound = "sad"
		}
	}

}

func (p *Player) DrawCard(g *Game) {
	// Don't draw any more cards if the deck is empty
	if g.DeckIndex >= len(g.Deck) {
		return
	}

	// Put it in the player's hand
	c := g.Deck[g.DeckIndex]
	g.DeckIndex++
	p.Hand = append(p.Hand, c)

	g.Actions = append(g.Actions, Action{
		Type:  "draw",
		Who:   p.Index,
		Rank:  c.Rank,
		Suit:  c.Suit,
		Order: c.Order,
	})
	if g.Running {
		g.NotifyAction()
	}

	g.Actions = append(g.Actions, Action{
		Type: "drawSize",
		Size: len(g.Deck) - g.DeckIndex,
	})
	if g.Running {
		g.NotifyAction()
	}

	// Check to see if that was the last card drawn
	if g.DeckIndex >= len(g.Deck) {
		// Mark the turn upon which the game will end
		g.EndTurn = g.Turn + len(g.Players) + 1
	}
}

func (p *Player) PlayDeck(g *Game) {
	// Make the player draw the final card in the deck
	p.DrawCard(g)

	// Play the card freshly drawn
	c := p.RemoveCard(len(g.Deck) - 1) // The final card
	c.Slot = -1
	p.PlayCard(g, c)
}

// The "chop" is the oldest (right-most) unclued card
// (used for the "Reorder Cards" feature)
func (p *Player) GetChopIndex() int {
	chopIndex := -1

	// Go through their hand
	for i := 0; i < len(p.Hand); i++ {
		if !p.Hand[i].Touched {
			chopIndex = i
			break
		}
	}
	if chopIndex == -1 {
		// Their hand is filled with clued cards,
		// so the chop is considered to be their newest (left-most) card
		chopIndex = len(p.Hand) - 1
	}

	return chopIndex
}

func (p *Player) InHand(order int) bool {
	for _, c := range p.Hand {
		if c.Order == order {
			return true
		}
	}

	return false
}
