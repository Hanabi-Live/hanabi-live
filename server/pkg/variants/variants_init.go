package variants

import (
	"encoding/json"
	"io/ioutil"
	"path"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) VariantsInit(dataPath string) {
	// Import the JSON file
	filePath := path.Join(dataPath, "variants.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		m.logger.Fatalf("Failed to read the \"%v\" file: %v", filePath, err)
	} else {
		fileContents = v
	}
	var variantsArray []VariantJSON
	if err := json.Unmarshal(fileContents, &variantsArray); err != nil {
		m.logger.Fatalf("Failed to convert the variants file to JSON: %v", err)
	}

	// Convert the array to a map
	for _, variantJSON := range variantsArray {
		// Validate the name
		if variantJSON.Name == "" {
			m.logger.Fatal("There is a variant with an empty name in the \"variants.json\" file.")
		}

		// Validate the ID
		if variantJSON.ID < 0 { // The first variant has an ID of 0
			m.logger.Fatalf("The variant of \"%v\" has an invalid ID.", variantJSON.Name)
		}

		// Validate that all of the names are unique
		if _, ok := m.Variants[variantJSON.Name]; ok {
			m.logger.Fatalf("There are two variants with the name of: %v", variantJSON.Name)
		}

		// Validate that there is at least one suit
		if len(variantJSON.Suits) < 1 {
			m.logger.Fatalf(
				"The variant of \"%v\" does not have at least one suit.",
				variantJSON.Name,
			)
		}

		// Validate that all of the suits exist and convert suit strings to objects
		variantSuits := make([]*Suit, 0)
		for _, suitName := range variantJSON.Suits {
			if suit, ok := m.Suits[suitName]; !ok {
				m.logger.Fatalf(
					"The suit of \"%v\" in variant \"%v\" does not exist.",
					suitName,
					variantJSON.Name,
				)
			} else {
				variantSuits = append(variantSuits, suit)
			}
		}

		// Derive the card ranks (the ranks that the cards of each suit will be)
		// By default, assume ranks 1 through 5
		variantRanks := []int{1, 2, 3, 4, 5}
		if strings.HasPrefix(variantJSON.Name, "Up or Down") {
			// The "Up or Down" variants have START cards
			// ("startCardRank" is defined in the "variantUpOrDown.go" file)
			variantRanks = append(variantRanks, StartCardRank)
		}

		// Validate or derive the clue colors (the colors available to clue in this variant)
		clueColors := variantJSON.ClueColors
		if clueColors == nil {
			// The clue colors were not specified in the JSON, so derive them from the suits
			derivedClueColors := make([]string, 0)
			for _, suit := range variantSuits {
				if suit.AllClueColors {
					// If a suit is touched by all colors,
					// then we don't want to add every single clue color to the variant clue list
					continue
				}
				for _, color := range suit.ClueColors {
					if !util.StringInSlice(color, derivedClueColors) {
						derivedClueColors = append(derivedClueColors, color)
					}
				}
			}
			clueColors = &derivedClueColors
		} else {
			// The clue colors were specified in the JSON, so validate that they map to colors
			for _, colorName := range *variantJSON.ClueColors {
				if _, ok := m.Colors[colorName]; !ok {
					m.logger.Fatalf(
						"The variant of \"%v\" has a clue color of \"%v\", but that color does not exist.",
						variantJSON.Name,
						colorName,
					)
				}
			}
		}

		// Validate or derive the clue ranks (the ranks available to clue in this variant)
		clueRanks := variantJSON.ClueRanks
		if clueRanks == nil {
			// The clue ranks were not specified in the JSON,
			// so just assume that we can clue ranks 1 through 5
			clueRanks = &[]int{1, 2, 3, 4, 5}
		}

		// The default value of "SpecialRank" is -1, not 0
		specialRank := variantJSON.SpecialRank
		if specialRank == 0 {
			specialRank = -1
		}

		// Convert the JSON variant into a variant object and store it in the map
		variant := &Variant{
			Name:                   variantJSON.Name,
			ID:                     variantJSON.ID,
			Suits:                  variantSuits,
			Ranks:                  variantRanks,
			ClueColors:             *clueColors,
			ClueRanks:              *clueRanks,
			ColorCluesTouchNothing: variantJSON.ColorCluesTouchNothing,
			RankCluesTouchNothing:  variantJSON.RankCluesTouchNothing,
			SpecialRank:            specialRank,
			SpecialAllClueColors:   variantJSON.SpecialAllClueColors,
			SpecialAllClueRanks:    variantJSON.SpecialAllClueRanks,
			SpecialNoClueColors:    variantJSON.SpecialNoClueColors,
			SpecialNoClueRanks:     variantJSON.SpecialNoClueRanks,
			SpecialDeceptive:       variantJSON.SpecialDeceptive,
			MaxScore:               len(variantSuits) * pointsPerStack,
		}
		m.Variants[variant.Name] = variant

		// We store the default variant as a convenience field
		if variant.Name == DefaultVariantName {
			m.NoVariant = variant
		}

		// Validate that all of the ID's are unique
		// And create a reverse mapping of ID to name
		// (so that we can easily find the associated variant from a database entry)
		if _, ok := m.VariantsIDMap[variant.ID]; ok {
			m.logger.Fatalf("There are two variants with the ID of: %v", variant.ID)
		}
		m.VariantsIDMap[variant.ID] = variant

		// Create an array with every variant name
		m.VariantNames = append(m.VariantNames, variant.Name)
	}

	// Validate that there are no skipped ID numbers
	// (commented out for now since we have deleted some variants in the last round of changes)
	for i := 0; i < len(m.VariantNames); i++ {
		if _, ok := m.VariantsIDMap[i]; !ok {
			m.logger.Fatalf(
				"There is no variant with an ID of \"%v\". (Variant IDs must be sequential.)",
				i,
			)
		}
	}

	// Validate that we filled in the default variant convenience field
	if m.NoVariant == nil {
		m.logger.Fatalf("Failed to find the default variant of: %v", DefaultVariantName)
	}
}
