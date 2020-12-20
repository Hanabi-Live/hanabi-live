package variants

import (
	"encoding/json"
	"io/ioutil"
	"path"
)

func (m *Manager) SuitsInit(dataPath string) {
	// Import the JSON file
	filePath := path.Join(dataPath, "suits.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		m.logger.Fatalf("Failed to read the \"%v\" file: %v", filePath, err)
	} else {
		fileContents = v
	}
	var suitsArray []*Suit
	if err := json.Unmarshal(fileContents, &suitsArray); err != nil {
		m.logger.Fatalf("Failed to convert the suits file from JSON: %v", err)
	}

	// Convert the array to a map
	for _, suit := range suitsArray {
		// Validate the suit name
		if suit.Name == "" {
			m.logger.Fatal("There is a suit with an empty name in the \"suits.json\" file.")
		}

		// Validate that all of the names are unique
		if _, ok := m.suits[suit.Name]; ok {
			m.logger.Fatalf("There are two suits with the name of: %v", suit.Name)
		}

		// Validate that there is an abbreviation
		// If it is not specified, use the abbreviation of the color with the same name
		// Otherwise, assume that it is the first letter of the suit
		if suit.Abbreviation == "" && len(suit.ClueColors) > 0 {
			if color, ok := m.colors[suit.ClueColors[0]]; ok {
				if color.Abbreviation != "" {
					suit.Abbreviation = color.Abbreviation
				}
			}
		}
		if suit.Abbreviation == "" {
			suit.Abbreviation = string([]rune(suit.Name)[0])
		}
		if len(suit.Abbreviation) != 1 {
			m.logger.Fatalf(
				"The \"%v\" suit has an abbreviation that is not one letter long.",
				suit.Name,
			)
		}

		// Validate the clue colors (the colors that touch this suit)
		if len(suit.ClueColors) > 0 {
			for _, colorName := range suit.ClueColors {
				if _, ok := m.colors[colorName]; !ok {
					m.logger.Fatalf(
						"The suit of \"%v\" has a clue color of \"%v\", but that color does not exist.",
						suit.Name,
						colorName,
					)
				}
			}
		} else if !suit.AllClueColors && !suit.NoClueColors && !suit.Prism {
			// The clue colors were not specified; by default, use the color of the same name
			if _, ok := m.colors[suit.Name]; ok {
				suit.ClueColors = []string{suit.Name}
			} else if suit.Name != "Unknown" { // The "Unknown" suit is not supposed to have clue colors
				m.logger.Fatalf(
					"The suit of \"%v\" has no clue colors defined and there is no color of the same name.",
					suit.Name,
				)
			}
		}

		// Validate the pip
		if suit.Pip == "" && suit.Name != "Unknown" {
			m.logger.Fatalf("The suit of \"%v\" does not have a pip specified.", suit.Name)
		}

		// Add it to the map
		m.suits[suit.Name] = suit
	}

	// For every suit, add a reversed version of that suit
	for name, suit := range m.suits {
		// In Go, this dereference assignment is a shallow copy
		suitReversed := *suit
		suitReversed.Reversed = true
		m.suits[name+suitReversedSuffix] = &suitReversed
	}
}
