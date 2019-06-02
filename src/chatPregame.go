package main

import (
	"strconv"
)

func chatPregameS(s *Session, d *CommandData, t *Table) {
	automaticStart(s, t, len(t.GameSpec.Players)+1)
}

func chatPregameS3(s *Session, d *CommandData, t *Table) {
	automaticStart(s, t, 3)
}

func chatPregameS4(s *Session, d *CommandData, t *Table) {
	automaticStart(s, t, 4)
}

func chatPregameS5(s *Session, d *CommandData, t *Table) {
	automaticStart(s, t, 5)
}

func chatPregameS6(s *Session, d *CommandData, t *Table) {
	automaticStart(s, t, 6)
}

func automaticStart(s *Session, t *Table, numPlayers int) {
	if len(t.GameSpec.Players) == numPlayers {
		commandGameStart(s, nil)
	} else {
		t.AutomaticStart = numPlayers
		chatServerPregameSend("The table will start as soon as "+strconv.Itoa(numPlayers)+" players have joined.", t.ID)
	}
}

func chatPregameDiscord(s *Session, d *CommandData, t *Table) {
	msg := "Join the Hanabi Discord server: https://discord.gg/FADvkJp"
	chatServerPregameSend(msg, t.ID)
}
