/*
	Sent when the user makes a new game
	"data" is empty
*/

package main

import (
	"strings"
)

const (
	numRandomWords = 3
)

// Generate a random table name
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
