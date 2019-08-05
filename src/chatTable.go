package main

import (
	"strconv"
)

/*
	Game chat commands
*/

// /s
func chatS(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, len(t.Players)+1)
}

// /s2
func chatS2(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 2)
}

// /s3
func chatS3(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 3)
}

// /s4
func chatS4(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 4)
}

// /s5
func chatS5(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 5)
}

// /s6
func chatS6(s *Session, d *CommandData, t *Table) {
	automaticStart(s, d, t, 6)
}

// /pause
func chatPause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "pause",
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, t *Table) {
	if d.Room == "lobby" {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	commandPause(s, &CommandData{
		Value: "unpause",
	})
}

/*
	Subroutines
*/

func automaticStart(s *Session, d *CommandData, t *Table, numPlayers int) {
	if t == nil {
		chatServerSend("You can only perform this command while in a game.", d.Room)
		return
	}

	if t.Running {
		chatServerSend("The game is already started, so you cannot use that command.", d.Room)
		return
	}

	if len(t.Players) == numPlayers {
		commandTableStart(s, nil)
	} else {
		t.AutomaticStart = numPlayers
		chatServerSend("The game will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", d.Room)
	}
}
