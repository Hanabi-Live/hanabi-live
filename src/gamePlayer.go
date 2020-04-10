// This file contains the definition for GamePlayer as well as its main functions
// (that relate to in-game actions)

package main

import (
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

// GamePlayer is the object that represents the game state related aspects of the player
// (we separate the player object into two different objects;
// one for the table and one for the game)
type GamePlayer struct {
	// Some entries are copied from the Player object for convenience
	Name  string
	Index int
	Game  *Game

	// These relate to the game state
	Hand               []*Card
	Time               time.Duration
	Notes              []string
	RequestedPause     bool
	Character          string
	CharacterMetadata  int
	CharacterMetadata2 int
	Surprised          bool
}

var (
	noteRegExp = regexp.MustCompile(`.*\|(.+)`)
)

// GiveClue returns false if the clue is illegal
func (p *GamePlayer) GiveClue(d *CommandData) {
	// Local variables
	g := p.Game
	t := g.Table

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	var actionType int
	if d.Clue.Type == clueTypeColor {
		actionType = actionType2ColorClue
	} else if d.Clue.Type == clueTypeRank {
		actionType = actionType2RankClue
	}
	g.Actions2 = append(g.Actions2, &GameAction{
		Type:   actionType,
		Target: d.Target,
		Value:  d.Clue.Value,
	})

	// Keep track that someone clued (i.e. doing 1 clue costs 1 "Clue Token")
	g.ClueTokens--
	if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
		// In the "Clue Starved" variants, you only get 0.5 clues per discard
		// This is represented on the server by having each clue take two clues
		// On the client, clues are shown to the user to be divided by two
		g.ClueTokens--
	}
	g.LastClueTypeGiven = d.Clue.Type

	// Apply the positive and negative clues to the cards in the hand
	p2 := g.Players[d.Target] // The target of the clue
	cardsTouched := make([]int, 0)
	for _, c := range p2.Hand {
		positive := false
		if variantIsCardTouched(g.Options.Variant, d.Clue, c) {
			c.Touched = true
			cardsTouched = append(cardsTouched, c.Order)
			positive = true
		}
		c.Clues = append(c.Clues, &CardClue{
			Type:     d.Clue.Type,
			Value:    d.Clue.Value,
			Positive: positive,
		})
	}

	// Send the "notify" message about the clue
	g.Actions = append(g.Actions, ActionClue{
		Type:   "clue",
		Clue:   d.Clue,
		Giver:  p.Index,
		List:   cardsTouched,
		Target: d.Target,
		Turn:   g.Turn,
	})
	t.NotifyAction()

	// Send the "message" message about the clue
	text := p.Name + " tells " + p2.Name + " about "
	words := []string{
		"zero",
		"one",
		"two",
		"three",
		"four",
		"five",
	}
	text += words[len(cardsTouched)] + " "

	if d.Clue.Type == clueTypeRank {
		text += strconv.Itoa(d.Clue.Value)
	} else if d.Clue.Type == clueTypeColor {
		text += variants[g.Options.Variant].ClueColors[d.Clue.Value]
	}
	if len(cardsTouched) != 1 {
		text += "s"
	}

	if strings.HasPrefix(g.Options.Variant, "Cow & Pig") ||
		strings.HasPrefix(g.Options.Variant, "Duck") ||
		p.Character == "Quacker" { // 34

		// Create a list of slot numbers that correspond to the cards touched
		slots := make([]string, 0)
		for _, order := range cardsTouched {
			slots = append(slots, strconv.Itoa(p2.GetCardSlot(order)))
		}
		sort.Strings(slots)

		text = p.Name + " "
		if strings.HasPrefix(g.Options.Variant, "Cow & Pig") {
			// We want color clues to correspond to the first animal since color buttons are above
			// number buttons, even though rank comes first in the enum
			if d.Clue.Type == clueTypeRank {
				text += "oinks"
				g.Sound = "oink"
			} else if d.Clue.Type == clueTypeColor {
				text += "moos"
				g.Sound = "moo"
			}
		} else if strings.HasPrefix(g.Options.Variant, "Duck") ||
			p.Character == "Quacker" { // 34

			text += "quacks"
			g.Sound = "quack"
		}
		text += " at " + p2.Name + "'"
		if !strings.HasSuffix(p2.Name, "s") {
			text += "s"
		}
		text += " slot " + strings.Join(slots, "/")
	}

	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	logger.Info(t.GetName() + text)

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
	// e.g. slot 1 is the newest (left-most) card, which is index 5 (in a 3 player game)
	c.Slot = p.GetCardSlot(target)

	// Remove it from the hand
	p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)

	characterPostRemoveCard(g, p, c)

	return c
}

// PlayCard returns true if it is a "double discard" situation
// (which can only occur if the card fails to play)
func (p *GamePlayer) PlayCard(c *Card) bool {
	// Local variables
	g := p.Game
	t := g.Table

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	g.Actions2 = append(g.Actions2, &GameAction{
		Type:   actionType2Play,
		Target: c.Order,
	})

	// Check to see if revealing this card would surprise the player
	// (we want to have it at the beginning of the function so that the fail sound will overwrite
	// the surprise sound)
	p.CheckSurprise(c)

	// Find out if this successfully plays
	var failed bool
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		// In the "Up or Down" variants, cards do not play in order
		failed = variantUpOrDownPlay(g, c)
	} else {
		failed = c.Rank != g.Stacks[c.Suit]+1
	}

	// Handle "Detrimental Character Assignment" restrictions
	if characterCheckMisplay(g, p, c) { // (this returns true if it should misplay)
		failed = true
	}

	// Handle if the card does not play
	if failed {
		c.Failed = true
		g.Strikes++

		if strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") {
			// Pretend like this card successfully played
			if c.Touched {
				// Mark that the blind-play streak has ended
				g.BlindPlays = 0
			} else {
				g.BlindPlays++
				if g.BlindPlays > 4 {
					// There is no sound effect for more than 4 blind plays in a row
					g.BlindPlays = 4
				}
				g.Sound = "blind" + strconv.Itoa(g.BlindPlays)
			}
		} else {
			// Mark that the blind-play streak has ended
			g.BlindPlays = 0

			// Increase the misplay streak
			g.Misplays++
			if g.Misplays > 2 {
				// There is no sound effect for more than 2 misplays in a row
				g.Misplays = 2
			}
			g.Sound = "fail" + strconv.Itoa(g.Misplays)
		}

		// Send the "notify" message about the strike
		g.Actions = append(g.Actions, ActionStrike{
			Type:  "strike",
			Num:   g.Strikes,
			Turn:  g.Turn,
			Order: c.Order,
		})
		t.NotifyAction()

		return p.DiscardCard(c)
	}

	// Handle successful card plays
	c.Played = true
	g.Score++
	g.Stacks[c.Suit] = c.Rank
	if c.Rank == 0 {
		g.Stacks[c.Suit] = -1 // A rank 0 card is the "START" card
	}

	// Mark that the misplay streak has ended
	g.Misplays = 0

	// Send the "notify" message about the play
	g.Actions = append(g.Actions, ActionPlay{
		Type: "play",
		Which: Which{
			Index: p.Index,
			Suit:  c.Suit,
			Rank:  c.Rank,
			Order: c.Order,
		},
	})
	t.NotifyAction()

	// Send the "message" about the play
	text := p.Name + " plays "
	if strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") {
		text += "a card"
	} else {
		text += c.Name(g)
	}
	text += " from "
	if c.Slot == -1 {
		text += "the deck"
	} else {
		text += "slot #" + strconv.Itoa(c.Slot)
	}
	if c.Touched {
		// Mark that the blind-play streak has ended
		g.BlindPlays = 0
	} else {
		text += " (blind)"
		g.BlindPlays++
		if g.BlindPlays > 4 {
			// There is no sound effect for more than 4 blind plays in a row
			g.BlindPlays = 4
		}
		g.Sound = "blind" + strconv.Itoa(g.BlindPlays)
	}
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	logger.Info(t.GetName() + text)

	// Give the team a clue if the final card of the suit was played
	// (this will always be a 5 unless it is a custom variant)
	extraClue := c.Rank == 5

	// Handle custom variants that do not play in order from 1 to 5
	if strings.HasPrefix(g.Options.Variant, "Up or Down") {
		extraClue = (c.Rank == 5 || c.Rank == 1) &&
			g.StackDirections[c.Suit] == stackDirectionFinished
	}

	if extraClue {
		// Some variants do not grant an extra clue when successfully playing a 5
		if !strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") {
			g.ClueTokens++
		}

		// The extra clue is wasted if the team is at the maximum amount of clues already
		clueLimit := maxClueNum
		if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
			clueLimit *= 2
		}
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
		notifyAllTableProgress(t)
	}

	// In some variants, playing a card has the potential to reduce the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore

		// Only play the sad sound if we are not in the final round
		if g.EndTurn == -1 {
			g.Sound = "sad"
		}
	}

	// This is not a "double discard" situation, since the card successfully played
	return false
}

// DiscardCard returns true if it is a "double discard" situation
func (p *GamePlayer) DiscardCard(c *Card) bool {
	// Local variables
	g := p.Game
	t := g.Table

	// Add the action to the action log
	// (in the future, we will delete GameActions and only keep track of GameActions2)
	g.Actions2 = append(g.Actions2, &GameAction{
		Type:   actionType2Discard,
		Target: c.Order,
	})

	// Mark that the card is discarded
	c.Discarded = true

	g.Actions = append(g.Actions, ActionDiscard{
		Type:   "discard",
		Failed: c.Failed,
		Which: Which{
			Index: p.Index,
			Rank:  c.Rank,
			Suit:  c.Suit,
			Order: c.Order,
		},
	})
	t.NotifyAction()

	text := p.Name + " "
	if c.Failed {
		if strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") {
			text += "plays"
		} else {
			text += "fails to play"
		}
	} else {
		text += "discards"
	}
	text += " "
	if strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") && c.Failed {
		text += "a card"
	} else {
		text += c.Name(g)
	}
	text += " from "
	if c.Slot == -1 {
		text += "the deck"
	} else {
		text += "slot #" + strconv.Itoa(c.Slot)
	}
	if !c.Failed && c.Touched {
		text += " (clued)"
		g.Sound = "turn_discard_clued"
	}
	if c.Failed && c.Slot != -1 && !c.Touched {
		text += " (blind)"
	}

	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	logger.Info(t.GetName() + text)

	// Check to see if revealing this card would surprise the player
	// (we want to have it in the middle of the function so that it will
	// overwrite the clued card sound but not overwrite the sad sound)
	p.CheckSurprise(c)

	// This could have been a discard (or misplay) or a card needed to get the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore

		// Only play the sad sound if we are not in the final round and this was not a misplay
		if g.EndTurn == -1 && !c.Failed {
			g.Sound = "sad"
		}
	}

	// This could be a double discard situation if there is only one other copy of this card
	// and it needs to be played
	total, discarded := g.GetSpecificCardNum(c.Suit, c.Rank)
	doubleDiscard := total == discarded+1 && c.NeedsToBePlayed(g)

	// Return whether or not this is a "double discard" situation
	return doubleDiscard
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
		Type:  "draw",
		Who:   p.Index,
		Rank:  c.Rank,
		Suit:  c.Suit,
		Order: c.Order,
	})
	if t.Running {
		t.NotifyAction()
	}

	// Check to see if that was the last card drawn
	if g.DeckIndex >= len(g.Deck) {
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
