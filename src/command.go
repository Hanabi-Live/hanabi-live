package main

type CommandData struct {
	// various
	ID int `json:"gameID"`

	// setting
	Value string `json:"value"`

	// chat
	Msg  string `json:"msg"`
	Room string `json:"room"`

	// gameCreate
	Name                 string `json:"name"`
	Password             string `json:"password"`
	Variant              string `json:"variant"`
	Timed                bool   `json:"timed"`
	BaseTime             int    `json:"baseTime"`    // In seconds
	TimePerTurn          int    `json:"timePerTurn"` // In seconds
	Speedrun             bool   `json:"speedrun"`
	DeckPlays            bool   `json:"deckPlays"`
	EmptyClues           bool   `json:"emptyClues"`
	CharacterAssignments bool   `json:"characterAssignments"`
	Correspondence       bool   `json:"correspondence"`
	AlertWaiters         bool   `json:"alertWaiters"`

	// action
	Clue   Clue `json:"clue"`
	Target int  `json:"target"`
	Type   int  `json:"type"`

	// note
	Note  string `json:"note"`
	Order int    `json:"order"`

	// gameSpectate
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
	Username             string
	Discord              bool
	Server               bool
	Spam                 bool     // True if it should go to the "bot" channel
	OnlyDiscord          bool     // True if this is a chat message that should only go to Discord
	DiscordID            string   // Used when echoing a message from Discord to the lobby
	DiscordDiscriminator string   // Used when echoing a message from Discord to the lobby
	Args                 []string // Used to pass chat command arguments to a chat command handler
	GameID               int      // Used to pass the game ID to a chat command handler
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
	commandMap["gameRestart"] = commandGameRestart
	commandMap["setting"] = commandSetting
	commandMap["chat"] = commandChat
	commandMap["chatRead"] = commandChatRead
	commandMap["getName"] = commandGetName
	commandMap["historyDetails"] = commandHistoryDetails
	commandMap["historyGetAll"] = commandHistoryGetAll
	commandMap["historyGet"] = commandHistoryGet
	commandMap["gameStart"] = commandGameStart
	commandMap["replayCreate"] = commandReplayCreate

	// Game commands
	commandMap["hello"] = commandHello
	commandMap["ready"] = commandReady
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["pause"] = commandPause
	commandMap["replayAction"] = commandReplayAction

	// Misc commands
	commandMap["clientError"] = commandClientError
}
