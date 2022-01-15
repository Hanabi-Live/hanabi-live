package variantslogic

import (
	"encoding/json"
	"io/ioutil"
	"math"
	"path"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

var (
	jsonPath    string
	VARIANTS    []Variant
	initialized bool
)

type Variant struct {
	Name        string   `json:"name"`
	ID          int      `json:"id"`
	StringSuits []string `json:"suits"`
	Suits       []Suit
	Efficiency  []float64
}

func Init(path string) {
	loadData(path)
}

func loadData(path string) {
	if initialized {
		return
	}

	jsonPath = path

	initSuits()
	initVariants()

	initialized = true
}

func initVariants() {
	// No validation of json file here
	source := path.Join(jsonPath, "variants.json")
	contents, _ := ioutil.ReadFile(source)

	if err := json.Unmarshal(contents, &VARIANTS); err != nil {
		logger.Error("variantsLogic: Error during variants init.")
	}

	// Create Suits, calculate and store efficiency
	for i := range VARIANTS {
		v := &VARIANTS[i]
		for _, s := range v.StringSuits {
			v.Suits = append(v.Suits, getSuitByName(s))
		}
		eff := make([]float64, 0)
		for pl := 2; pl <= 6; pl++ {
			eff = append(eff, v.CalculateEfficiency(pl))
		}
		v.Efficiency = eff
	}
}

func GetVariantFromID(id int) Variant {
	for _, v := range VARIANTS {
		if v.ID == id {
			return v
		}
	}
	return Variant{}
}

func (v Variant) numberOfSuits() int {
	return len(v.Suits)
}

func (v Variant) maxScore() int {
	return v.numberOfSuits() * 5
}

func (v Variant) isUpOrDown() bool {
	return strings.HasPrefix(v.Name, "Up or Down")
}

func (v Variant) isCriticalFours() bool {
	return strings.HasPrefix(v.Name, "Critical Fours")
}

func (v Variant) isClueStarved() bool {
	return strings.HasPrefix(v.Name, "Clue Starved")
}

func (v Variant) isThrowItInAHole() bool {
	return strings.HasPrefix(v.Name, "Throw It in a Hole")
}

func (v Variant) CalculateEfficiency(numPlayers int) float64 {
	cardsInDeck := v.totalCards()
	cardsDealt := (cardsPerHand(numPlayers) - 1) * numPlayers
	maxScore := v.maxScore()

	staringPace := cardsInDeck - cardsDealt - maxScore
	unusableClues := 1
	if numPlayers > 4 {
		unusableClues = 2
	}
	if v.isThrowItInAHole() {
		unusableClues = v.numberOfSuits()
	}

	discardsPerClue := 1
	if v.isClueStarved() {
		discardsPerClue = 2
	}

	minEff := float64(maxScore) / (8 + math.Floor(
		float64(staringPace+v.numberOfSuits()-unusableClues)/float64(discardsPerClue)))

	return minEff
}

func (v Variant) totalCards() int {
	totalCardsInTheDeck := 0
	for _, s := range v.Suits {
		totalCardsInTheDeck += 10
		if s.OneOfEach {
			totalCardsInTheDeck -= 5
		} else if v.isUpOrDown() || v.isCriticalFours() {
			totalCardsInTheDeck--
		}
	}
	return totalCardsInTheDeck
}

func cardsPerHand(numPlayers int) int {
	switch numPlayers {
	case 2, 3:
		return 5
	case 4, 5:
		return 4
	}
	return 3
}
