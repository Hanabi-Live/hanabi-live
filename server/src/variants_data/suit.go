package variants_data

import (
	"encoding/json"
	"io/ioutil"
	"path"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

var suits []Suit

type Suit struct {
	Name      string `json:"name"`
	OneOfEach bool   `json:"oneOfEach"`
}

func initSuits() {
	// No validation of json file here
	source := path.Join(jsonPath, "suits.json")
	contents, _ := ioutil.ReadFile(source)

	if err := json.Unmarshal([]byte(contents), &suits); err != nil {
		logger.Error("variants_data: Error during suits init.")
	}
}

func getSuitByName(name string) Suit {
	for _, s := range suits {
		if s.Name == name {
			return s
		}
	}
	return Suit{}
}
