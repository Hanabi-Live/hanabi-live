package main

type CommandData struct {
	// various
	TableID int `json:"tableID"`
	GameID  int `json:"gameID"`

	// setting
	Value string `json:"value"`

	// chat
	Msg       string `json:"msg"`
	Room      string `json:"room"`
	Recipient string `json:"recipient"`

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
	// (it might be simpler to use "seat" instead of "player",
	// but this gets tricky since 0 is the default value of an int and 0 is a valid seat number)

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

	// inactive
	Inactive bool `json:"inactive"`

	// clientError
	Message string `json:"message"`
	URL     string `json:"url"`
	LineNum int    `json:"lineno"`
	ColNum  int    `json:"colno"`

	// Used internally
	// (a tag of "-" means that the JSON encoder will ignore the field)
	Username string `json:"-"` // Used to mark the username of a chat message
	Discord  bool   `json:"-"` // Used to mark if a chat message origined from Discord
	Server   bool   `json:"-"` // Used to mark if the server generated the chat message
	Spam     bool   `json:"-"` // True if it should go to the "bot" channel
	// True if this is a chat message that should only go to Discord
	OnlyDiscord          bool   `json:"-"`
	DiscordID            string `json:"-"` // Used when echoing a message from Discord to the lobby
	DiscordDiscriminator string `json:"-"` // Used when echoing a message from Discord to the lobby
	// Used to pass chat command arguments to a chat command handler
	Args []string `json:"-"`
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
	commandMap["tableTerminate"] = commandTableTerminate
	commandMap["tableSpectate"] = commandTableSpectate
	commandMap["tableRestart"] = commandTableRestart

	// Other lobby commands
	commandMap["setting"] = commandSetting
	commandMap["chat"] = commandChat
	commandMap["chatPM"] = commandChatPM
	commandMap["chatRead"] = commandChatRead
	commandMap["chatTyping"] = commandChatTyping
	commandMap["inactive"] = commandInactive
	commandMap["getName"] = commandGetName
	commandMap["historyGetDeals"] = commandHistoryGetDeals
	commandMap["historyGet"] = commandHistoryGet
	commandMap["replayCreate"] = commandReplayCreate

	// Game commands
	commandMap["getGameInfo1"] = commandGetGameInfo1
	commandMap["getGameInfo2"] = commandGetGameInfo2
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["pause"] = commandPause
	commandMap["replayAction"] = commandReplayAction
}
