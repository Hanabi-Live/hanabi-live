package main

import (
	"io/ioutil"
	"path"
	"strings"
)

const (
	NumRandomWords = 3
)

var (
	wordList = make([]string, 0)
)

func wordListInit() {
	wordListPath := path.Join(dataPath, "word_list.txt")
	if v, err := ioutil.ReadFile(wordListPath); err != nil {
		logger.Fatal("Failed to read the \""+wordListPath+"\" file:", err)
		return
	} else {
		wordListString := string(v)
		wordListString = strings.TrimSpace(wordListString)
		wordList = strings.Split(wordListString, "\n")
	}
}

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
	for len(words) < NumRandomWords {
		i := getRandom(0, len(wordList)-1)
		word := wordList[i]

		// We want 3 unique words
		if !stringInSlice(word, words) {
			words = append(words, word)
		}
	}

	return strings.Join(words, " ")
}
