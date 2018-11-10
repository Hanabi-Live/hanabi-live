package main

import (
	"hash/crc64"
	"math/rand"
)

type CharacterAssignment struct {
	Name        string
	Description string
}

var (
	characterAssignments = []CharacterAssignment{
		// Clue characters
		CharacterAssignment{
			Name:        "Conservative",
			Description: "Can only give clues that touch a single card",
		},
		CharacterAssignment{
			Name:        "Greedy",
			Description: "Can only give clues that touch 2+ cards",
		},
		CharacterAssignment{
			Name:        "Fuming",
			Description: "Can only clue numbers and [random color]",
		},
		CharacterAssignment{
			Name:        "Dumbfounded",
			Description: "Can only clue colors and [random number]",
		},
		CharacterAssignment{
			Name:        "Picky",
			Description: "Can only clue odd numbers or odd colors",
		},
		CharacterAssignment{
			Name:        "Spiteful",
			Description: "Cannot clue the player to their left",
		},
		CharacterAssignment{
			Name:        "Insolent",
			Description: "Cannot clue the player to their right",
		},
		CharacterAssignment{
			Name:        "Philospher",
			Description: "Can only give empty clues",
		},

		// Play characters
		CharacterAssignment{
			Name:        "Follower",
			Description: "Cannot play a card unless two cards of the same rank have already been played",
		},

		// Discard characters
		CharacterAssignment{
			Name:        "Anxious",
			Description: "Cannot discard if there is an even number of clues available (including 0)",
		},
		CharacterAssignment{
			Name:        "Traumatized",
			Description: "Cannot discard if there is an odd number of clues available",
		},

		// Extra turn characters
		CharacterAssignment{
			Name:        "Genius",
			Description: "Must clue both a number and a color (uses 2 clues)",
		},
		CharacterAssignment{
			Name:        "Synesthetic",
			Description: "Must clue both a number and a color of the same value (uses 1 clue)",
		},
		CharacterAssignment{
			Name:        "Panicky",
			Description: "After discarding, discards again if there are 4 clues or less",
		},
	}
)

func characterGenerate(g *Game) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Seed the PRNG (copied from above)
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(g.Seed), crc64Table)
	rand.Seed(int64(intSeed))

	for i, p := range g.Players {
		for {
			// Get a random character assignment
			p.CharacterAssignment = rand.Intn(len(characterAssignments))

			// Check to see if any other players have this assignment already
			unique := true
			for j, p2 := range g.Players {
				if i == j {
					break
				}

				if p2.CharacterAssignment == p.CharacterAssignment {
					unique = false
					break
				}
			}
			if unique {
				break
			}
		}

		name := characterAssignments[p.CharacterAssignment].Name
		if name == "Fuming" {
			// A random number from 0 to the number of colors in this variant
			p.CharacterMetadata = rand.Intn(len(variants[g.Options.Variant].Clues))
		} else if name == "Dumbfounded" {
			// A random number from 1 to 5
			p.CharacterMetadata = rand.Intn(4) + 1
		}
	}
}

func characterValidateSecondAction(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Genius" &&
		p.CharacterMetadata != -1 &&
		(d.Type != 0 || // Clue
			d.Clue.Type != p.CharacterMetadata) {

		s.Warning("You are " + name + ", so you must give both a number clue and a color clue.")
		return true

	} else if name == "Synesthetic" {
		if p.CharacterMetadata == -1 &&
			d.Type == 0 && // Clue
			d.Clue.Type != 0 { // Number clue

			s.Warning("You are " + name + ", so you must give a number clue first.")
			return true

		} else if p.CharacterMetadata != -1 &&
			(d.Type != 0 || // Clue
				d.Clue.Value != p.CharacterMetadata) {

			s.Warning("You are " + name + ", so you must give the matching color clue.")
			return true
		}

	} else if name == "Panicky" &&
		p.CharacterMetadata != -1 &&
		d.Type != 2 { // Discard

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

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Conservative" &&
		len(p.FindCardsTouchedByClue(g, d)) != 1 {

		s.Warning("You are " + name + ", so you can only give clues that touch a single card.")
		return true

	} else if name == "Greedy" &&
		len(p.FindCardsTouchedByClue(g, d)) < 2 {

		s.Warning("You are " + name + ", so you can only give clues that touch 2+ cards.")
		return true

	} else if name == "Fuming" &&
		d.Clue.Type == 1 && // Color clue
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + name + ", so you can not give that type of clue.")
		return true

	} else if name == "Dumbfounded" &&
		d.Clue.Type == 0 && // Number clue
		d.Clue.Value != p.CharacterMetadata {

		s.Warning("You are " + name + ", so you can not give that type of clue.")
		return true

	} else if name == "Picky" &&
		d.Clue.Value%2 == 1 {

		s.Warning("You are " + name + ", so you can only clue odd numbers or clues that touch odd amounts of cards.")
		return true

	} else if name == "Spiteful" &&
		d.Target == (p.Index+1)%len(g.Players) {

		s.Warning("You are " + name + ", so you cannot clue the player to your left.")
		return true

	} else if name == "Insolent" &&
		d.Target == (p.Index-1)%len(g.Players) {

		s.Warning("You are " + name + ", so you cannot clue the player to your right.")
		return true

	} else if name == "Insolent" &&
		len(p.FindCardsTouchedByClue(g, d)) != 0 {

		s.Warning("You are " + name + ", so you can only give empty clues.")
		return true
	} else if name == "Genius" &&
		p.CharacterMetadata == -1 &&
		g.Clues < 2 {

		s.Warning("You are " + name + ", so there needs to be at least two clues available for you to give a clue.")
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
	}

	return false
}

func characterTakingSecondTurn(d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Genius" &&
		d.Type == 0 { // Clue

		// Must clue both a number and a color
		// "p.CharacterMetadata" represents the state, which alternates between -1 and 0/1
		// (depending on whether we need to give a color or number clue)
		if p.CharacterMetadata == -1 {
			if d.Clue.Type == 0 {
				p.CharacterMetadata = 1
			} else if d.Clue.Type == 1 {
				p.CharacterMetadata = 0
			}
			return true
		} else {
			p.CharacterMetadata = -1
			return false
		}

	} else if name == "Synesthetic" &&
		d.Type == 0 { // Clue

		// Must clue both a number and a color of the same value
		// "p.CharacterMetadata" represents the state, which alternates between -1 and X
		// (depending on the value of the clue given)
		if p.CharacterMetadata == -1 {
			p.CharacterMetadata = d.Clue.Value - 1
			return true
		} else {
			p.CharacterMetadata = -1
			return false
		}
	} else if name == "Panicky" &&
		d.Type == 2 { // Discard

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
