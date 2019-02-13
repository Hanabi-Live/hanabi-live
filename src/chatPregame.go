package main

import "strconv"

func chatPregameS(s *Session, d *CommandData, g *Game) {
	g.AutomaticStart = len(g.Players) + 1
	chatServerPregameSend("The game will start as soon as "+strconv.Itoa(g.AutomaticStart)+
		" players have joined.", g.ID)
}

func chatPregameS3(s *Session, d *CommandData, g *Game) {
	g.AutomaticStart = 3
	chatServerPregameSend("The game will start as soon as 3 players have joined.", g.ID)
}

func chatPregameS4(s *Session, d *CommandData, g *Game) {
	g.AutomaticStart = 4
	chatServerPregameSend("The game will start as soon as 4 players have joined.", g.ID)
}

func chatPregameS5(s *Session, d *CommandData, g *Game) {
	g.AutomaticStart = 5
	chatServerPregameSend("The game will start as soon as 5 players have joined.", g.ID)
}

func chatPregameS6(s *Session, d *CommandData, g *Game) {
	g.AutomaticStart = 6
	chatServerPregameSend("The game will start as soon as 6 players have joined.", g.ID)
}
