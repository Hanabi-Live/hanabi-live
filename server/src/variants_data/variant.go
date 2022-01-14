package variants_data

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
	Id          int      `json:"id"`
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

	if err := json.Unmarshal([]byte(contents), &VARIANTS); err != nil {
		logger.Error("variants_data: Error during variants init.")
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

func (v Variant) CalculateEfficiency(numPlayers int) float64 {
	deckSize := v.startingDeckSize(numPlayers)
	numberOfSuits := v.numberOfSuits()
	maxScore := v.maxScore()
	totalClues := startingCluesUsable(numPlayers, deckSize, numberOfSuits)

	eff := float64(maxScore) / float64(totalClues)
	round2eff := math.Floor(eff*100) / 100
	return round2eff
}

func (v Variant) startingDeckSize(numPlayers int) int {
	totalCards := v.totalCards()
	initialCardsDrawn := cardsPerHand(numPlayers) * numPlayers
	return totalCards - initialCardsDrawn
}

func (v Variant) totalCards() int {
	totalCardsInTheDeck := 0
	for _, s := range v.Suits {
		totalCardsInTheDeck += 10
		if s.OneOfEach {
			totalCardsInTheDeck -= 5
		} else if v.isUpOrDown() || v.isCriticalFours() {
			totalCardsInTheDeck -= 1
		}
	}
	return totalCardsInTheDeck
}

func startingCluesUsable(numPlayers int, deckSize int, numberOfSuits int) int {
	maxScore := numberOfSuits * 5

	maxDiscardsBeforeFinalRound := numPlayers + deckSize - maxScore

	minPlaysBeforeFinalRound := numberOfSuits*5 - numPlayers - 1
	cardsPlayed := 0
	suitsCompletedBeforeFinalRound := 0
	for i := 0; i < numberOfSuits; i++ {
		if cardsPlayed+5 > minPlaysBeforeFinalRound {
			break
		}
		cardsPlayed += 5
		suitsCompletedBeforeFinalRound += 1
	}
	cluesFromSuits := suitsCompletedBeforeFinalRound

	return maxDiscardsBeforeFinalRound + cluesFromSuits + 8
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
