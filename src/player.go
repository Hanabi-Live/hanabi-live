package main

import (
	"math"
	"math/rand"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

type Player struct {
	ID      int
	Name    string
	Index   int
	Present bool
	Stats   models.Stats

	Hand               []*Card
	Time               time.Duration
	Notes              []string
	Character          string
	CharacterMetadata  int
	CharacterMetadata2 int

	Session *Session
}

func (p *Player) GiveClue(d *CommandData, g *Game) bool {
	p2 := g.Players[d.Target] // The target of the clue
	cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
	if len(cardsTouched) == 0 &&
		// Make an exception for color clues in the "Color Blind" variants
		(d.Clue.Type != clueTypeColor || !strings.HasPrefix(g.Options.Variant, "Color Blind")) &&
		// Allow empty clues if the optional setting is enabled
		!g.Options.EmptyClues &&
		// Philosphers can only give empty clues
		p.Character != "Philospher" {

		return false
	}

	// Mark that the cards have been touched
	for _, order := range cardsTouched {
		c := g.Deck[order]
		c.Touched = true
	}

	// Keep track that someone clued
	g.Clues--

	// Send the "notify" message about the clue
	g.Actions = append(g.Actions, ActionClue{
		Type:   "clue",
		Clue:   d.Clue,
		Giver:  p.Index,
		List:   cardsTouched,
		Target: d.Target,
		Turn:   g.Turn,
	})
	g.NotifyAction()

	// Send the "message" message about the clue
	text := p.Name + " tells " + p2.Name + " "
	if len(cardsTouched) != 0 {
		text += "about "
		words := []string{
			"one",
			"two",
			"three",
			"four",
			"five",
		}
		text += words[len(cardsTouched)-1] + " "
	}

	if d.Clue.Type == clueTypeNumber {
		text += strconv.Itoa(d.Clue.Value)
	} else if d.Clue.Type == clueTypeColor {
		text += variants[g.Options.Variant].Clues[d.Clue.Value].Name
	}
	if len(cardsTouched) > 1 {
		text += "s"
	}
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Do post-clue tasks
	characterPostClue(d, g, p)

	return true
}

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card position in the deck, not in the hand)
func (p *Player) FindCardsTouchedByClue(clue Clue, g *Game) []int {
	list := make([]int, 0)
	for _, c := range p.Hand {
		if variantIsCardTouched(g.Options.Variant, clue, c) {
			list = append(list, c.Order)
		}
	}

	return list
}

func (p *Player) IsFirstCardTouchedByClue(clue Clue, g *Game) bool {
	card := p.Hand[len(p.Hand)-1]
	return variantIsCardTouched(g.Options.Variant, clue, card)
}

func (p *Player) IsLastCardTouchedByClue(clue Clue, g *Game) bool {
	card := p.Hand[0]
	return variantIsCardTouched(g.Options.Variant, clue, card)
}

func (p *Player) RemoveCard(target int, g *Game) *Card {
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

	characterPostRemove(g, p, removedCard)

	return removedCard
}

// PlayCard returns true if it is a "double discard" situation
// (which can only occur if the card fails to play)
func (p *Player) PlayCard(g *Game, c *Card) bool {
	// Find out if this successfully plays
	failed := c.Rank != g.Stacks[c.Suit]+1

	// Handle custom variants where the cards to not play in order from 1 to 5
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		if g.StackDirections[c.Suit] == stackDirectionUndecided {
			// If the stack direction is undecided, then there is either no cards played or a "START" card has been played
			if g.Stacks[c.Suit] == 0 {
				// No cards have been played yet on this stack
				failed = c.Rank != 0 && c.Rank != 1 && c.Rank != 5

				// Set the stack direction
				if !failed {
					if c.Rank == 1 {
						g.StackDirections[c.Suit] = stackDirectionUp
					} else if c.Rank == 5 {
						g.StackDirections[c.Suit] = stackDirectionDown
					}
				}
			} else if g.Stacks[c.Suit] == -1 {
				// The "START" card has been played
				failed = c.Rank != 2 && c.Rank != 4

				// Set the stack direction
				if !failed {
					if c.Rank == 2 {
						g.StackDirections[c.Suit] = stackDirectionUp
					} else if c.Rank == 4 {
						g.StackDirections[c.Suit] = stackDirectionDown
					}
				}
			}

		} else if g.StackDirections[c.Suit] == stackDirectionUp {
			// We don't have to check for failure if this is a "normal" stack that is going from 1 to 5,
			// because we just checked for that situation above

			// Set the stack direction
			if !failed && c.Rank == 5 {
				g.StackDirections[c.Suit] = stackDirectionFinished
			}
		} else if g.StackDirections[c.Suit] == stackDirectionDown {
			failed = c.Rank != g.Stacks[c.Suit]-1
			if g.Stacks[c.Suit] == 1 && c.Rank == 0 {
				// We also have to handle the case where a "START" card is played on top of a 1
				failed = true
			}

			// Set the stack direction
			if !failed && c.Rank == 1 {
				g.StackDirections[c.Suit] = stackDirectionFinished
			}
		}
	}

	// Handle "Detrimental Character Assignment" restrictions
	if characterCheckPlay(g, p, c) { // (this returns true if it should misplay)
		failed = true
	}

	// Handle if the card does not play
	if failed {
		c.Failed = true
		g.Strikes++

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0

		// Send the "notify" message about the strike
		g.Actions = append(g.Actions, ActionStrike{
			Type: "strike",
			Num:  g.Strikes,
		})
		g.NotifyAction()

		return p.DiscardCard(g, c)
	}

	// Handle successful card plays
	c.Played = true
	g.Score++
	g.Stacks[c.Suit] = c.Rank
	if c.Rank == 0 {
		g.Stacks[c.Suit] = -1 // A rank 0 card is the "START" card
	}

	// Send the "notify" message about the play
	g.Actions = append(g.Actions, ActionPlay{
		Type: "play",
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
			// There is no sound effect for more than 4 blind plays in a row
			g.BlindPlays = 4
		}
		g.Sound = "blind" + strconv.Itoa(g.BlindPlays)
	} else {
		// Mark that the blind-play streak has ended
		g.BlindPlays = 0
	}
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Give the team a clue if the final card of the suit was played
	// (this will always be a 5 unless it is a custom variant)
	extraClue := c.Rank == 5

	// Handle custom variants that do not play in order from 1 to 5
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		extraClue = (c.Rank == 5 || c.Rank == 1) && g.StackDirections[c.Suit] == stackDirectionFinished
	}

	if extraClue {
		g.Clues++
		if g.Clues > 8 {
			// The extra clue is wasted if they are at 8 clues already
			g.Clues = 8
		}
	}

	// Update the progress
	progress := float64(g.Score) / float64(g.MaxScore) * 100 // In percent
	g.Progress = int(math.Round(progress))                   // Round it to the nearest integer

	// This is not a "double discard" situation, since the card successfully played
	return false
}

// DiscardCard returns true if it is a "double discard" situation
func (p *Player) DiscardCard(g *Game, c *Card) bool {
	// Mark that the card is discarded
	c.Discarded = true

	g.Actions = append(g.Actions, ActionDiscard{
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

	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Find out if this was a misplay or discard of a "critical" card
	if c.IsCritical(g) && !c.IsDead(g) {
		// Decrease the maximum score possible for this game
		g.UpdateMaxScore()

		if !c.Failed { // Ignore misplays
			// Play a sad sound because this discard just reduced the maximum score, "losing" the game
			// (don't play the custom sound on a misplay, since the misplay sound will already indicate that an error occurred)
			g.Sound = "sad"
		}
	}

	// Find out if this is a "double discard" situation
	return c.Rank != 1 && !c.IsCritical(g) && !c.IsAlreadyPlayed(g)
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

	g.Actions = append(g.Actions, ActionDraw{
		Type:  "draw",
		Who:   p.Index,
		Rank:  c.Rank,
		Suit:  c.Suit,
		Order: c.Order,
	})
	if g.Running {
		g.NotifyAction()
	}

	g.Actions = append(g.Actions, ActionDrawSize{
		Type: "drawSize",
		Size: len(g.Deck) - g.DeckIndex,
	})
	if g.Running {
		g.NotifyAction()
	}

	// Check to see if that was the last card drawn
	if g.DeckIndex >= len(g.Deck) {
		// Mark the turn upon which the game will end
		g.EndTurn = g.Turn + len(g.Players)
		characterAdjustEndTurn(g)
	}
}

func (p *Player) PlayDeck(g *Game) {
	// Make the player draw the final card in the deck
	p.DrawCard(g)

	// Play the card freshly drawn
	c := p.RemoveCard(len(g.Deck)-1, g) // The final card
	c.Slot = -1
	p.PlayCard(g, c)
}

func (p *Player) InHand(order int) bool {
	for _, c := range p.Hand {
		if c.Order == order {
			return true
		}
	}

	return false
}

func (p *Player) ShuffleHand(g *Game) {
	// From: https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	rand.Seed(time.Now().UTC().UnixNano())
	for i := range p.Hand {
		j := rand.Intn(i + 1)
		p.Hand[i], p.Hand[j] = p.Hand[j], p.Hand[i]
	}

	for _, c := range p.Hand {
		// Remove all clues from cards in the hand
		c.Touched = false

		// Remove all notes from cards in the hand
		p.Notes[c.Order] = ""
	}

	// Make an array that represents the order of the player's hand
	handOrder := make([]int, 0)
	for _, c := range p.Hand {
		handOrder = append(handOrder, c.Order)
	}

	// Notify everyone about the shuffling
	g.Actions = append(g.Actions, ActionReorder{
		Type:      "reorder",
		Target:    p.Index,
		HandOrder: handOrder,
	})
	g.NotifyAction()
}
