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
	colors       map[string]*Color
	suits        map[string]*Suit
	variants     map[string]*Variant
	variantsID   map[int]string
	variantsList []string
)

type Color struct {
	Name         string
	Abbreviation string
}

func colorsInit() {
	// Import the JSON file
	filePath := path.Join(dataPath, "colors.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		logger.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	if err := json.Unmarshal(contents, &colors); err != nil {
		logger.Fatal("Failed to convert the colors file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]bool)
	for name, color := range colors {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two colors with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Validate that there is an abbreviation
		if color.Abbreviation == "" {
			// Assume that it is the first letter of the color
			color.Abbreviation = string([]rune(name)[0])
		}
	}
}

type Suit struct {
	Name          string
	ClueColors    []string `json:"clueColors"`
	AllClueColors bool     `json:"allClueColors"`
	ClueRanks     string   `json:"clueRanks"`
	OneOfEach     bool     `json:"oneOfEach"`
	Abbreviation  string   `json:"abbreviation"`
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

	// Handle suits that are touched by all color clues (1/2)
	allClueColors := make([]string, 0)
	for name := range colors {
		allClueColors = append(allClueColors, name)
	}

	uniqueNameMap := make(map[string]bool)
	for name, suit := range suits {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two suits with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Validate the suit name
		if suit.Name == "" {
			// By default, use the name of the key
			suit.Name = name
		}

		// Validate the clue colors (the colors that touch this suit)
		if suit.AllClueColors {
			// Handle suits that are touched by all color clues (2/2)
			suit.ClueColors = allClueColors
		} else if len(suit.ClueColors) > 1 {
			for _, colorName := range suit.ClueColors {
				if _, ok := colors[colorName]; !ok {
					logger.Fatal("The suit of \"" + name + "\" has a clue color of \"" + colorName + "\", " +
						"but that color does not exist.")
				}
			}
		} else {
			// By default, use the color of the same name
			if _, ok := colors[name]; ok {
				suit.ClueColors = []string{name}
			}
			// If the color of the same name does not exist,
			// this must be a suit that is touched by no color clues
		}

		// Validate the clue ranks (the ranks that touch the suits)
		if suit.ClueRanks != "" && suit.ClueRanks != "none" && suit.ClueRanks != "all" {
			logger.Fatal("The suit of \"" + name + "\" has an invalid value for \"clueRanks\".")
		}
		if suit.ClueRanks == "" {
			// Assume that the ranks work normally (e.g. a rank 1 clue touches a blue 1)
			suit.ClueRanks = "normal"
		}

		// Validate that there is an abbreviation
		if name != "Unknown" {
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
	}
}

type JSONVariant struct {
	ID    int      `json:"id"`
	Suits []string `json:"suits"`
	// ClueColors and ClueRanks are optional elements
	// Thus, they must be pointers so that we can tell if the values were specified or not
	ClueColors             *[]string `json:"clueColors"`
	ClueRanks              *[]int    `json:"clueRanks"`
	ColorCluesTouchNothing bool
	RankCluesTouchNothing  bool
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

	uniqueNameMap := make(map[string]bool)
	uniqueIDMap := make(map[int]bool)
	variants = make(map[string]*Variant)
	variantsID = make(map[int]string)
	for name, variant := range JSONVariants {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			logger.Fatal("There are two variants with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Validate that all of the ID's are unique
		if _, ok := uniqueIDMap[variant.ID]; ok {
			logger.Fatal("There are two variants with the ID of " +
				"\"" + strconv.Itoa(variant.ID) + "\".")
			return
		}
		uniqueIDMap[variant.ID] = true

		// Validate that there is at least one suit
		if len(variant.Suits) < 1 {
			logger.Fatal("The variant of \"" + name + "\" does not have at least one suit.")
		}

		// Validate that all of the suits exist and convert suit strings to objects
		variantSuits := make([]*Suit, 0)
		for _, suitName := range variant.Suits {
			if suit, ok := suits[suitName]; !ok {
				logger.Fatal("The suit of \"" + suitName + "\" " +
					"in variant \"" + name + "\" does not exist.")
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
			variantRanks = append(variantRanks, startCardRank)
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
			MaxScore:               len(variantSuits) * 5, // Assuming that there are 5 points per stack
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
func variantIsCardTouched(variant string, clue Clue, card *Card) bool {
	if clue.Type == clueTypeRank {
		if variants[variant].Suits[card.Suit].ClueRanks == "all" {
			return true
		}
		if variants[variant].Suits[card.Suit].ClueRanks == "none" {
			return false
		}
		if variants[variant].RankCluesTouchNothing {
			return false
		}
		if (strings.Contains(variant, "Pink-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Pink-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Omni-Fives") && card.Rank == 5) {

			return true
		}
		if (strings.Contains(variant, "Brown-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Muddy-Rainbow-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Brown-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Omni-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Muddy-Rainbow-Fives") && card.Rank == 5) {

			return false
		}
		return card.Rank == clue.Value
	}

	if clue.Type == clueTypeColor {
		if variants[variant].ColorCluesTouchNothing {
			return false
		}
		if (strings.Contains(variant, "Rainbow-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Rainbow-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Omni-Fives") && card.Rank == 5) {

			return true
		}
		if (strings.Contains(variant, "White-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Omni-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "Light-Pink-Ones") && card.Rank == 1) ||
			(strings.Contains(variant, "White-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Omni-Fives") && card.Rank == 5) ||
			(strings.Contains(variant, "Light-Pink-Fives") && card.Rank == 5) {

			return false
		}
		color := variants[variant].ClueColors[clue.Value]
		colors := variants[variant].Suits[card.Suit].ClueColors
		return stringInSlice(color, colors)
	}

	return false
}
