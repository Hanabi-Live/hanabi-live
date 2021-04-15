package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
	"strconv"
	"strings"
)

var (
	variants     map[string]*Variant
	variantIDMap map[int]string
	variantNames []string
)

// VariantJSON is very similar to Variant,
// but the latter is comprised of some more complicated objects
type VariantJSON struct {
	Name  string   `json:"name"`
	ID    int      `json:"id"`
	Suits []string `json:"suits"`
	// ClueColors and ClueRanks are optional elements
	// Thus, they must be pointers so that we can tell if the values were specified or not
	ClueColors             *[]string `json:"clueColors"`
	ClueRanks              *[]int    `json:"clueRanks"`
	ColorCluesTouchNothing bool      `json:"colorCluesTouchNothing"`
	RankCluesTouchNothing  bool      `json:"rankCluesTouchNothing"`
	SpecialRank            int       `json:"specialRank"` // For e.g. Rainbow-Ones
	SpecialAllClueColors   bool      `json:"specialAllClueColors"`
	SpecialAllClueRanks    bool      `json:"specialAllClueRanks"`
	SpecialNoClueColors    bool      `json:"specialNoClueColors"`
	SpecialNoClueRanks     bool      `json:"specialNoClueRanks"`
	SpecialDeceptive       bool      `json:"specialDeceptive"`
}

func variantsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "variants.json")
	var fileContents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \"" + filePath + "\" file: " + err.Error())
		return
	} else {
		fileContents = v
	}
	var variantsArray []VariantJSON
	if err := json.Unmarshal(fileContents, &variantsArray); err != nil {
		logger.Fatal("Failed to convert the variants file to JSON: " + err.Error())
		return
	}

	// Convert the array to a map
	variants = make(map[string]*Variant)
	variantIDMap = make(map[int]string)
	variantNames = make([]string, 0)
	for _, variant := range variantsArray {
		// Validate the name
		if variant.Name == "" {
			logger.Fatal("There is a variant with an empty name in the \"variants.json\" file.")
		}

		// Validate the ID
		if variant.ID < 0 { // The first variant has an ID of 0
			logger.Fatal("The \"" + variant.Name + "\" variant has an invalid ID.")
		}

		// Validate that all of the names are unique
		if _, ok := variants[variant.Name]; ok {
			logger.Fatal("There are two variants with the name of \"" + variant.Name + "\".")
			return
		}

		// Validate that there is at least one suit
		if len(variant.Suits) < 1 {
			logger.Fatal("The variant of \"" + variant.Name + "\" does not have at least one suit.")
			return
		}

		// Validate that all of the suits exist and convert suit strings to objects
		variantSuits := make([]*Suit, 0)
		for _, suitName := range variant.Suits {
			if suit, ok := suits[suitName]; !ok {
				logger.Fatal("The suit of \"" + suitName + "\" " +
					"in variant \"" + variant.Name + "\" does not exist.")
				return
			} else {
				variantSuits = append(variantSuits, suit)
			}
		}

		// Derive the card ranks (the ranks that the cards of each suit will be)
		// By default, assume ranks 1 through 5
		variantRanks := []int{1, 2, 3, 4, 5}
		if strings.HasPrefix(variant.Name, "Up or Down") {
			// The "Up or Down" variants have START cards
			// ("startCardRank" is defined in the "variantUpOrDown.go" file)
			variantRanks = append(variantRanks, StartCardRank)
		}

		// Validate or derive the clue colors (the colors available to clue in this variant)
		clueColors := variant.ClueColors
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
					if !stringInSlice(color, derivedClueColors) {
						derivedClueColors = append(derivedClueColors, color)
					}
				}
			}
			clueColors = &derivedClueColors
		} else {
			// The clue colors were specified in the JSON, so validate that they map to colors
			for _, colorName := range *variant.ClueColors {
				if _, ok := colors[colorName]; !ok {
					logger.Fatal("The variant of \"" + variant.Name + "\" has a clue color of " +
						"\"" + colorName + "\", but that color does not exist.")
					return
				}
			}
		}

		// Validate or derive the clue ranks (the ranks available to clue in this variant)
		clueRanks := variant.ClueRanks
		if clueRanks == nil {
			// The clue ranks were not specified in the JSON,
			// so just assume that we can clue ranks 1 through 5
			clueRanks = &[]int{1, 2, 3, 4, 5}
		}

		// The default value of "SpecialRank" is -1, not 0
		specialRank := variant.SpecialRank
		if specialRank == 0 {
			specialRank = -1
		}

		// Convert the JSON variant into a variant object and store it in the map
		variants[variant.Name] = &Variant{
			Name:                   variant.Name,
			ID:                     variant.ID,
			Suits:                  variantSuits,
			Ranks:                  variantRanks,
			ClueColors:             *clueColors,
			ClueRanks:              *clueRanks,
			ColorCluesTouchNothing: variant.ColorCluesTouchNothing,
			RankCluesTouchNothing:  variant.RankCluesTouchNothing,
			SpecialRank:            specialRank,
			SpecialAllClueColors:   variant.SpecialAllClueColors,
			SpecialAllClueRanks:    variant.SpecialAllClueRanks,
			SpecialNoClueColors:    variant.SpecialNoClueColors,
			SpecialNoClueRanks:     variant.SpecialNoClueRanks,
			SpecialDeceptive:       variant.SpecialDeceptive,
			MaxScore:               len(variantSuits) * 5,
			// (we assume that there are 5 points per stack)
		}

		// Validate that all of the ID's are unique
		// And create a reverse mapping of ID to name
		// (so that we can easily find the associated variant from a database entry)
		if _, ok := variantIDMap[variant.ID]; ok {
			logger.Fatal("There are two variants with the ID of " +
				"\"" + strconv.Itoa(variant.ID) + "\".")
			return
		}
		variantIDMap[variant.ID] = variant.Name

		// Create an array with every variant name
		variantNames = append(variantNames, variant.Name)
	}

	// Validate that there are no skipped ID numbers
	// (commented out for now since we have deleted some variants in the last round of changes)
	/*
		for i := 0; i < len(variantNames); i++ {
			if _, ok := variantIDMap[i]; !ok {
				logger.Fatal("There is no variant with an ID of \"" + strconv.Itoa(i) + "\". " +
					"(Variant IDs must be sequential.)")
				return
			}
		}
	*/
}

// variantIsCardTouched returns true if a clue will touch a particular suit
// For example, a yellow clue will not touch a green card in a normal game,
// but it will the "Dual-Color" variant
// This mirrors the function "touchesCard()" in "clues.ts"
func variantIsCardTouched(variantName string, clue Clue, card *Card) bool {
	variant := variants[variantName]
	suit := variant.Suits[card.SuitIndex]

	if clue.Type == ClueTypeColor {
		clueColorName := variant.ClueColors[clue.Value]

		if variant.IsSynesthesia() && !suit.NoClueRanks {
			// In addition to any other matching, match color based on rank.
			prismColorIndex := (card.Rank - 1) % len(variant.ClueColors)
			prismColorName := variant.ClueColors[prismColorIndex]
			if clueColorName == prismColorName {
				return true
			}
		}

		if variant.ColorCluesTouchNothing {
			return false
		}

		if suit.AllClueColors {
			return true
		}
		if suit.NoClueColors {
			return false
		}

		if variant.SpecialRank == card.Rank {
			if variant.SpecialAllClueColors {
				return true
			}
			if variant.SpecialNoClueColors {
				return false
			}
		}

		if suit.Prism {
			// The color that touches a prism card is contingent upon the card's rank
			prismColorIndex := (card.Rank - 1) % len(variant.ClueColors)
			if card.Rank == StartCardRank {
				// "START" cards count as rank 0, so they are touched by the final color
				prismColorIndex = len(variant.ClueColors) - 1
			}
			prismColorName := variant.ClueColors[prismColorIndex]
			return clueColorName == prismColorName
		}

		return stringInSlice(clueColorName, suit.ClueColors)
	}

	if clue.Type == ClueTypeRank {
		if variant.RankCluesTouchNothing {
			return false
		}

		if variant.Suits[card.SuitIndex].AllClueRanks {
			return true
		}
		if variant.Suits[card.SuitIndex].NoClueRanks {
			return false
		}

		if variant.SpecialRank == card.Rank {
			if variant.SpecialAllClueRanks {
				return true
			}
			if variant.SpecialNoClueRanks {
				return false
			}
			if variant.SpecialDeceptive {
				// The rank that touches a deceptive card is contingent upon the card's suit
				deceptiveRank := variant.ClueRanks[card.SuitIndex%len(variant.ClueRanks)]
				return clue.Value == deceptiveRank
			}
		}

		return clue.Value == card.Rank
	}

	return false
}
