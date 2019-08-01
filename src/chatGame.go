package main

import (
	"strconv"
)

/*
	Game chat commands
*/

// /s
func chatGameS(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, len(g.Players)+1)
}

// /s2
func chatGameS2(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 2)
}

// /s3
func chatGameS3(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 3)
}

// /s4
func chatGameS4(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 4)
}

// /s5
func chatGameS5(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 5)
}

// /s6
func chatGameS6(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 6)
}

// /discord
func chatGameDiscord(s *Session, d *CommandData, g *Game) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerGameSend(msg, g.ID)
}

// /pause
func chatGamePause(s *Session, d *CommandData, g *Game) {
	commandPause(s, &CommandData{
		Value: "pause",
	})
}

// /unpause
func chatGameUnpause(s *Session, d *CommandData, g *Game) {
	commandPause(s, &CommandData{
		Value: "unpause",
	})
}

/*
	Subroutines
*/

func automaticStart(s *Session, g *Game, numPlayers int) {
	if g.Running {
		chatServerGameSend("The game is already started, so you cannot use that command.", g.ID)
		return
	}

	if len(g.Players) == numPlayers {
		commandGameStart(s, nil)
	} else {
		g.AutomaticStart = numPlayers
		chatServerGameSend("The game will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", g.ID)
	}
}
