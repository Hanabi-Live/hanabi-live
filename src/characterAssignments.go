package main

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
	}
)

func characterAssignmentsValidate(s *Session, d *CommandData, g *Game, p *Player) bool {
	if characterAssignments[p.CharacterAssignment].Name == "Compulsive" &&
		d.Type == 2 && // Discard
		g.Clues%2 == 0 { // Even amount of clues

		s.Warning("You are Compulsive, so you cannot discard wen there is an even number of clues available.")
		return true
	}

	return false
}
