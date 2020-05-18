package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

var (
	suits map[string]*Suit
)

type Suit struct {
	Name         string
	Abbreviation string   `json:"abbreviation"`
	ClueColors   []string `json:"clueColors"`
	OneOfEach    bool     `json:"oneOfEach"`

	AllClueColors bool `json:"allClueColors"`
	AllClueRanks  bool `json:"allClueRanks"`
	NoClueColors  bool `json:"noClueColors"`
	NoClueRanks   bool `json:"noClueRanks"`
}

func suitsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "suits.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	if err := json.Unmarshal(contents, &suits); err != nil {
		logger.Fatal("Failed to convert the suits file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]struct{})
	for name, suit := range suits {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two suits with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = struct{}{}

		// Validate the suit name
		if suit.Name == "" {
			// By default, use the name of the key
			suit.Name = name
		}

		// Validate that there is an abbreviation
		if name != "Unknown" { // The "Unknown" suit is not supposed to have clue colors
			// By default, use the abbreviation of the color with the same name
			if suit.Abbreviation == "" {
				if len(suit.ClueColors) > 0 {
					if color, ok := colors[suit.ClueColors[0]]; ok {
						if color.Abbreviation != "" {
							suit.Abbreviation = color.Abbreviation
						}
					}
				}
			}

			// Otherwise, assume that it is the first letter of the suit
			if suit.Abbreviation == "" {
				suit.Abbreviation = string([]rune(name)[0])
			}
		}

		// Validate the clue colors (the colors that touch this suit)
		if len(suit.ClueColors) > 0 {
			for _, colorName := range suit.ClueColors {
				if _, ok := colors[colorName]; !ok {
					logger.Fatal("The suit of \"" + name + "\" has a clue color of " +
						"\"" + colorName + "\", but that color does not exist.")
					return
				}
			}
		} else if !suit.AllClueColors && !suit.NoClueColors {
			// The clue colors were not specified; by default, use the color of the same name
			if _, ok := colors[name]; ok {
				suit.ClueColors = []string{name}
			} else if name != "Unknown" { // The "Unknown" suit is not supposed to have clue colors
				logger.Fatal("The suit of \"" + name + "\" has no clue colors defined and there " +
					"is no color of the same name.")
				return
			}
		}
	}
}
