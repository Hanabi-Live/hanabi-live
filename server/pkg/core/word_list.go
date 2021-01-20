package core

import (
	"io/ioutil"
	"path"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

const (
	numRandomWords = 3
)

func (m *Manager) wordListInit(dataPath string) {
	wordListPath := path.Join(dataPath, "word_list.txt")

	var wordListString string
	if v, err := ioutil.ReadFile(wordListPath); err != nil {
		m.logger.Fatalf("Failed to read the \"%v\" file: %v", wordListPath, err)
	} else {
		wordListString = string(v)
	}

	wordListString = strings.TrimSpace(wordListString)
	m.wordList = strings.Split(wordListString, "\n")
}

func (m *Manager) GetRandomTableName() string {
	words := make([]string, 0)
	for len(words) < numRandomWords {
		i := util.GetRandom(0, len(m.wordList)-1)
		word := m.wordList[i]

		// We want 3 unique words
		if !util.StringInSlice(word, words) {
			words = append(words, word)
		}
	}

	return strings.Join(words, " ")
}
