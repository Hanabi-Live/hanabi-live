package main

import (
	"math/rand"
	"strconv"
)

const debugCharacter = "Insistent"

type CharacterAssignment struct {
	Name        string
	Description string
	Emoji       string
	Not2P       bool
}

var (
	characterAssignments = []CharacterAssignment{
		// Clue restriction characters
		CharacterAssignment{
			Name:        "Fuming",
			Description: "Can only clue numbers and [random color]",
			Emoji:       "🌋",
		},
		CharacterAssignment{
			Name:        "Dumbfounded",
			Description: "Can only clue colors and [random number]",
			Emoji:       "🤯",
		},
		CharacterAssignment{
			Name:        "Inept",
			Description: "Cannot give any clues that touch [random color] cards",
			Emoji:       "️🤔",
		},
		CharacterAssignment{
			Name:        "Awkward",
			Description: "Cannot give any clues that touch [random number]s",
			Emoji:       "️😬",
		},
		CharacterAssignment{
			Name:        "Conservative",
			Description: "Can only give clues that touch a single card",
			Emoji:       "🕇",
		},
		CharacterAssignment{
			Name:        "Greedy",
			Description: "Can only give clues that touch 2+ cards",
			Emoji:       "🤑",
		},
		CharacterAssignment{
			Name:        "Picky",
			Description: "Can only clue odd numbers or odd colors",
			Emoji:       "🤢",
		},
		CharacterAssignment{
			Name:        "Spiteful",
			Description: "Cannot clue the player to their left",
			Emoji:       "😈",
			Not2P:       true,
		},
		CharacterAssignment{
			Name:        "Insolent",
			Description: "Cannot clue the player to their right",
			Emoji:       "😏",
			Not2P:       true,
		},
		CharacterAssignment{
			Name:        "Vindictive",
			Description: "Must clue if they received a clue since their last turn",
			Emoji:       "🗡️",
		},
		CharacterAssignment{
			Name:        "Miser",
			Description: "Can only clue if there are 4 or more clues available",
			Emoji:       "💰",
		},
		CharacterAssignment{
			Name:        "Compulsive",
			Description: "Can only clue if it touches the newest or oldest card in someone's hand",
			Emoji:       "📺",
		},
		CharacterAssignment{
			Name:        "Mood Swings",
			Description: "Clues given must alternate between color and number",
			Emoji:       "👧",
		},
		CharacterAssignment{
			Name:        "Insistent",
			Description: "Must continue to clue cards until one of them is played or discarded",
			Emoji:       "😣",
		},

		// Clue restriction characters (receiving)
		CharacterAssignment{
			Name:        "Vulnerable",
			Description: "Cannot receive a number 2 or number 5 clue",
			Emoji:       "🛡️",
		},
		CharacterAssignment{
			Name:        "Color-Blind",
			Description: "Cannot receive a color clue",
			Emoji:       "️👓",
		},

		// Play restriction characters
		CharacterAssignment{
			Name:        "Follower",
			Description: "Cannot play a card unless two cards of the same rank have already been played",
			Emoji:       "👁️",
		},
		CharacterAssignment{
			Name:        "Impulsive",
			Description: "Must play slot 1 if it has been clued",
			Emoji:       "️💉",
		},
		CharacterAssignment{
			Name:        "Indolent",
			Description: "Cannot play a card if they played on the last round",
			Emoji:       "️💺",
		},
		CharacterAssignment{
			Name:        "Hesitant",
			Description: "Cannot play cards from slot 1",
			Emoji:       "️️👴🏻",
		},
		CharacterAssignment{
			Name:        "Gambler",
			Description: "Must play if they didn't play last turn; forced misplays do not cost a strike",
			Emoji:       "️🎲",
		},

		// Discard restriction characters
		CharacterAssignment{
			Name:        "Anxious",
			Description: "Cannot discard if there is an even number of clues available (including 0)",
			Emoji:       "😰",
		},
		CharacterAssignment{
			Name:        "Traumatized",
			Description: "Cannot discard if there is an odd number of clues available",
			Emoji:       "😨",
		},
		CharacterAssignment{
			Name:        "Wasteful",
			Description: "Cannot discard if there are 2 or more clues available",
			Emoji:       "🗑️",
		},

		// Extra turn characters
		CharacterAssignment{
			Name:        "Genius",
			Description: "Must clue both a number and a color (uses 2 clues)",
			Emoji:       "🧠",
		},
		CharacterAssignment{
			Name:        "Synesthetic",
			Description: "Must clue both a number and a color of the same value (uses 1 clue)",
			Emoji:       "🎨",
		},
		CharacterAssignment{
			Name:        "Panicky",
			Description: "When discarding, discards twice if 4 clues or less",
			Emoji:       "😳",
		},

		// Other
		CharacterAssignment{
			Name:        "Contrarian",
			Description: "Play order inverts after taking a turn",
			Emoji:       "🙅",
			Not2P:       true,
		},
		CharacterAssignment{
			Name:        "Stubborn",
			Description: "Must perform a different action type than the player that came before them",
			Emoji:       "😠",
		},
		/*
			CharacterAssignment{
				Name:        "Forgetful",
				Description: "Hand is shuffled after discarding (but before drawing)",
				Emoji:       "🔀",
			},
		*/
		CharacterAssignment{
			Name:        "Blind Spot",
			Description: "Cannot see the cards of the player to their left",
			Emoji:       "🚗",
			Not2P:       true,
		},
		CharacterAssignment{
			Name:        "Oblivious",
			Description: "Cannot see the cards of the player to their right",
			Emoji:       "🚂",
			Not2P:       true,
		},
	}
)

func characterGenerate(g *Game) {
	if !g.Options.CharacterAssignments {
		return
	}

	// We don't have to seed the PRNG, since that was done just a moment ago when the deck was shuffled
	for i, p := range g.Players {
		for {
			// Get a random character assignment
			p.CharacterAssignment = rand.Intn(len(characterAssignments))

			// Check to see if any other players have this assignment already
			alreadyAssigned := false
			for j, p2 := range g.Players {
				if i == j {
					break
				}

				if p2.CharacterAssignment == p.CharacterAssignment {
					alreadyAssigned = true
					break
				}
			}
			if alreadyAssigned {
				continue
			}

			// Check to see if this character is restricted from 2-player games
			if characterAssignments[p.CharacterAssignment].Not2P && len(g.Players) == 2 {
				continue
			}

			// Hard-code some character assignments for testing purposes
			if p.Name == "test" {
				for i, ca := range characterAssignments {
					if ca.Name == debugCharacter {
						p.CharacterAssignment = i
						break
					}
				}
			}

			break
		}

		name := characterAssignments[p.CharacterAssignment].Name
		if name == "Fuming" {
			// A random number from 0 to the number of colors in this variant
			p.CharacterMetadata = rand.Intn(len(variants[g.Options.Variant].Clues))
		} else if name == "Dumbfounded" {
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		} else if name == "Inept" {
			// A random number from 0 to the number of suits in this variant
			p.CharacterMetadata = rand.Intn(len(g.Stacks))
		} else if name == "Awkward" {
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		}
	}
}

func characterValidateAction(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Vindictive" &&
		p.CharacterMetadata == 0 &&
		d.Type != actionTypeClue {

		s.Warning("You are " + name + ", so you must give a clue if you have been given a clue on this go-around.")
		return true

	} else if name == "Insistent" &&
		p.CharacterMetadata != -1 &&
		d.Type != actionTypeClue {

		s.Warning("You are " + name + ", so you must continue to clue cards until one of them is played or discarded.")
		return true

	} else if name == "Impulsive" &&
		p.CharacterMetadata == 0 &&
		(d.Type != actionTypePlay ||
			d.Target != p.Hand[len(p.Hand)-1].Order) {

		s.Warning("You are " + name + ", so you must play your slot 1 card after it has been clued.")
		return true

	} else if name == "Stubborn" &&
		d.Type == p.CharacterMetadata {

		s.Warning("You are " + name + ", so you cannot perform the same kind of action that the previous player did.")
		return true

	} else if name == "Indolent" &&
		d.Type == actionTypePlay &&
		p.CharacterMetadata == 0 {

		s.Warning("You are " + name + ", so you cannot play a card if you played one in the last round.")
		return true

	} else if name == "Gambler" &&
		p.CharacterMetadata == 0 &&
		d.Type != actionTypePlay &&
		d.Type != actionTypeDeckPlay {

		s.Warning("You are " + name + ", so you must play a card if you did not play a card on the last round.")
		return true
	}

	return false
}

func characterValidateSecondAction(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	if p.CharacterMetadata == -1 {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Genius" {
		if d.Type != actionTypeClue {
			s.Warning("You are " + name + ", so you must now give your second clue.")
			return true
		}

		if d.Clue.Type != clueTypeColor {
			s.Warning("You are " + name + ", so you must now give a color clue.")
			return true
		}

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + name + ", so you must give the second clue to the same player.")
			return true
		}

	} else if name == "Synesthetic" {
		if d.Type != actionTypeClue {
			s.Warning("You are " + name + ", so you must now give your second clue.")
			return true
		}

		if d.Clue.Type != clueTypeColor {
			s.Warning("You are " + name + ", so you must now give a color clue.")
			return true
		}

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + name + ", so you must give the second clue to the same player.")
			return true
		}

		if d.Clue.Value != p.CharacterMetadata2 {
			s.Warning("You are " + name + ", so you must give the matching color clue.")
			return true
		}

	} else if name == "Panicky" &&
		d.Type != actionTypeDiscard {

		s.Warning("You are " + name + ", so you must discard again since there are 4 or less clues available.")
		return true
	}

	return false
}

// characterCheckClue returns true if the clue cannot be given
func characterCheckClue(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name   // The cluer's character
	p2 := g.Players[d.Target]                                  // The target of the clue
	name2 := characterAssignments[p2.CharacterAssignment].Name // The target character
	if name == "Fuming" &&
		d.Clue.Type == clueTypeColor &&
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + name + ", so you can not give that type of clue.")
		return true

	} else if name == "Dumbfounded" &&
		d.Clue.Type == clueTypeNumber &&
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + name + ", so you can not give that type of clue.")
		return true

	} else if name == "Inept" {
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Suit == p.CharacterMetadata {
				s.Warning("You are " + name + ", so you cannot give clues that touch a specific suit.")
				return true
			}
		}

	} else if name == "Awkward" {
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			if c.Rank == p.CharacterMetadata {
				s.Warning("You are " + name + ", so you cannot give clues that touch cards with a rank of " + strconv.Itoa(p.CharacterMetadata) + ".")
				return true
			}
		}

	} else if name == "Conservative" &&
		len(p2.FindCardsTouchedByClue(d.Clue, g)) != 1 {

		s.Warning("You are " + name + ", so you can only give clues that touch a single card.")
		return true

	} else if name == "Greedy" &&
		len(p2.FindCardsTouchedByClue(d.Clue, g)) < 2 {

		s.Warning("You are " + name + ", so you can only give clues that touch 2+ cards.")
		return true

	} else if name == "Picky" &&
		((d.Clue.Type == clueTypeNumber &&
			d.Clue.Value%2 == 0) ||
			(d.Clue.Type == clueTypeColor &&
				(d.Clue.Value+1)%2 == 0)) {

		s.Warning("You are " + name + ", so you can only clue odd numbers or clues that touch odd amounts of cards.")
		return true

	} else if name == "Spiteful" {
		leftIndex := p.Index + 1
		if leftIndex == len(g.Players) {
			leftIndex = 0
		}
		if d.Target == leftIndex {
			s.Warning("You are " + name + ", so you cannot clue the player to your left.")
			return true
		}

	} else if name == "Insolent" {
		rightIndex := p.Index - 1
		if rightIndex == -1 {
			rightIndex = len(g.Players) - 1
		}
		if d.Target == rightIndex {
			s.Warning("You are " + name + ", so you cannot clue the player to your right.")
			return true
		}

	} else if name == "Miser" &&
		g.Clues < 4 {

		s.Warning("You are " + name + ", so you cannot give a clue unless there are 4 or more clues available.")
		return true

	} else if name == "Compulsive" &&
		!p2.IsFirstCardTouchedByClue(d.Clue, g) &&
		!p2.IsLastCardTouchedByClue(d.Clue, g) {

		s.Warning("You are " + name + ", so you can only give a clue if it touches either the newest or oldest card in a hand.")
		return true

	} else if name == "Mood Swings" &&
		p.CharacterMetadata == d.Clue.Type {

		s.Warning("You are " + name + ", so cannot give the same clue type twice in a row.")
		return true

	} else if name == "Insistent" &&
		p.CharacterMetadata != -1 {

		if d.Target != p.CharacterMetadata {
			s.Warning("You are " + name + ", so you must continue to clue cards until one of them is played or discarded.")
			return true
		}

		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		touchedInsistentCards := false
		log.Debug("INSOLENT # CARDS TOUCHED:", len(cardsTouched))
		for i, order := range cardsTouched {
			c := g.Deck[order]
			if c.InsistentTouched {
				touchedInsistentCards = true
				log.Debug("CLUE TOUCHED INSISTENT CARD IN I:", i)
				break
			}
		}
		if !touchedInsistentCards {
			s.Warning("You are " + name + ", so you must continue to clue cards until one of them is played or discarded.")
			return true
		}

	} else if name == "Genius" &&
		p.CharacterMetadata == -1 {

		if g.Clues < 2 {
			s.Warning("You are " + name + ", so there needs to be at least two clues available for you to give a clue.")
			return true
		}
		if d.Clue.Type != clueTypeNumber {
			s.Warning("You are " + name + ", so you must give a number clue first.")
			return true
		}

	} else if name == "Synesthetic" &&
		p.CharacterMetadata == -1 {

		if d.Clue.Type != clueTypeNumber {
			s.Warning("You are " + name + ", so you must give a number clue first.")
			return true
		}

		clue := Clue{
			Type:  clueTypeColor,
			Value: d.Clue.Value - 1,
		}
		cardsTouched := p2.FindCardsTouchedByClue(clue, g)
		if len(cardsTouched) == 0 {
			s.Warning("You are " + name + ", so both versions of the clue must touch at least 1 card in the hand.")
			return true
		}

	}
	if name2 == "Vulnerable" &&
		d.Clue.Type == clueTypeNumber &&
		(d.Clue.Value == 2 ||
			d.Clue.Value == 5) {

		s.Warning("You cannot give a number 2 or number 5 clue to a " + name + " character.")
		return true

	} else if name2 == "Color-Blind" &&
		d.Clue.Type == clueTypeColor {

		s.Warning("You cannot give a color blue to a " + name + " character.")
		return true
	}

	return false
}

// characterCheckPlay returns true if the card should misplay
func characterCheckPlay(g *Game, p *Player, c *Card) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Follower" {
		// Look through the stacks to see if two cards of this rank have already been played
		numPlayedOfThisRank := 0
		for _, s := range g.Stacks {
			if s >= c.Rank {
				numPlayedOfThisRank++
			}
		}
		if numPlayedOfThisRank < 2 {
			return true
		}

	} else if name == "Hesitant" &&
		c.Slot == 1 {

		return true
	}

	return false
}

// characterCheckDiscard returns true if the player cannot currently discard
func characterCheckDiscard(s *Session, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Anxious" &&
		g.Clues%2 == 0 { // Even amount of clues

		s.Warning("You are " + name + ", so you cannot discard when there is an even number of clues available.")
		return true

	} else if name == "Traumatized" &&
		g.Clues%2 == 1 { // Odd amount of clues

		s.Warning("You are " + name + ", so you cannot discard when there is an odd number of clues available.")
		return true

	} else if name == "Wasteful" &&
		g.Clues >= 2 {

		s.Warning("You are " + name + ", so you cannot discard if there are 2 or more clues available.")
		return true
	}

	return false
}

func characterPostClue(d *CommandData, g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	name := characterAssignments[p.CharacterAssignment].Name // The person giving the clue
	p2 := g.Players[d.Target]                                // The target of the clue
	name2 := characterAssignments[p2.CharacterAssignment].Name

	if name == "Mood Swings" {
		p.CharacterMetadata = d.Clue.Type
	} else if name == "Insistent" {
		// Mark that the cards that they clued must be continue to be clued
		cardsTouched := p2.FindCardsTouchedByClue(d.Clue, g)
		for _, order := range cardsTouched {
			c := g.Deck[order]
			c.InsistentTouched = true
		}
	}

	if name2 == "Vindictive" {
		// Store that they have had at least one clue given to them on this go-around of the table
		p2.CharacterMetadata = 0

	} else if name2 == "Impulsive" &&
		p2.IsFirstCardTouchedByClue(d.Clue, g) {

		// Store that they had their slot 1 card clued
		p2.CharacterMetadata = 0
	}
}

func characterPostRemove(g *Game, p *Player, c *Card) {
	if !g.Options.CharacterAssignments {
		return
	}

	if !c.InsistentTouched {
		return
	}

	for i, c2 := range p.Hand {
		if c2.InsistentTouched {
			c2.InsistentTouched = false
			log.Debug("UNSET INSISTENTTOUCHED ON CARD", i, "OF PLAYER:", p.Name)
		}
	}

	// Find the "Insistent" player and reset their state so that they are not forced to give a clue on their subsequent turn
	for _, p2 := range g.Players {
		if characterAssignments[p2.CharacterAssignment].Name == "Insistent" {
			p2.CharacterMetadata = -1
			log.Debug("AN INSISTENT CARD WAS TOUCHED, RESETTING THE INSISTENT PLAYERS METADATA TO -1")
			// (only one player should be Insistent)
			break
		}
	}
}

func characterPostAction(d *CommandData, g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Clear the counter for characters that have abilities relating to a single go-around of the table
	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Vindictive" {
		p.CharacterMetadata = -1
	} else if name == "Impulsive" {
		p.CharacterMetadata = -1
	} else if name == "Indolent" {
		if d.Type == actionTypePlay {
			p.CharacterMetadata = 0
		} else {
			p.CharacterMetadata = -1
		}
	} else if name == "Gambler" {
		if d.Type == actionTypePlay || d.Type == actionTypeDeckPlay {
			p.CharacterMetadata = -1
		} else {
			p.CharacterMetadata = 0
		}
	} else if name == "Contrarian" {
		g.TurnsInverted = !g.TurnsInverted
	}

	// Store the last action that was performed
	for _, p2 := range g.Players {
		name2 := characterAssignments[p2.CharacterAssignment].Name
		if name2 == "Stubborn" {
			p2.CharacterMetadata = d.Type
		}
	}
}

func characterTakingSecondTurn(d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Genius" &&
		d.Type == actionTypeClue {

		// Must clue both a number and a color (uses 2 clues)
		// The clue target is stored in "p.CharacterMetadata"
		if p.CharacterMetadata == -1 {
			p.CharacterMetadata = d.Target
			return true
		} else {
			p.CharacterMetadata = -1
			return false
		}

	} else if name == "Synesthetic" &&
		d.Type == actionTypeClue {

		// Must clue both a number and a color of the same value (uses 1 clue)
		// The clue target is stored in "p.CharacterMetadata"
		// The value of the clue is stored in "p.CharacterMetadata2"
		if p.CharacterMetadata == -1 {
			p.CharacterMetadata = d.Target
			p.CharacterMetadata2 = d.Clue.Value - 1
			g.Clues++ // The second clue given should not cost a clue
			return true
		} else {
			p.CharacterMetadata = -1
			p.CharacterMetadata2 = -1
			return false
		}

	} else if name == "Panicky" &&
		d.Type == actionTypeDiscard {

		// After discarding, discards again if there are 4 clues or less
		// "p.CharacterMetadata" represents the state, which alternates between -1 and 0
		if p.CharacterMetadata == -1 &&
			g.Clues <= 4 {

			p.CharacterMetadata = 0
			return true

		} else if p.CharacterMetadata == 0 {
			p.CharacterMetadata = -1
			return false
		}
	}

	return false
}

func characterUseStrike(g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return true
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Gambler" &&
		p.CharacterMetadata == 0 {
		return false
	}

	return true
}

func characterShuffle(g *Game, p *Player) {
	if !g.Options.CharacterAssignments {
		return
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Forgetful" {
		p.ShuffleHand(g)
	}
}

func characterHideCard(a *Action, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Blind Spot" {
		leftPlayer := (p.Index + 1) % len(g.Players)
		if a.Who == leftPlayer {
			return true
		}

	} else if name == "Oblivious" {
		// In Golang, "%" will give the remainder and not the modulus,
		// so we need to ensure that the result is not negative or we will get a "index out of range" error below
		playerIndex := p.Index + len(g.Players)
		rightPlayer := (playerIndex - 1) % len(g.Players)
		if a.Who == rightPlayer {
			return true
		}
	}

	return false
}
