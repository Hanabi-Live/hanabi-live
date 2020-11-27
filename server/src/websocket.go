package main

import (
	"sync"

	"github.com/gabstv/melody"
)

var (
	// This is the Melody WebSocket router
	// We choose Melody as a framework because it is a bit higher level than the two most popular
	// candidates, "gorilla/websocket" and "nhooyr/websocket"
	// We use a fork of Melody ("gabstv/melody") because the original ("olahol/melody") is
	// unmaintained and the fork fixes some race conditions
	melodyRouter *melody.Melody

	// We keep track of all WebSocket sessions
	sessions      = make(map[int]*Session)
	sessionsMutex = sync.RWMutex{}

	// We only allow one user to connect or disconnect at the same time
	sessionConnectMutex = sync.Mutex{}

	// We keep track of all ongoing WebSocket messages/commands
	commandWaitGroup sync.WaitGroup
)

func websocketInit() {
	// Fill the command handler map
	// (which is used in the "websocketHandleMessage" function)
	commandInit()

	// Define a new Melody router
	melodyRouter = melody.New()

	// The default maximum message size is 512 bytes,
	// but this is not long enough to send game objects
	// Thus, we have to manually increase it
	melodyRouter.Config.MaxMessageSize = 8192

	// Attach some handlers
	melodyRouter.HandleConnect(websocketConnect)
	melodyRouter.HandleDisconnect(websocketDisconnect)
	melodyRouter.HandleMessage(websocketMessage)
	// We could also attach a function to HandleError, but this fires on routine
	// things like disconnects, so it is undesirable
}
