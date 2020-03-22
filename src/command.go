package main

type CommandData struct {
	// various
	TableID int `json:"tableID"`
	GameID  int `json:"gameID"`

	// setting
	Value string `json:"value"`

	// chat
	Msg  string `json:"msg"`
	Room string `json:"room"`

	// tableCreate
	Name                 string `json:"name"`
	Password             string `json:"password"`
	Variant              string `json:"variant"`
	Timed                bool   `json:"timed"`
	BaseTime             int    `json:"baseTime"`    // In seconds
	TimePerTurn          int    `json:"timePerTurn"` // In seconds
	Speedrun             bool   `json:"speedrun"`
	CardCycle            bool   `json:"cardCycle"`
	DeckPlays            bool   `json:"deckPlays"`
	EmptyClues           bool   `json:"emptyClues"`
	CharacterAssignments bool   `json:"characterAssignments"`
	AlertWaiters         bool   `json:"alertWaiters"`

	// action
	Clue   Clue `json:"clue"`
	Target int  `json:"target"`
	Type   int  `json:"type"`

	// note
	Note  string `json:"note"`
	Order int    `json:"order"`

	// tableSpectate
	Player string `json:"player"` // Optional

	// replayCreate
	Source     string   `json:"source"`
	GameJSON   GameJSON `json:"gameJSON"`
	Visibility string   `json:"visibility"`

	// sharedReplay
	Turn  int    `json:"turn"`
	Rank  int    `json:"rank"`
	Suit  int    `json:"suit"`
	Sound string `json:"sound"`

	// historyGet
	Offset int `json:"offset"`
	Amount int `json:"amount"`

	// hypoAction
	ActionJSON string `json:"actionJSON"`

	// clientError
	Message string `json:"message"`
	URL     string `json:"url"`
	LineNum int    `json:"lineno"`
	ColNum  int    `json:"colno"`

	// Used internally
	// (validation for all of these field must be explicitly defined in "websocketMessage.go")
	Username             string   // Used to mark the username of a chat message
	Discord              bool     // Used to mark if a chat message origined from Discord
	Server               bool     // Used to mark if the server generated the chat message
	Spam                 bool     // True if it should go to the "bot" channel
	OnlyDiscord          bool     // True if this is a chat message that should only go to Discord
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
	// Table commands
	commandMap["tableCreate"] = commandTableCreate
	commandMap["tableJoin"] = commandTableJoin
	commandMap["tableLeave"] = commandTableLeave
	commandMap["tableUnattend"] = commandTableUnattend
	commandMap["tableReattend"] = commandTableReattend
	commandMap["tableStart"] = commandTableStart
	commandMap["tableAbandon"] = commandTableAbandon
	commandMap["tableSpectate"] = commandTableSpectate
	commandMap["tableRestart"] = commandTableRestart

	// Other lobby commands
	commandMap["setting"] = commandSetting
	commandMap["chat"] = commandChat
	commandMap["chatRead"] = commandChatRead
	commandMap["getName"] = commandGetName
	commandMap["historyGetDeals"] = commandHistoryGetDeals
	commandMap["historyGetAll"] = commandHistoryGetAll
	commandMap["historyGet"] = commandHistoryGet
	commandMap["replayCreate"] = commandReplayCreate

	// Game commands
	commandMap["hello"] = commandHello
	commandMap["ready"] = commandReady
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["pause"] = commandPause
	commandMap["replayAction"] = commandReplayAction

	// Miscellaneous commands
	commandMap["clientError"] = commandClientError
}
