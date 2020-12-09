package settings

type Settings struct {
	DesktopNotification              bool    `json:"desktopNotification"`
	SoundMove                        bool    `json:"soundMove"`
	SoundTimer                       bool    `json:"soundTimer"`
	KeldonMode                       bool    `json:"keldonMode"`
	ColorblindMode                   bool    `json:"colorblindMode"`
	RealLifeMode                     bool    `json:"realLifeMode"`
	ReverseHands                     bool    `json:"reverseHands"`
	StyleNumbers                     bool    `json:"styleNumbers"`
	ShowTimerInUntimed               bool    `json:"showTimerInUntimed"`
	Volume                           int     `json:"volume"`
	SpeedrunPreplay                  bool    `json:"speedrunPreplay"`
	SpeedrunMode                     bool    `json:"speedrunMode"`
	HyphenatedConventions            bool    `json:"hyphenatedConventions"`
	CreateTableVariant               string  `json:"createTableVariant"`
	CreateTableTimed                 bool    `json:"createTableTimed"`
	CreateTableTimeBaseMinutes       float64 `json:"createTableTimeBaseMinutes"`
	CreateTableTimePerTurnSeconds    int     `json:"createTableTimePerTurnSeconds"`
	CreateTableSpeedrun              bool    `json:"createTableSpeedrun"`
	CreateTableCardCycle             bool    `json:"createTableCardCycle"`
	CreateTableDeckPlays             bool    `json:"createTableDeckPlays"`
	CreateTableEmptyClues            bool    `json:"createTableEmptyClues"`
	CreateTableOneExtraCard          bool    `json:"createTableOneExtraCard"`
	CreateTableOneLessCard           bool    `json:"createTableOneLessCard"`
	CreateTableAllOrNothing          bool    `json:"createTableAllOrNothing"`
	CreateTableDetrimentalCharacters bool    `json:"createTableDetrimentalCharacters"`
}
