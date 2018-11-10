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
