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
	colors       map[string]bool
	suits        map[string]*Suit
	variants     map[string]*Variant
	variantsID   map[int]string
	variantsList []string
)

func colorsInit() {
	// Import the JSON file
	filePath := path.Join(projectPath, "public", "data", "colors.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		log.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	var rawColors map[string]interface{}
	if err := json.Unmarshal(contents, &rawColors); err != nil {
		log.Fatal("Failed to convert the colors file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]bool)
	colors = make(map[string]bool)
	for name := range rawColors {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			log.Fatal("There are two colors with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Copy the colors into the color map
		colors[name] = true
	}
}

type Suit struct {
	Name          string
	ClueColors    []string `json:"clueColors"`
	AllClueColors bool     `json:"allClueColors"`
	ClueRanks     string   `json:"clueRanks"`
	OneOfEach     bool     `json:"oneOfEach"`
}

func suitsInit() {
	// Import the JSON file
	filePath := path.Join(projectPath, "public", "data", "suits.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		log.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	if err := json.Unmarshal(contents, &suits); err != nil {
		log.Fatal("Failed to convert the suits file to JSON:", err)
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
			log.Fatal("There are two suits with the name of \"" + name + "\".")
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
					log.Fatal("The suit of \"" + name + "\" has a clue color of \"" + colorName + "\", " +
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
			log.Fatal("The suit of \"" + name + "\" has an invalid value for \"clueRanks\".")
		}
	}
}

type JSONVariant struct {
	ID         int      `json:"id"`
	Suits      []string `json:"suits"`
	ClueColors []string `json:"clueColors"`
}

type Variant struct {
	Name string
	// Each variant must have a unique numerical ID for seed generation purposes
	// (and for the database)
	ID         int
	Suits      []*Suit
	Ranks      []int
	ClueColors []string
	ClueRanks  []int
}

func variantsInit() {
	// Import the JSON file
	filePath := path.Join(projectPath, "public", "data", "variants.json")
	var contents []byte
	if v, err := ioutil.ReadFile(filePath); err != nil {
		log.Fatal("Failed to read the \""+filePath+"\" file:", err)
		return
	} else {
		contents = v
	}
	var JSONVariants map[string]JSONVariant
	if err := json.Unmarshal(contents, &JSONVariants); err != nil {
		log.Fatal("Failed to convert the variants file to JSON:", err)
		return
	}

	uniqueNameMap := make(map[string]bool)
	uniqueIDMap := make(map[int]bool)
	variants = make(map[string]*Variant)
	variantsID = make(map[int]string)
	for name, variant := range JSONVariants {
		// Validate that all of the names are unique
		if _, ok := uniqueNameMap[name]; ok {
			log.Fatal("There are two variants with the name of \"" + name + "\".")
			return
		}
		uniqueNameMap[name] = true

		// Validate that all of the ID's are unique
		if _, ok := uniqueIDMap[variant.ID]; ok {
			log.Fatal("There are two variants with the ID of " +
				"\"" + strconv.Itoa(variant.ID) + "\".")
			return
		}
		uniqueIDMap[variant.ID] = true

		// Validate that there is at least one suit
		if len(variant.Suits) < 1 {
			log.Fatal("The variant of \"" + name + "\" does not have at least one suit.")
		}

		// Convert suit strings to objects
		variantSuits := make([]*Suit, 0)
		for _, suitName := range variant.Suits {
			variantSuits = append(variantSuits, suits[suitName])
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
		clueColors := make([]string, 0)
		if len(variant.ClueColors) > 0 {
			// The clue colors were specified in the JSON, so validate that they map to colors
			for _, colorName := range variant.ClueColors {
				if _, ok := colors[colorName]; !ok {
					log.Fatal("The variant of \"" + name + "\" has a clue color of " +
						"\"" + colorName + "\", but that color does not exist.")
				}
			}
			clueColors = variant.ClueColors
		} else {
			// The clue colors were not specified in the JSON, so derive them from the suits
			for _, suit := range variantSuits {
				if suit.AllClueColors {
					// If a suit is touched by all colors, then we don't want to add
					// every single clue color to the variant clue list
					continue
				}
				for _, color := range suit.ClueColors {
					if !stringInSlice(color, clueColors) {
						clueColors = append(clueColors, color)
					}
				}
			}
		}

		// Derive the clue ranks (the ranks available to clue in this variant)
		var clueRanks []int
		if strings.HasPrefix(name, "Number Mute") {
			clueRanks = make([]int, 0)
		} else if strings.HasPrefix(name, "Multi-Fives") {
			clueRanks = []int{1, 2, 3, 4}
		} else {
			clueRanks = []int{1, 2, 3, 4, 5}
		}

		// Convert the JSON variant into a variant object and store it in the map
		variants[name] = &Variant{
			Name:       name,
			ID:         variant.ID,
			Suits:      variantSuits,
			Ranks:      variantRanks,
			ClueColors: clueColors,
			ClueRanks:  clueRanks,
		}

		// Create a reverse mapping of ID to name
		// (so that we can easily find the associated variant from a database entry)
		variantsID[variant.ID] = name
	}

	// We also need an ordered list of the variants
	var variantsOrdered orderedJson.OrderedObject
	if err := orderedJson.Unmarshal(contents, &variantsOrdered); err != nil {
		log.Fatal("Failed to convert the variants file to ordered JSON:", err)
		return
	}
	variantsList = make([]string, 0)
	for _, oo := range variantsOrdered {
		variantsList = append(variantsList, oo.Key)
	}
}

// variantIsCardTouched returns true if a clue will touch a particular suit
// For example, a yellow clue will not touch a green card in a normal game,
// but it will the "Dual-Color" variant
func variantIsCardTouched(variant string, clue Clue, card *Card) bool {
	if strings.HasPrefix(variant, "Totally Blind") {
		return false
	}

	if clue.Type == clueTypeRank {
		if variants[variant].Suits[card.Suit].ClueRanks == "all" {
			return true
		}
		if variants[variant].Suits[card.Suit].ClueRanks == "none" {
			return false
		}
		if strings.HasPrefix(variant, "Number Blind") || strings.HasPrefix(variant, "Number Mute") {
			return false
		}
		if strings.HasPrefix(variant, "Multi-Fives") && card.Rank == 5 {
			return true
		}
		return card.Rank == clue.Value
	}

	if clue.Type == clueTypeColor {
		if strings.HasPrefix(variant, "Color Blind") || strings.HasPrefix(variant, "Color Mute") {
			return false
		}
		if strings.HasPrefix(variant, "Prism-Ones") && card.Rank == 1 {
			return true
		}
		color := variants[variant].ClueColors[clue.Value]
		colors := variants[variant].Suits[card.Suit].ClueColors
		return stringInSlice(color, colors)
	}

	return false
}
