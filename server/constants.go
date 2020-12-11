package main

import (
	"time"
)

const (
	// The amount of time that players have to finish their game once
	// a server shutdown or restart is initiated
	ShutdownTimeout = time.Minute * 30

	// The amount of time that a game is inactive before it is killed by the server
	IdleGameTimeout = time.Minute * 30
)
