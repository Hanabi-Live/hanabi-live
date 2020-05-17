package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
	"strconv"
	"strings"

	orderedJson "github.com/virtuald/go-ordered-json"
)

var (
	variants     map[string]*Variant
	variantsID   map[int]string
	variantsList []string
)

type JSONVariant struct {
	ID    int      `json:"id"`
	Suits []string `json:"suits"`
	// ClueColors and ClueRanks are optional elements
	// Thus, they must be pointers so that we can tell if the values were specified or not
	ClueColors             *[]string `json:"clueColors"`
	ClueRanks              *[]int    `json:"clueRanks"`
	ColorCluesTouchNothing bool
	RankCluesTouchNothing  bool

	SpecialRank          int  `json:"specialRank"` // For e.g. Rainbow-Ones
	SpecialAllClueColors bool `json:"specialAllClueColors"`
	SpecialAllClueRanks  bool `json:"specialAllClueRanks"`
	SpecialNoClueColors  bool `json:"specialNoClueColors"`
	SpecialNoClueRanks   bool `json:"specialNoClueRanks"`
}

type Variant struct {
	Name string
	// Each variant must have a unique numerical ID for seed generation purposes
	// (and for the database)
	ID                     int
	Suits                  []*Suit
	Ranks                  []int
	ClueColors             []string
	ClueRanks              []int
	ColorCluesTouchNothing bool
	RankCluesTouchNothing  bool
	MaxScore               int
}

func (v *Variant) GetDeckSize() int {
	deckSize := 0
	for _, s := range v.Suits {
		if s.OneOfEach {
			deckSize += 5
		} else {
			deckSize += 10
		}
	}
	if strings.HasPrefix(v.Name, "Up or Down") {
		deckSize -= len(v.Suits)
	}
	return deckSize
}

func variantsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "variants.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	var JSONVariants map[string]JSONVariant
	if err := json.Unmarshal(contents, &JSONVariants); err != nil {
		logger.Fatal("Failed to convert the variants file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]struct{})
	uniqueIDMap := make(map[int]struct{})
	variants = make(map[string]*Variant)
	variantsID = make(map[int]string)
	for name, variant := range JSONVariants {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two variants with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = struct{}{}

		// Validate that all of the ID's are unique
		if _, ok := uniqueIDMap[variant.ID]; ok {
			logger.Fatal("There are two variants with the ID of " +
				"\"" + strconv.Itoa(variant.ID) + "\".")
			return
		}
		uniqueIDMap[variant.ID] = struct{}{}

		// Validate that there is at least one suit
		if len(variant.Suits) < 1 {
			logger.Fatal("The variant of \"" + name + "\" does not have at least one suit.")
			return
		}

		// Validate that all of the suits exist and convert suit strings to objects
		variantSuits := make([]*Suit, 0)
		for _, suitName := range variant.Suits {
			if suit, ok := suits[suitName]; !ok {
				logger.Fatal("The suit of \"" + suitName + "\" " +
					"in variant \"" + name + "\" does not exist.")
				return
			} else {
				variantSuits = append(variantSuits, suit)
			}
		}

		// Derive the card ranks (the ranks that the cards of each suit will be)
		// By default, assume ranks 1 through 5
		variantRanks := []int{1, 2, 3, 4, 5}
		if strings.HasPrefix(name, "Up or Down") {
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
					logger.Fatal("The variant of \"" + name + "\" has a clue color of " +
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

		// Convert the JSON variant into a variant object and store it in the map
		variants[name] = &Variant{
			Name:                   name,
			ID:                     variant.ID,
			Suits:                  variantSuits,
			Ranks:                  variantRanks,
			ClueColors:             *clueColors,
			ClueRanks:              *clueRanks,
			ColorCluesTouchNothing: variant.ColorCluesTouchNothing,
			RankCluesTouchNothing:  variant.RankCluesTouchNothing,
			MaxScore:               len(variantSuits) * 5,
			// (we assume that there are 5 points per stack)
		}

		// Create a reverse mapping of ID to name
		// (so that we can easily find the associated variant from a database entry)
		variantsID[variant.ID] = name
	}

	// Validate that there are no skipped ID numbers
	for i := 0; i < len(JSONVariants); i++ {
		foundID := false
		for _, variant := range JSONVariants {
			if variant.ID == i {
				foundID = true
				break
			}
		}
		if !foundID {
			logger.Fatal("There is no variant with an ID of \"" + strconv.Itoa(i) + "\". " +
				"(Variant IDs must be sequential.)")
			return
		}
	}

	// We also need an ordered list of the variants
	var variantsOrdered orderedJson.OrderedObject
	if err := orderedJson.Unmarshal(contents, &variantsOrdered); err != nil {
		logger.Fatal("Failed to convert the variants file to ordered JSON:", err)
		return
	}
	variantsList = make([]string, 0)
	for _, orderedObject := range variantsOrdered {
		variantsList = append(variantsList, orderedObject.Key)
	}
}

// variantIsCardTouched returns true if a clue will touch a particular suit
// For example, a yellow clue will not touch a green card in a normal game,
// but it will the "Dual-Color" variant
func variantIsCardTouched(variantName string, clue Clue, card *Card) bool {
	variant := variants[variantName]

	if clue.Type == ClueTypeColor {
		if variant.ColorCluesTouchNothing {
			return false
		}

		if variant.Suits[card.Suit].AllClueColors {
			return true
		}
		if variant.Suits[card.Suit].NoClueColors {
			return false
		}

		// Checking for "Rainbow-" also checks for "Muddy-Rainbow-"
		if (strings.Contains(variantName, "Rainbow-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Rainbow-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Omni-Fives") && card.Rank == 5) {

			return true
		}
		if (strings.Contains(variantName, "White-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Null-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Light-Pink-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "White-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Null-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Light-Pink-Fives") && card.Rank == 5) {

			return false
		}

		clueColor := variant.ClueColors[clue.Value]
		cardColors := variant.Suits[card.Suit].ClueColors
		return stringInSlice(clueColor, cardColors)
	}

	if clue.Type == ClueTypeRank {
		if variant.RankCluesTouchNothing {
			return false
		}

		if variant.Suits[card.Suit].AllClueRanks {
			return true
		}
		if variant.Suits[card.Suit].NoClueRanks {
			return false
		}

		// Checking for "Pink-" also checks for "Light-Pink-"
		if (strings.Contains(variantName, "Pink-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Pink-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Omni-Fives") && card.Rank == 5) {

			return true
		}
		if (strings.Contains(variantName, "Brown-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Null-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Muddy-Rainbow-Ones") && card.Rank == 1) ||
			(strings.Contains(variantName, "Brown-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Null-Fives") && card.Rank == 5) ||
			(strings.Contains(variantName, "Muddy-Rainbow-Fives") && card.Rank == 5) {

			return false
		}

		return clue.Value == card.Rank
	}

	return false
}
