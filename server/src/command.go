package main

type CommandData struct {
	// various
	TableID int `json:"tableID"`
	GameID  int `json:"gameID"`

	// setting
	Setting string `json:"setting"`

	// chat
	Msg       string `json:"msg"`
	Room      string `json:"room"`
	Recipient string `json:"recipient"`

	// tableCreate
	Name     string   `json:"name"`
	Options  *Options `json:"options"`
	Password string   `json:"password"`

	// action
	Type   int `json:"type"`
	Target int `json:"target"`
	Value  int `json:"value"`

	// note
	Note  string `json:"note"`
	Order int    `json:"order"`

	// tableSpectate
	ShadowingPlayerIndex int `json:"shadowingPlayerIndex"`

	// replayCreate
	Source     string   `json:"source"`
	GameJSON   GameJSON `json:"gameJSON"`
	Visibility string   `json:"visibility"`

	// sharedReplay
	Segment int    `json:"segment"`
	Rank    int    `json:"rank"`
	Suit    int    `json:"suit"`
	Sound   string `json:"sound"`

	// historyGet
	Offset int `json:"offset"`
	Amount int `json:"amount"`

	// historyGetSeed
	Seed    string `json:"seed"`
	Friends bool   `json:"friends"`

	// hypoAction
	ActionJSON string `json:"actionJSON"`

	// inactive
	Inactive bool `json:"inactive"`

	// Used internally
	// (a tag of "-" means that the JSON encoder will ignore the field)
	Username string `json:"-"` // Used to mark the username of a chat message
	Discord  bool   `json:"-"` // Used to mark if a chat message originated from Discord
	Server   bool   `json:"-"` // Used to mark if the server generated the chat message
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
	commandMap["tableSetVariant"] = commandTableSetVariant
	commandMap["tableSetLeader"] = commandTableSetLeader
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
	commandMap["chatFriend"] = commandChatFriend
	commandMap["chatUnfriend"] = commandChatUnfriend
	commandMap["chatPlayerInfo"] = commandChatPlayerInfo
	commandMap["getName"] = commandGetName
	commandMap["inactive"] = commandInactive
	commandMap["historyGet"] = commandHistoryGet
	commandMap["historyGetSeed"] = commandHistoryGetSeed
	commandMap["historyFriendsGet"] = commandHistoryFriendsGet
	commandMap["replayCreate"] = commandReplayCreate
	commandMap["tagSearch"] = commandTagSearch

	// Game and replay commands
	commandMap["getGameInfo1"] = commandGetGameInfo1
	commandMap["getGameInfo2"] = commandGetGameInfo2
	commandMap["tag"] = commandTag
	commandMap["tagDelete"] = commandTagDelete

	// Game commands
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["pause"] = commandPause

	// Replay commands
	commandMap["replayAction"] = commandReplayAction
}
