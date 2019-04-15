package main

import (
	"strconv"
)

func chatPregameS(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, len(g.Players)+1)
}

func chatPregameS3(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 3)
}

func chatPregameS4(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 4)
}

func chatPregameS5(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 5)
}

func chatPregameS6(s *Session, d *CommandData, g *Game) {
	automaticStart(s, g, 6)
}

func automaticStart(s *Session, g *Game, numPlayers int) {
	if len(g.Players) == numPlayers {
		commandGameStart(s, nil)
	} else {
		g.AutomaticStart = numPlayers
		chatServerPregameSend("The game will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", g.ID)
	}
}

func chatPregameDiscord(s *Session, d *CommandData, g *Game) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerPregameSend(msg, g.ID)
}
