package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

var (
	suits map[string]*Suit
)

func suitsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "suits.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		fileContents = v
	}
	var suitsArray []*Suit
	if err := json.Unmarshal(fileContents, &suitsArray); err != nil {
		logger.Fatal("Failed to convert the suits file from JSON:", err)
		return
	}

	// Convert the array to a map
	suits = make(map[string]*Suit)
	for _, suit := range suitsArray {
		// Validate the suit name
		if suit.Name == "" {
			logger.Fatal("There is a suit with an empty name in the \"suits.json\" file.")
			return
		}

		// Validate that all of the names are unique
		if _, ok := suits[suit.Name]; ok {
			logger.Fatal("There are two suits with the name of \"" + suit.Name + "\".")
			return
		}

		// Validate that there is an abbreviation
		// If it is not specified, use the abbreviation of the color with the same name
		// Otherwise, assume that it is the first letter of the suit
		if suit.Abbreviation == "" {
			if len(suit.ClueColors) > 0 {
				if color, ok := colors[suit.ClueColors[0]]; ok {
					if color.Abbreviation != "" {
						suit.Abbreviation = color.Abbreviation
					}
				}
			}
		}
		if suit.Abbreviation == "" {
			suit.Abbreviation = string([]rune(suit.Name)[0])
		}
		if len(suit.Abbreviation) != 1 {
			logger.Fatal("The \"" + suit.Name + "\" suit has an abbreviation that is not one letter long.")
			return
		}

		// Validate the clue colors (the colors that touch this suit)
		if len(suit.ClueColors) > 0 {
			for _, colorName := range suit.ClueColors {
				if _, ok := colors[colorName]; !ok {
					logger.Fatal("The suit of \"" + suit.Name + "\" has a clue color of " +
						"\"" + colorName + "\", but that color does not exist.")
					return
				}
			}
		} else if !suit.AllClueColors && !suit.NoClueColors {
			// The clue colors were not specified; by default, use the color of the same name
			if _, ok := colors[suit.Name]; ok {
				suit.ClueColors = []string{suit.Name}
			} else if suit.Name != "Unknown" { // The "Unknown" suit is not supposed to have clue colors
				logger.Fatal("The suit of \"" + suit.Name + "\" " +
					"has no clue colors defined and there is no color of the same name.")
				return
			}
		}

		// Validate the pip
		if suit.Pip == "" && suit.Name != "Unknown" {
			logger.Fatal("The suit of \"" + suit.Name + "\" does not have a pip specified.")
			return
		}

		// Add it to the map
		suits[suit.Name] = suit
	}

	// For every suit, add a reversed version of that suit
	for name, suit := range suits {
		// In Go, this dereference assignment is a shallow copy
		suitReversed := *suit
		suitReversed.Reversed = true
		suits[name+SuitReversedSuffix] = &suitReversed
	}
}
