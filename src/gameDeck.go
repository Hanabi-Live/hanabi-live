package main

import (
	"io/ioutil"
	"path"
	"strconv"
	"strings"
)

func (g *Game) InitDeck() {
	// Suits are represented as a slice of integers from 0 to the number of suits - 1
	// (e.g. {0, 1, 2, 3, 4} for a "No Variant" game)
	for suitInt, suitObject := range variants[g.Options.Variant].Suits {
		// Ranks are represented as a slice of integers
		// (e.g. {1, 2, 3, 4, 5} for a "No Variant" game)
		for _, rank := range variants[g.Options.Variant].Ranks {
			// In a normal suit of Hanabi, there are:
			// - three 1's
			// - two 2's
			// - two 3's
			// - two 4's
			// - one five
			var amountToAdd int
			if rank == 1 {
				amountToAdd = 3
				if strings.HasPrefix(g.Options.Variant, "Up or Down") {
					amountToAdd = 1
				}
			} else if rank == 5 {
				amountToAdd = 1
			} else if rank == startCardRank {
				amountToAdd = 1
			} else {
				amountToAdd = 2
			}
			if suitObject.OneOfEach {
				amountToAdd = 1
			}

			for i := 0; i < amountToAdd; i++ {
				// Add the card to the deck
				g.Deck = append(g.Deck, NewCard(g, suitInt, rank))

				// Add the possibility
				mapIndex := suitObject.Name + strconv.Itoa(rank)
				g.PossibleCards[mapIndex]++
			}
		}
	}

	// Copy all of the possibilities into every card
	for _, c := range g.Deck {
		for k, v := range g.PossibleCards {
			c.PossibleCards[k] = v
		}
	}
}

func (g *Game) SetPresetDeck(s *Session) bool {
	filePath := path.Join(projectPath, "specific-deals", g.Seed+".txt")
	logger.Info("Using a preset deal of:", filePath)

	var lines []string
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Error("Failed to read \""+filePath+"\":", err)
		s.Error("Failed to create the game. Please contact an administrator.")
		return true
	} else {
		lines = strings.Split(string(v), "\n")
	}

	for i, line := range lines {
		// The first line is a number that signifies which player will go first
		if i == 0 {
			if v, err := strconv.Atoi(line); err != nil {
				logger.Error("Failed to parse the first line (that signifies which player will go first):", line)
				s.Error("Failed to create the game. Please contact an administrator.")
				return true
			} else {
				// Player 1 would be equal to the player at index 0
				g.ActivePlayer = v - 1
			}
			continue
		}

		// Ignore empty lines (the last line of the file might be empty)
		if line == "" {
			continue
		}

		// Parse the line for the suit and the rank
		match2 := cardRegExp.FindStringSubmatch(line)
		if match2 == nil {
			logger.Error("Failed to parse line "+strconv.Itoa(i+1)+":", line)
			s.Error("Failed to start the game. Please contact an administrator.")
			return true
		}

		// Change the suit of all of the cards in the deck
		suit := match2[1]
		var newSuit int
		if suit == "b" {
			newSuit = 0
		} else if suit == "g" {
			newSuit = 1
		} else if suit == "y" {
			newSuit = 2
		} else if suit == "r" {
			newSuit = 3
		} else if suit == "p" {
			newSuit = 4
		} else if suit == "m" {
			newSuit = 5
		} else {
			logger.Error("Failed to parse the suit on line "+strconv.Itoa(i+1)+":", suit)
			s.Error("Failed to create the game. Please contact an administrator.")
			return true
		}
		g.Deck[i-1].Suit = newSuit
		// (the first line is the number of players, so we have to subtract one)

		// Change the rank of all of the cards in the deck
		rank := match2[2]
		var newRank int
		if v, err := strconv.Atoi(rank); err != nil {
			logger.Error("Failed to parse the rank on line "+strconv.Itoa(i+1)+":", rank)
			s.Error("Failed to create the game. Please contact an administrator.")
			return true
		} else {
			newRank = v
		}
		g.Deck[i-1].Rank = newRank // The first line is the number of players, so we have to subtract one
	}

	return false
}
