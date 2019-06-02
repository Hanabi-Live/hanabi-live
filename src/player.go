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

func (p *Player) InitTime(g *Game) {
	// In non-timed games, start each player with 0 "time left"
	// It will decrement into negative numbers to show how much time they are taking
	p.Time = time.Duration(0)
	if g.Options.Timed {
		p.Time = time.Duration(g.Options.BaseTime) * time.Second
	}
}

/*
	Main functions, relating to in-game actions
*/

// GiveClue returns false if the clue is illegal
func (p *Player) GiveClue(d *CommandData, g *Game) {
	p2 := g.Players[d.Target] // The target of the clue
	cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)

	// Mark that the cards have been touched
	for _, order := range cardsTouched {
		c := g.Deck[order]
		c.Touched = true
	}

	// Keep track that someone clued (i.e. doing 1 clue costs 1 "Clue Token")
	g.Clues--
	if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
		// In the "Clue Starved" variants, you only get 0.5 clues per discard
		// This is represented on the server by having each clue take two clues
		// On the client, clues are shown to the user to be divided by two
		g.Clues--
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
	g.NotifyAction()

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
		strings.HasPrefix(g.Options.Variant, "Duck") {

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
			} else if d.Clue.Type == clueTypeColor {
				text += "moos"
			}
		} else if strings.HasPrefix(g.Options.Variant, "Duck") {
			text += "quacks"
		}
		text += " at " + p2.Name + "'"
		if !strings.HasSuffix(p2.Name, "s") {
			text += "s"
		}
		text += " slot " + strings.Join(slots, "/")

		// Also play a custom sound effect
		if strings.HasPrefix(g.Options.Variant, "Duck") {
			g.Sound = "quack"
		}
	}

	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	g.NotifyAction()
	log.Info(g.GetName() + text)

	// Do post-clue tasks
	characterPostClue(d, g, p)
}

func (p *Player) RemoveCard(target int, g *Game) *Card {
	// Get the target card
	i := p.GetCardIndex(target)
	c := p.Hand[i]

	// Mark what the "slot" number is
	// e.g. slot 1 is the newest (left-most) card, which is index 5 (in a 3 player game)
	c.Slot = p.GetCardSlot(target)

	// Remove it from the hand
	p.Hand = append(p.Hand[:i], p.Hand[i+1:]...)

	characterPostRemove(g, p, c)

	return c
}

// PlayCard returns true if it is a "double discard" situation
// (which can only occur if the card fails to play)
func (p *Player) PlayCard(g *Game, c *Card) bool {
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

		// Mark that the blind-play streak has ended
		g.BlindPlays = 0

		// Increase the misplay streak
		g.Misplays++
		if g.Misplays > 2 {
			// There is no sound effect for more than 2 misplays in a row
			g.Misplays = 2
		}
		g.Sound = "fail" + strconv.Itoa(g.Misplays)

		// Send the "notify" message about the strike
		g.Actions = append(g.Actions, ActionStrike{
			Type:  "strike",
			Num:   g.Strikes,
			Turn:  g.Turn,
			Order: c.Order,
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
	g.NotifyAction()

	// Send the "message" about the play
	text := p.Name + " plays " + c.Name(g) + " from "
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

		// The extra clue is wasted if the team is at the maximum amount of clues already
		clueLimit := maxClues
		if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
			clueLimit *= 2
		}
		if g.Clues > clueLimit {
			g.Clues = clueLimit
		}
	}

	// Update the progress
	progress := float64(g.Score) / float64(g.MaxScore) * 100 // In percent
	g.Progress = int(math.Round(progress))                   // Round it to the nearest integer

	// In some variants, playing a card has the potential to reduce the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore

		// Play a sad sound
		g.Sound = "sad"
	}

	// This is not a "double discard" situation, since the card successfully played
	return false
}

// DiscardCard returns true if it is a "double discard" situation
func (p *Player) DiscardCard(g *Game, c *Card) bool {
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
	g.NotifyAction()

	text := p.Name + " "
	if c.Failed {
		text += "fails to play"
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

	// This could have been a discard (or misplay) or a card needed to get the maximum score
	newMaxScore := g.GetMaxScore()
	if newMaxScore < g.MaxScore {
		// Decrease the maximum score possible for this game
		g.MaxScore = newMaxScore

		// Play a sad sound
		// (don't play the custom sound on a misplay,
		// since the misplay sound will already indicate that an error has occurred)
		if !c.Failed {
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

	// Check to see if that was the last card drawn
	if g.DeckIndex >= len(g.Deck) {
		// Mark the turn upon which the game will end
		g.EndTurn = g.Turn + len(g.Players) + 1
		characterAdjustEndTurn(g)
		log.Info(g.GetName() + "Marking to end the game on turn: " + strconv.Itoa(g.EndTurn))
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

/*
	Subroutines
*/

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card positions in the deck, not in the hand)
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
	// Slot 1 is the newest (left-most) card, which is at index 4 (in a 3 player game)
	for i, c := range p.Hand {
		if c.Order == order {
			return len(p.Hand) - i
		}
	}

	return -1
}

// GetLeftPlayer returns the index of the player that is sitting to this player's left
func (p *Player) GetLeftPlayer(g *Game) int {
	return (p.Index + 1) % len(g.Players)
}

// GetRightPlayer returns the index of the player that is sitting to this player's right
func (p *Player) GetRightPlayer(g *Game) int {
	// In Golang, "%" will give the remainder and not the modulus,
	// so we need to ensure that the result is not negative or we will get a "index out of range" error below
	return (p.Index - 1 + len(g.Players)) % len(g.Players)
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
