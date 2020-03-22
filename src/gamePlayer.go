package main

import (
	"math"
	"math/rand"
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

/*
	Main functions, relating to in-game actions
*/

// GiveClue returns false if the clue is illegal
func (p *GamePlayer) GiveClue(d *CommandData, g *Game) {
	t := g.Table

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

		if d.Clue.Type == clueTypeRank {
			clueRank := d.Clue.Value
			for i := len(c.PossibleRanks) - 1; i >= 0; i-- {
				rank := c.PossibleRanks[i]
				if !(rank == clueRank == positive) {
					c.PossibleRanks = append(c.PossibleRanks[:i], c.PossibleRanks[i+1:]...)

					for _, suit := range variants[g.Options.Variant].Suits {
						c.RemovePossibility(suit, rank, true)
					}
				}
			}
		} else if d.Clue.Type == clueTypeColor {
			clueSuit := variants[g.Options.Variant].Suits[d.Clue.Value]
			for i := len(c.PossibleSuits) - 1; i >= 0; i-- {
				suit := c.PossibleSuits[i]
				if !(suit == clueSuit == positive) {
					c.PossibleSuits = append(c.PossibleSuits[:i], c.PossibleSuits[i+1:]...)

					for _, rank := range variants[g.Options.Variant].Ranks {
						c.RemovePossibility(suit, rank, true)
					}
				}
			}
		}

		if len(c.PossibleSuits) == 1 && len(c.PossibleRanks) == 1 {
			c.Revealed = true
		}
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
				g.Sound = "oink"
			} else if d.Clue.Type == clueTypeColor {
				text += "moos"
				g.Sound = "moo"
			}
		} else if strings.HasPrefix(g.Options.Variant, "Duck") {
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
}

func (p *GamePlayer) RemoveCard(target int, g *Game) *Card {
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
func (p *GamePlayer) PlayCard(g *Game, c *Card) bool {
	t := g.Table

	// Check to see if revealing this card would surprise the player
	// (we want to have it at the beginning of the function so that the fail sound will overwrite
	// the surprise sound)
	p.CheckSurprise(g, c)

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
		extraClue = (c.Rank == 5 || c.Rank == 1) && g.StackDirections[c.Suit] == stackDirectionFinished
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
	progress := float64(g.Score) / float64(g.MaxScore) * 100 // In percent
	t.Progress = int(math.Round(progress))                   // Round it to the nearest integer

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
func (p *GamePlayer) DiscardCard(g *Game, c *Card) bool {
	t := g.Table

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
	p.CheckSurprise(g, c)

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

func (p *GamePlayer) DrawCard(g *Game) {
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

func (p *GamePlayer) PlayDeck(g *Game) {
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

// GetChopIndex gets the index of the oldest (right-most) unclued card
// (used for the "Card Cycling" feature)
func (p *GamePlayer) GetChopIndex() int {
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

func (p *GamePlayer) InitTime(options *Options) {
	if options.Timed {
		p.Time = time.Duration(options.BaseTime) * time.Second
	} else {
		// In non-timed games, start each player with 0 "time left"
		// It will decrement into negative numbers to show how much time they are taking
		p.Time = time.Duration(0)
	}
}

// FindCardsTouchedByClue returns a slice of card orders
// (in this context, "orders" are the card positions in the deck, not in the hand)
func (p *GamePlayer) FindCardsTouchedByClue(clue Clue, g *Game) []int {
	list := make([]int, 0)
	for _, c := range p.Hand {
		if variantIsCardTouched(g.Options.Variant, clue, c) {
			list = append(list, c.Order)
		}
	}

	return list
}

func (p *GamePlayer) IsFirstCardTouchedByClue(clue Clue, g *Game) bool {
	card := p.Hand[len(p.Hand)-1]
	return variantIsCardTouched(g.Options.Variant, clue, card)
}

func (p *GamePlayer) IsLastCardTouchedByClue(clue Clue, g *Game) bool {
	card := p.Hand[0]
	return variantIsCardTouched(g.Options.Variant, clue, card)
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
	// Slot 1 is the newest (left-most) card, which is at index 4 (in a 3 player game)
	for i, c := range p.Hand {
		if c.Order == order {
			return len(p.Hand) - i
		}
	}

	return -1
}

// GetLeftPlayer returns the index of the player that is sitting to this player's left
func (p *GamePlayer) GetLeftPlayer(g *Game) int {
	return (p.Index + 1) % len(g.Players)
}

// GetRightPlayer returns the index of the player that is sitting to this player's right
func (p *GamePlayer) GetRightPlayer(g *Game) int {
	// In Golang, "%" will give the remainder and not the modulus, so we need to ensure that the
	// result is not negative or we will get a "index out of range" error
	return (p.Index - 1 + len(g.Players)) % len(g.Players)
}

// CheckSurprise checks to see if a player has a "wrong" note on a card that
// they just played or discarded
// This code mirrors the "morph()" client-side function
func (p *GamePlayer) CheckSurprise(g *Game, c *Card) {
	// Disable the surprise sound in certain variants
	if strings.HasPrefix(g.Options.Variant, "Throw It in a Hole") {
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

		for _, suit := range variants[g.Options.Variant].Suits {
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
		suit := variants[g.Options.Variant].Suits[c.Suit] // Convert the suit int to a Suit pointer
		if noteSuit.Name != suit.Name || noteRank != c.Rank {
			p.Surprised = true
			return
		}
	}
}

func (p *GamePlayer) ShuffleHand(g *Game) {
	t := g.Table

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
	t.NotifyAction()
}
