package main

type CommandData struct {
	// misc.
	ID int `json:"gameID"`

	// chat
	Msg  string `json:"msg"`
	Room string `json:"room"`

	// gameCreate
	Name               string  `json:"name"`
	Password           string  `json:"password"`
	Variant            int     `json:"variant"`
	Timed              bool    `json:"timed"`
	BaseTimeMinutes    float64 `json:"baseTimeMinutes"`
	TimePerTurnSeconds int     `json:"timePerTurnSeconds"`
	DeckPlays          bool    `json:"deckPlays"`
	ReorderCards       bool    `json:"reorderCards"`
	EmptyClues         bool    `json:"emptyClues"`

	// action
	Clue   Clue `json:"clue"`
	Target int  `json:"target"`
	Type   int  `json:"type"`

	// note
	Note  string `json:"note"`
	Order int    `json:"order"`

	// sharedReplay
	Turn  int    `json:"turn"`
	Rank  int    `json:"rank"`
	Suit  int    `json:"suit"`
	Sound string `json:"sound"`

	// historyGet
	Offset int `json:"offset"`
	Amount int `json:"amount"`

	// clientError
	Message string `json:"message"`
	URL     string `json:"url"`
	LineNum int    `json:"lineno"`
	ColNum  int    `json:"colno"`

	// Used internally
	Username             string
	Discord              bool
	Server               bool
	Echo                 bool     // True if this is a server message but it should still go to the main channels
	DiscordID            string   // Used when echoing a message from Discord to the lobby
	DiscordDiscriminator string   // Used when echoing a message from Discord to the lobby
	Args                 []string // Used to pass chat command arguments to a chat command handler
}
type Clue struct {
	Type  int `json:"type"`
	Value int `json:"value"`
}

var (
	// Used to store all of the functions that handle each command
	commandMap = make(map[string]func(*Session, *CommandData))
)

// Define all of the WebSocket commands
func commandInit() {
	// Lobby commands
	commandMap["gameCreate"] = commandGameCreate
	commandMap["gameJoin"] = commandGameJoin
	commandMap["gameLeave"] = commandGameLeave
	commandMap["gameUnattend"] = commandGameUnattend
	commandMap["gameReattend"] = commandGameReattend
	commandMap["gameAbandon"] = commandGameAbandon
	commandMap["gameSpectate"] = commandGameSpectate
	commandMap["chat"] = commandChat
	commandMap["getName"] = commandGetName
	commandMap["historyDetails"] = commandHistoryDetails
	commandMap["historyGetAll"] = commandHistoryGetAll
	commandMap["historyGet"] = commandHistoryGet
	commandMap["gameStart"] = commandGameStart
	commandMap["replayCreate"] = commandReplayCreate
	commandMap["sharedReplayCreate"] = commandSharedReplayCreate

	// Game commands
	commandMap["hello"] = commandHello
	commandMap["ready"] = commandReady
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["replayAction"] = commandReplayAction

	// Misc commands
	commandMap["clientError"] = commandClientError
}
