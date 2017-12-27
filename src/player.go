package main

import (
	"github.com/Zamiell/hanabi-live/src/models"
)

type Player struct {
	ID      int
	Name    string
	Present bool
	Stats   models.Stats
	Hand    []*Card
	Time    int
	Notes   []string
	Session *Session
}

func (p *Player) GiveClue(g *Game, d *CommandData) {
	// Keep track that someone discarded
	// (used for the "Reorder Cards" feature)
	g.DiscardSignal.Outstanding = false

	// Find out what cards this clue touches
	list := make([]int, 0)
	for _, card := range g.Players[d.Target].Hand {
		touched := false
		if d.Clue.Type == 0 {
			// Number clue
			if card.Rank == d.Clue.Value {
				touched = true
			}
		} else if d.Clue.Type == 1 {
			// Color clue
			if g.Options.Variant >= 0 && g.Options.Variant <= 2 {
				// Normal, black, and black one of each
				if d.Clue.Value == card.Suit {
					touched = true
				}
			} else if g.Options.Variant == 3 || g.Options.Variant == 6 {
				// Multi (Rainbow) and White + Multi
				if d.Clue.Value == card.Suit || card.Suit == 5 {
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
					if card.Suit == 0 || card.Suit == 1 || card.Suit == 2 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if card.Suit == 0 || card.Suit == 3 || card.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Red clue
					if card.Suit == 1 || card.Suit == 3 || card.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Purple clue
					if card.Suit == 2 || card.Suit == 4 || card.Suit == 5 {
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
					if card.Suit == 0 || card.Suit == 4 || card.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Green clue
					if card.Suit == 0 || card.Suit == 1 || card.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Yellow clue
					if card.Suit == 1 || card.Suit == 2 || card.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Red clue
					if card.Suit == 2 || card.Suit == 3 || card.Suit == 5 {
						touched = true
					}
				} else if d.Clue.Value == 4 {
					// Black clue
					if card.Suit == 3 || card.Suit == 4 || card.Suit == 5 {
						touched = true
					}
				}
			} else if g.Options.Variant == 7 {
				// Crazy
				// 0 - Green   (Blue   / Yellow)
				// 1 - Purple  (Blue   / Red)
				// 2 - Orange  (Yellow / Red)
				// 3 - White
				// 4 - Rainbow
				// 5 - Black
				if d.Clue.Value == 0 {
					// Blue clue
					if card.Suit == 0 || card.Suit == 1 || card.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 1 {
					// Yellow clue
					if card.Suit == 0 || card.Suit == 2 || card.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 2 {
					// Red clue
					if card.Suit == 1 || card.Suit == 2 || card.Suit == 4 {
						touched = true
					}
				} else if d.Clue.Value == 3 {
					// Black clue
					if card.Suit == 4 || card.Suit == 5 {
						touched = true
					}
				}
			}
		}
		if touched {
			list = append(list, card.Order)
			card.Touched = true
		}
	}
	if len(list) == 0 {
		return
	}

	g.Clues--

	// Send the "notify" message about the clue
	action := &Action{
		Clue:   d.Clue,
		Giver:  g.GetIndex(p.Name),
		List:   list,
		Target: d.Target,
		Type:   "clue",
	}
	g.Actions = append(g.Actions, action)
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
	text += words[len(list) - 1] + " "

	   if d.Clue.Type == 0 {
		   // Number clue
	       text += d.Clue.Value
	   } else if d.Clue.Type == 1 {
		   // Color clue
	       text += d.Clue.Text();
	   }
	   if len(list) > 1 {
	       text += "s";
	   }
	   action2 := &Action{
		   Text: text
	   }
	   g.Actions = append(g.Actions, action2)
		g.NotifyAction()

}

func (p *Player) RemoveCard() {

}

func (p *Player) PlayCard() {

}

func (p *Player) DrawCard() {

}

func (p *Player) DiscardCard() {

}

func (p *Player) PlayDeck() {

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

func (c *Clue) Text(g *Game) string {
	if g.Options.Variant == 4 || g.Options.Variant == 7 {
		return mixedClues[c.Value]
	} else {
		return suits[c.Value]
	}
}
