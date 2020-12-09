package main

import (
	"sync"
)

var (
	// We keep track of all WebSocket sessions
	// TODO DELETE THIS
	sessions2 = NewSessions()

	// We keep track of all ongoing WebSocket messages/commands
	// TODO IMPLEMENT THIS IN THE COMMANDS PACKAGE
	commandWaitGroup sync.WaitGroup
)

func websocketInit() {
	// Fill the command handler map
	// (which is used in the "websocketHandleMessage" function)
	// TODO IMPLEMENT THIS IN THE COMMANDS PACKAGE
	commandInit()
}
