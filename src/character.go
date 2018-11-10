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
			Description: "Can only clue [random color]",
		},
		CharacterAssignment{
			Name:        "Dumbfounded",
			Description: "Can only clue [random number]",
		},
		CharacterAssignment{
			Name:        "Eccentric",
			Description: "Can only clue odd numbers or clues that touch odd amounts of cards",
		},
		CharacterAssignment{
			Name:        "Spiteful",
			Description: "Cannot clue the player to their left",
		},
		CharacterAssignment{
			Name:        "Insolent",
			Description: "Cannot clue the player to their right",
		},

		// Play characters
		CharacterAssignment{
			Name:        "Follower",
			Description: "Cannot be the first person to play a card of a certain rank",
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

	} else if name == "Eccentric" &&
		(d.Clue.Value%2 == 1 ||
			len(p.FindCardsTouchedByClue(g, d))%2 == 1) {

		s.Warning("You are " + name + ", so you can only clue odd numbers or clues that touch odd amounts of cards.")
		return true

	} else if name == "Spiteful" &&
		d.Target == (p.Index+1)%len(g.Players) {

		s.Warning("You are " + name + ", so you cannot clue the player to your left.")
		return true

	} else if name == "Insolent" &&
		d.Target == (p.Index+1)%len(g.Players) {

		s.Warning("You are " + name + ", so you cannot clue the player to your right.")
		return true

	}

	return false
}

func characterCheckPlay(s *Session, d *CommandData, g *Game, p *Player) bool {
	if !g.Options.CharacterAssignments {
		return false
	}

	name := characterAssignments[p.CharacterAssignment].Name
	if name == "Follower" {
		// Look through the deck for this card
		var card *Card
		for _, c := range g.Deck {
			if c.Order == d.Target {
				card = c
				break
			}
		}

		// Look through the stacks to see if the rank of this card has been already played
		found := false
		for _, s := range g.Stacks {
			if s >= card.Rank {
				found = true
				break
			}
		}
		if !found {
			s.Warning("You are " + name + ", so you cannot be the first person to play a card of a certain rank.")
			return true
		}
	}

	return false
}

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
