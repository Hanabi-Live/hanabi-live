package main

type CommandData struct {
	// misc.
	ID int `json:"gameID"`

	// chat
	Msg  string `json:"msg"`
	Room string `json:"room"`

	// gameCreate
	Name               string  `json:"name"`
	Variant            int     `json:"variant"`
	Timed              bool    `json:"timed"`
	BaseTimeMinutes    float64 `json:"baseTimeMinutes"`
	TimePerTurnSeconds int     `json:"timePerTurnSeconds"`
	ReorderCards       bool    `json:"reorderCards"`

	// action
	Clue   Clue `json:"clue"`
	Target int  `json:"target"`
	Type   int  `json:"type"`

	// note
	Note  string `json:"note"`
	Order int    `json:"order"`

	// sharedReplay
	Turn int `json:"turn"`
	Rank int `json:"rank"`
	Suit int `json:"suit"`

	// clientError
	Message string `json:"message"`
	URL     string `json:"url"`
	LineNum int    `json:"lineno"`
	ColNum  int    `json:"colno"`

	// Used internally
	Username string
	Discord  bool
	Server   bool
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
