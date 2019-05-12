package main

import (
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/src/models"
)

type Player struct {
	ID      int // This is equal to the database ID for the user
	Name    string
	Index   int
	Session *Session
	Present bool
	Stats   models.Stats

	Hand               []*Card
	Time               time.Duration
	Notes              []string
	RequestedPause     bool
	Character          string
	CharacterMetadata  int
	CharacterMetadata2 int
}

func (p *Player) InitTime(t *Table) {
	// In non-timed tables, start each player with 0 "time left"
	// It will decrement into negative numbers to show how much time they are taking
	p.Time = time.Duration(0)
	if t.GameSpec.Options.Timed {
		p.Time = time.Duration(t.GameSpec.Options.BaseTime) * time.Second
	}
}

/*
	Main functions, relating to in-table actions
*/

// GiveClue returns false if the clue is illegal
func (p *Player) GiveClue(d *CommandData, t *Table) {
	p2 := t.GameSpec.Players[d.Target] // The target of the clue
	cardsTouched := p2.FindCardsTouchedByClue(d.Clue, t)

	// Mark that the cards have been touched
	for _, order := range cardsTouched {
		c := t.Game.Deck[order]
		c.Touched = true
	}

	// Keep track that someone clued (i.e. doing 1 clue costs 1 "Clue Token")
	t.Game.Clues--
	if strings.HasPrefix(t.GameSpec.Options.Variant, "Clue Starved") {
		// In the "Clue Starved" variants, you only get 0.5 clues per discard
		// This is represented on the server by having each clue take two clues
		// On the client, clues are shown to the user to be divided by two
		t.Game.Clues--
	}

	// Send the "notify" message about the clue
	t.Game.Actions = append(t.Game.Actions, ActionClue{
		Type:   "clue",
		Clue:   d.Clue,
		Giver:  p.Index,
		List:   cardsTouched,
		Target: d.Target,
		Turn:   t.Game.Turn,
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
		text += variants[t.GameSpec.Options.Variant].ClueColors[d.Clue.Value]
	}
	if len(cardsTouched) != 1 {
		text += "s"
	}

	if strings.HasPrefix(t.GameSpec.Options.Variant, "Cow & Pig") ||
		strings.HasPrefix(t.GameSpec.Options.Variant, "Duck") {

		// Create a list of slot numbers that correspond to the cards touched
		slots := make([]string, 0)
		for _, order := range cardsTouched {
			slots = append(slots, strconv.Itoa(p2.GetCardSlot(order)))
		}
		sort.Strings(slots)

		text = p.Name + " "
		if strings.HasPrefix(t.GameSpec.Options.Variant, "Cow & Pig") {
			// We want color clues to correspond to the first animal since color buttons are above
			// number buttons, even though rank comes first in the enum
			if d.Clue.Type == clueTypeRank {
				text += "oinks"
			} else if d.Clue.Type == clueTypeColor {
				text += "moos"
			}
		} else if strings.HasPrefix(t.GameSpec.Options.Variant, "Duck") {
			text += "quacks"
		}
		text += " at " + p2.Name + "'"
		if !strings.HasSuffix(p2.Name, "s") {
			text += "s"
		}
		text += " slot " + strings.Join(slots, "/")

		// Also play a custom sound effect
		if strings.HasPrefix(t.GameSpec.Options.Variant, "Duck") {
			t.Game.Sound = "quack"
		}
	}

	t.Game.Actions = append(t.Game.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	log.Info(t.GetName() + text)

	// Do post-clue tasks
	characterPostClue(d, t, p)
}

func (p *Player) RemoveCard(target int, t *Table) *Card {
	// Get the target card
	i := p.GetCardIndex(target)
	c := p.Hand[i]

	// Mark what the "slot" number is
	// e.t. slot 1 is the newest (left-most) card, which is index 5 (in a 3 player table)
	c.Slot = p.GetCardSlot(target)

	// Remove it from the hand
	p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)

	characterPostRemove(t, p, c)

	return c
}

// PlayCard returns true if it is a "double discard" situation
// (which can only occur if the card fails to play)
func (p *Player) PlayCard(t *Table, c *Card) bool {
	// Find out if this successfully plays
	var failed bool
	if strings.HasPrefix(t.GameSpec.Options.Variant, "Up or Down") {
		// In the "Up or Down" variants, cards do not play in order
		failed = variantUpOrDownPlay(t.Game, c)
	} else {
		failed = c.Rank != t.Game.Stacks[c.Suit]+1
	}

	// Handle "Detrimental Character Assignment" restrictions
	if characterCheckMisplay(t, p, c) { // (this returns true if it should misplay)
		failed = true
	}

	// Handle if the card does not play
	if failed {
		c.Failed = true
		t.Game.Strikes++

		// Mark that the blind-play streak has ended
		t.Game.BlindPlays = 0

		// Increase the misplay streak
		t.Game.Misplays++
		if t.Game.Misplays > 2 {
			// There is no sound effect for more than 2 misplays in a row
			t.Game.Misplays = 2
		}
		t.Game.Sound = "fail" + strconv.Itoa(t.Game.Misplays)

		// Send the "notify" message about the strike
		t.Game.Actions = append(t.Game.Actions, ActionStrike{
			Type:  "strike",
			Num:   t.Game.Strikes,
			Turn:  t.Game.Turn,
			Order: c.Order,
		})
		t.NotifyAction()

		return p.DiscardCard(t, c)
	}

	// Handle successful card plays
	c.Played = true
	t.Game.Score++
	t.Game.Stacks[c.Suit] = c.Rank
	if c.Rank == 0 {
		t.Game.Stacks[c.Suit] = -1 // A rank 0 card is the "START" card
	}

	// Mark that the misplay streak has ended
	t.Game.Misplays = 0

	// Send the "notify" message about the play
	t.Game.Actions = append(t.Game.Actions, ActionPlay{
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
	text := p.Name + " plays " + c.Name(t) + " from "
	if c.Slot == -1 {
		text += "the deck"
	} else {
		text += "slot #" + strconv.Itoa(c.Slot)
	}
	if c.Touched {
		// Mark that the blind-play streak has ended
		t.Game.BlindPlays = 0
	} else {
		text += " (blind)"
		t.Game.BlindPlays++
		if t.Game.BlindPlays > 4 {
			// There is no sound effect for more than 4 blind plays in a row
			t.Game.BlindPlays = 4
		}
		t.Game.Sound = "blind" + strconv.Itoa(t.Game.BlindPlays)
	}
	t.Game.Actions = append(t.Game.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	log.Info(t.GetName() + text)

	// Give the team a clue if the final card of the suit was played
	// (this will always be a 5 unless it is a custom variant)
	extraClue := c.Rank == 5

	// Handle custom variants that do not play in order from 1 to 5
	if strings.HasPrefix(t.GameSpec.Options.Variant, "Up or Down") {
		extraClue = (c.Rank == 5 || c.Rank == 1) && t.Game.StackDirections[c.Suit] == stackDirectionFinished
	}

	if extraClue {
		t.Game.Clues++

		// The extra clue is wasted if the team is at the maximum amount of clues already
		clueLimit := maxClues
		if strings.HasPrefix(t.GameSpec.Options.Variant, "Clue Starved") {
			clueLimit *= 2
		}
		if t.Game.Clues > clueLimit {
			t.Game.Clues = clueLimit
		}
	}

	// Update the progress
	progress := float64(t.Game.Score) / float64(t.Game.MaxScore) * 100 // In percent
	t.Game.Progress = int(math.Round(progress))                   // Round it to the nearest integer

	// In some variants, playing a card has the potential to reduce the maximum score
	newMaxScore := t.Game.GetMaxScore()
	if newMaxScore < t.Game.MaxScore {
		// Decrease the maximum score possible for this table
		t.Game.MaxScore = newMaxScore

		// Play a sad sound
		t.Game.Sound = "sad"
	}

	// This is not a "double discard" situation, since the card successfully played
	return false
}

// DiscardCard returns true if it is a "double discard" situation
func (p *Player) DiscardCard(t *Table, c *Card) bool {
	// Mark that the card is discarded
	c.Discarded = true

	t.Game.Actions = append(t.Game.Actions, ActionDiscard{
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
		text += "fails to play"
	} else {
		text += "discards"
	}
	text += " " + c.Name(t) + " from "
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

	t.Game.Actions = append(t.Game.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	t.NotifyAction()
	log.Info(t.GetName() + text)

	// This could have been a discard (or misplay) or a card needed to get the maximum score
	newMaxScore := t.Game.GetMaxScore()
	if newMaxScore < t.Game.MaxScore {
		// Decrease the maximum score possible for this table
		t.Game.MaxScore = newMaxScore

		// Play a sad sound
		// (don't play the custom sound on a misplay,
		// since the misplay sound will already indicate that an error has occurred)
		if !c.Failed {
			t.Game.Sound = "sad"
		}
	}

	// This could be a double discard situation if there is only one other copy of this card
	// and it needs to be played
	total, discarded := t.Game.GetSpecificCardNum(c.Suit, c.Rank)
	doubleDiscard := total == discarded+1 && c.NeedsToBePlayed(t)

	// Return whether or not this is a "double discard" situation
	return doubleDiscard
}

func (p *Player) DrawCard(t *Table) {
	// Don't draw any more cards if the deck is empty
	if t.Game.DeckIndex >= len(t.Game.Deck) {
		return
	}

	// Put it in the player's hand
	c := t.Game.Deck[t.Game.DeckIndex]
	t.Game.DeckIndex++
	p.Hand = append(p.Hand, c)

	t.Game.Actions = append(t.Game.Actions, ActionDraw{
		Type:  "draw",
		Who:   p.Index,
		Rank:  c.Rank,
		Suit:  c.Suit,
		Order: c.Order,
	})
	if t.Game.Running {
		t.NotifyAction()
	}

	// Check to see if that was the last card drawn
	if t.Game.DeckIndex >= len(t.Game.Deck) {
		// Mark the turn upon which the table will end
		t.Game.EndTurn = t.Game.Turn + len(t.GameSpec.Players) + 1
		characterAdjustEndTurn(t)
		log.Info(t.GetName() + "Marking to end the table on turn: " + strconv.Itoa(t.Game.EndTurn))
	}
}

func (p *Player) PlayDeck(t *Table) {
	// Make the player draw the final card in the deck
	p.DrawCard(t)

	// Play the card freshly drawn
	c := p.RemoveCard(len(t.Game.Deck)-1, t) // The final card
	c.Slot = -1
	p.PlayCard(t, c)
}

/*
	Subroutines
*/

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card positions in the deck, not in the hand)
func (p *Player) FindCardsTouchedByClue(clue Clue, t *Table) []int {
	list := make([]int, 0)
	for _, c := range p.Hand {
		if variantIsCardTouched(t.GameSpec.Options.Variant, clue, c) {
			list = append(list, c.Order)
		}
	}

	return list
}

func (p *Player) IsFirstCardTouchedByClue(clue Clue, t *Table) bool {
	card := p.Hand[len(p.Hand)-1]
	return variantIsCardTouched(t.GameSpec.Options.Variant, clue, card)
}

func (p *Player) IsLastCardTouchedByClue(clue Clue, t *Table) bool {
	card := p.Hand[0]
	return variantIsCardTouched(t.GameSpec.Options.Variant, clue, card)
}

func (p *Player) InHand(order int) bool {
	for _, c := range p.Hand {
		if c.Order == order {
			return true
		}
	}

	return false
}

func (p *Player) GetCardIndex(order int) int {
	for i, c := range p.Hand {
		if c.Order == order {
			return i
		}
	}

	return -1
}

func (p *Player) GetCardSlot(order int) int {
	// Slot 1 is the newest (left-most) card, which is at index 4 (in a 3 player table)
	for i, c := range p.Hand {
		if c.Order == order {
			return len(p.Hand) - i
		}
	}

	return -1
}

// GetLeftPlayer returns the index of the player that is sitting to this player's left
func (p *Player) GetLeftPlayer(t *Table) int {
	return (p.Index + 1) % len(t.GameSpec.Players)
}

// GetRightPlayer returns the index of the player that is sitting to this player's right
func (p *Player) GetRightPlayer(t *Table) int {
	// In Golang, "%" will give the remainder and not the modulus,
	// so we need to ensure that the result is not negative or we will get a "index out of range" error below
	return (p.Index - 1 + len(t.GameSpec.Players)) % len(t.GameSpec.Players)
}

func (p *Player) ShuffleHand(t *Table) {
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
	t.Game.Actions = append(t.Game.Actions, ActionReorder{
		Type:      "reorder",
		Target:    p.Index,
		HandOrder: handOrder,
	})
	t.NotifyAction()
}
