package main

import (
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

func (p *Player) GiveClue(g *Game, d *CommandData) {
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
			if g.Options.Variant >= 0 && g.Options.Variant <= 2 {
				// Normal, orange, and black
				if d.Clue.Value == c.Suit {
					touched = true
				}
			} else if g.Options.Variant == 3 || g.Options.Variant == 6 {
				// Multi (Rainbow) and White + Multi
				if d.Clue.Value == c.Suit || c.Suit == 5 {
					touched = true
				}
			} else if g.Options.Variant == 4 {
				// Mixed suits
				// 0 - Green    (Blue   / Yellow)
				// 1 - Purple   (Blue   / Red)
				// 2 - Navy     (Blue   / Black)
				// 3 - Orange   (Yellow / Red)
				// 4 - Tan      (Yellow / Black)
				// 5 - Burgundy (Red    / Black)
				if d.Clue.Value == 0 {
					// Blue clue
					if c.Suit == 0 || c.Suit == 1 || c.Suit == 2 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if c.Suit == 0 || c.Suit == 3 || c.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Red clue
					if c.Suit == 1 || c.Suit == 3 || c.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Purple clue
					if c.Suit == 2 || c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 5 {
				// Mixed and multi suits
				// 0 - Teal     (Blue / Green)
				// 1 - Lime     (Green / Yellow)
				// 2 - Orange   (Yellow / Red)
				// 3 - Cardinal (Red / Purple)
				// 4 - Indigo   (Purple / Blue)
				// 5 - Rainbow
				if d.Clue.Value == 0 {
					// Blue clue
					if c.Suit == 0 || c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if c.Suit == 0 || c.Suit == 1 || c.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Yellow clue
					if c.Suit == 1 || c.Suit == 2 || c.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Red clue
					if c.Suit == 2 || c.Suit == 3 || c.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 4 {
					// Black clue
					if c.Suit == 3 || c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 7 {
				// Wild & Crazy
				// 0 - Green   (Blue   / Yellow)
				// 1 - Purple  (Blue   / Red)
				// 2 - Orange  (Yellow / Red)
				// 3 - White
				// 4 - Rainbow
				// 5 - Black
				if d.Clue.Value == 0 {
					// Blue clue
					if c.Suit == 0 || c.Suit == 1 || c.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Yellow clue
					if c.Suit == 0 || c.Suit == 2 || c.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Red clue
					if c.Suit == 1 || c.Suit == 2 || c.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Black clue
					if c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 8 {
				// Ambiguous Suits
				// 0 - Blue
				// 1 - Green
				// 2 - Blue
				if d.Clue.Value == 0 {
					// Blue clue
					if c.Suit == 0 || c.Suit == 1 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if c.Suit == 2 || c.Suit == 3 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Red clue
					if c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 9 {
				// Blue & Red Suits
				// 0 - Blue
				// 1 - Red
				if d.Clue.Value == 0 {
					// Blue clue
					if c.Suit == 0 || c.Suit == 1 || c.Suit == 2 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if c.Suit == 3 || c.Suit == 4 || c.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 10 {
				// Acid Trip
				touched = true
			}
		}
		if touched {
			list = append(list, c.Order)
			c.Touched = true
		}
	}
	if len(list) == 0 {
		return
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
		if (g.Options.Variant == 1 || g.Options.Variant == 10) && d.Clue.Value == 5 {
			// Orange
			text += suits[8]
		} else if g.Options.Variant == 4 || g.Options.Variant == 7 {
			// Dual-color or Wild & Crazy
			text += mixedClues[d.Clue.Value]
		} else if g.Options.Variant == 8 {
			text += ambiguousClues[d.Clue.Value]
		} else if g.Options.Variant == 9 {
			text += blueRedClues[d.Clue.Value]
		} else {
			text += suits[d.Clue.Value]
		}
	}
	if len(list) > 1 {
		text += "s"
	}
	g.Actions = append(g.Actions, Action{
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)
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
	text := p.Name + " plays " + c.SuitName(g) + " " + strconv.Itoa(c.Rank) + " from "
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
	g.Progress = int(round(progress, 1))                       // Round it to the nearest integer
	// TODO replace with this native Math.round in Go 1.10
	// https://github.com/golang/go/issues/20100
}

func (p *Player) DiscardCard(g *Game, c *Card) {
	// Keep track that someone discarded
	// (used for the "Reorder Cards" feature)
	g.DiscardSignal.Outstanding = true
	g.DiscardSignal.TurnExpiration = g.Turn + len(g.Players) - 1
	log.Info("Discard signal outstanding, expiring on turn:", g.DiscardSignal.TurnExpiration)

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
	text += " " + c.SuitName(g) + " " + strconv.Itoa(c.Rank) + " from "
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
}

func (p *Player) DrawCard(g *Game) {
	// Don't draw any more cards if the deck is empty
	if g.DeckIndex >= len(g.Deck) {
		return
	}

	// Mark the order (position in the deck) on the card
	// (this was not done upon deck creation because the order would change after it was shuffled)
	c := g.Deck[g.DeckIndex]
	c.Order = g.DeckIndex
	g.DeckIndex++

	// Put it in the player's hand
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
