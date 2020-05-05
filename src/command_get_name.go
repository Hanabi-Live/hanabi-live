package main

import (
	"strings"
)

const (
	numRandomWords = 3
)

// commandGetName is sent when the user makes a new game
// It generate a new random table name for them
//
// Has no data
func commandGetName(s *Session, d *CommandData) {
	type NameMessage struct {
		Name string `json:"name"`
	}
	s.Emit("name", &NameMessage{
		Name: getName(),
	})
}

func getName() string {
	words := make([]string, 0)
	for len(words) < numRandomWords {
		i := getRandom(0, len(wordList)-1)
		word := wordList[i]

		// We want 3 unique words
		if !stringInSlice(word, words) {
			words = append(words, word)
		}
	}

	return strings.Join(words, " ")
}
