package main

import (
	"encoding/json"
	"sync"

	melody "gopkg.in/olahol/melody.v1"
)

var (
	// This is the Melody WebSocket router
	m *melody.Melody

	// We keep track of all WebSocket sessions
	websocketSessions = make(map[string]*melody.Session)

	// Used to store all of the functions that handle each command
	commandHandlerMap = make(map[string]func(*melody.Session, *IncomingWebsocketData))

	// The WebSocket server needs to processes one action at a time;
	// otherwise, there would be chaos
	commandMutex = new(sync.Mutex)
)

func websocketInit() {
	/*
		Define all of the WebSocket commands
	*/

	// Lobby commands
	commandHandlerMap["createTable"] = websocketCreateTable
	commandHandlerMap["createSharedReplay"] = websocketCreateSharedReplay
	commandHandlerMap["joinTable"] = websocketJoinTable
	commandHandlerMap["leaveTable"] = websocketLeaveTable
	commandHandlerMap["unattendTable"] = websocketUnattendTable
	commandHandlerMap["reattendTable"] = websocketReattendTable
	commandHandlerMap["abandonTable"] = websocketAbandonTable
	commandHandlerMap["spectateTable"] = websocketSpectateTable
	commandHandlerMap["chat"] = websocketChat
	commandHandlerMap["getName"] = websocketGetName
	commandHandlerMap["historyDetails"] = websocketHistoryDetails
	commandHandlerMap["startGame"] = websocketStartGame
	commandHandlerMap["startReplay"] = websocketStartReplay

	// Game commands
	commandHandlerMap["hello"] = websocketHello
	commandHandlerMap["ready"] = websocketReady
	commandHandlerMap["action"] = websocketAction
	commandHandlerMap["note"] = websocketNote
	commandHandlerMap["replayAction"] = websocketReplayAction

	// Misc. commands
	commandHandlerMap["debug"] = websocketDebug

	// Define a new Melody router and attach a message handler
	m = melody.New()
	m.HandleConnect(websocketHandleConnect)
	m.HandleDisconnect(websocketHandleDisconnect)
	m.HandleMessage(websocketHandleMessage)
	// We could also attach a function to HandleError, but this fires on routine
	// things like disconnects, so it is undesirable
}

// Send a message to a client using the Golem-style protocol described above
func websocketEmit(s *melody.Session, command string, d interface{}) {
	// Convert the data to JSON
	var ds string
	if dj, err := json.Marshal(d); err != nil {
		log.Error("Failed to marshal data when writing to a Melody session:", err)
		return
	} else {
		ds = string(dj)
	}

	// Send the message as bytes
	msg := command + " " + ds
	bytes := []byte(msg)
	if err := s.Write(bytes); err != nil {
		// This can routinely fail if the session is closed, so just return
		return
	}
}
