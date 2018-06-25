package main

import (
	"time"
)

var (
	startingTime = 2 * time.Minute  // The amount of time that each player starts with
	timePerTurn  = 20 * time.Second // The amount of extra time a player gets after making a move

	idleTimeout = time.Minute * 30 // The amount of time that a game is inactive before it is killed by the server
)
