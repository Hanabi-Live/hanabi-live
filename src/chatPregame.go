package main

import (
	"strconv"
)

/*
	Main pre-game commands
*/

// /s
func chatPregameS(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, len(g.Players)+1)
}

// /s2
func chatPregameS2(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 2)
}

// /s3
func chatPregameS3(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 3)
}

// /s4
func chatPregameS4(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 4)
}

// /s5
func chatPregameS5(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 5)
}

// /s6
func chatPregameS6(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 6)
}

// /discord
func chatPregameDiscord(s *Session, d *CommandData, g *Game) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerPregameSend(msg, g.ID)
}

// /pause
func chatPause(s *Session, d *CommandData, g *Game) {
	commandPause(s, &CommandData{
		Value: "pause",
	})
}

// /unpause
func chatUnpause(s *Session, d *CommandData, g *Game) {
	commandPause(s, &CommandData{
		Value: "unpause",
	})
}

/*
	Subroutines
*/

func automaticStart(s *Session, g *Game, numPlayers int) {
	if len(g.Players) == numPlayers {
		commandGameStart(s, nil)
	} else {
		g.AutomaticStart = numPlayers
		chatServerPregameSend("The game will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", g.ID)
	}
}
