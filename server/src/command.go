package main

import (
	"context"
)

type CommandData struct {
	// various
	TableID    uint64 `json:"tableID"`
	DatabaseID int    `json:"databaseID"`

	// setting
	Setting string `json:"setting"`

	// chat
	Msg       string `json:"msg"`
	Room      string `json:"room"`
	Recipient string `json:"recipient"`

	// tableCreate
	Name       string   `json:"name"`
	Options    *Options `json:"options"`
	Password   string   `json:"password"`
	MaxPlayers int      `json:"maxPlayers"`

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
	Source     string    `json:"source"`
	GameJSON   *GameJSON `json:"gameJSON"`
	Visibility string    `json:"visibility"`

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
	// Used to prevent pre-games of restarted games from showing up in the lobby
	HidePregame bool `json:"-"`
	// True if this is a chat message that should only go to Discord
	OnlyDiscord          bool   `json:"-"`
	DiscordID            string `json:"-"` // Used when echoing a message from Discord to the lobby
	DiscordDiscriminator string `json:"-"` // Used when echoing a message from Discord to the lobby
	// Used to pass chat command arguments to a chat command handler
	Args []string `json:"-"`
	// Used when a command handler calls another command handler
	// (e.g. the mutex lock is already acquired and does not need to be acquired again)
	NoTableLock  bool `json:"-"` // To avoid "t.Lock()"
	NoTablesLock bool `json:"-"` // To avoid "tables.Lock()"
}

var (
	// Used to store all of the functions that handle each command
	commandMap = make(map[string]func(context.Context, *Session, *CommandData))
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
	commandMap["loaded"] = commandLoaded
	commandMap["tag"] = commandTag
	commandMap["tagDelete"] = commandTagDelete

	// Game commands
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["pause"] = commandPause

	// Replay commands
	commandMap["replayAction"] = commandReplayAction
}
