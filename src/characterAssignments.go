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
		CharacterAssignment{
			Name:        "Compulsive",
			Description: "Cannot discard if there is an even number of clues available (including 0)",
		},
		CharacterAssignment{
			Name:        "Eccentric",
			Description: "Can only give clues that touch a single card",
		},
		CharacterAssignment{
			Name:        "Greedy",
			Description: "Can only give clues that touch 2+ cards",
		},
		CharacterAssignment{
			Name:        "Fuming",
			Description: "Cannot clue [random color]",
		},
		CharacterAssignment{
			Name:        "Dumbfounded",
			Description: "Cannot clue [random number]",
		},
	}
)

func characterAssignmentsGenerate(g *Game) {
	if !g.Options.CharacterAssignments {
		return
	}

	// Seed the PRNG (copied from above)
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(g.Seed), crc64Table)
	rand.Seed(int64(intSeed))

	for _, p := range g.Players {
		p.CharacterAssignment = rand.Intn(len(characterAssignments))
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

func checkCompulsive(s *Session, g *Game, p *Player) bool {
	if g.Options.CharacterAssignments &&
		characterAssignments[p.CharacterAssignment].Name == "Compulsive" &&
		g.Clues%2 == 0 { // Even amount of clues

		s.Warning("You are Compulsive, so you cannot discard when there is an even number of clues available.")
		return true
	}

	return false
}

func checkEccentric(s *Session, d *CommandData, g *Game, p *Player) bool {
	if g.Options.CharacterAssignments &&
		characterAssignments[p.CharacterAssignment].Name == "Eccentric" &&
		len(p.FindCardsTouchedByClue(g, d)) != 1 {

		s.Warning("You are Eccentric, so you can only give clues that touch a single card.")
		return true
	}

	return false
}

func checkGreedy(s *Session, d *CommandData, g *Game, p *Player) bool {
	if g.Options.CharacterAssignments &&
		characterAssignments[p.CharacterAssignment].Name == "Greedy" &&
		len(p.FindCardsTouchedByClue(g, d)) < 2 {

		s.Warning("You are Greedy, so you can only give clues that touch 2+ cards.")
		return true
	}

	return false
}

func checkFuming(s *Session, d *CommandData, g *Game, p *Player) bool {
	if g.Options.CharacterAssignments &&
		characterAssignments[p.CharacterAssignment].Name == "Fuming" &&
		d.Clue.Value == p.CharacterMetadata {

		s.Warning("You are Fuming, so you can not give that type of clue.")
		return true
	}

	return false
}

func checkDumbfounded(s *Session, d *CommandData, g *Game, p *Player) bool {
	if g.Options.CharacterAssignments &&
		characterAssignments[p.CharacterAssignment].Name == "Dumbfounded" &&
		d.Clue.Value == p.CharacterMetadata {

		s.Warning("You are Dumbfounded, so you can not give that type of clue.")
		return true
	}

	return false
}
