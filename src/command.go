package main

type CommandData struct {
	ID int `json:"gameID"`
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
	commandMap["gameStart"] = commandGameStart
	commandMap["replayCreate"] = commandReplayCreate
	commandMap["sharedReplayCreate"] = commandSharedReplayCreate

	// Game commands
	commandMap["hello"] = commandHello
	commandMap["ready"] = commandReady
	commandMap["action"] = commandAction
	commandMap["note"] = commandNote
	commandMap["replayAction"] = commandReplayAction

	// Misc. commands
	commandMap["debug"] = commandDebug
}
