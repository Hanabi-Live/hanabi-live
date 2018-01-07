package main

import (
	"strconv"
)

func debug(s *Session, d *CommandData) {
	// Validate that they are an administrator
	if !s.Admin() {
		return
	}

	// Print out all of the current games
	log.Debug("---------------------------------------------------------------")
	log.Debug("Current games:")
	for i, g := range games { // This is a map[int]*Game
		log.Debug(strconv.Itoa(i) + " - " + g.Name)
		log.Debug(g)
		log.Debug(g.Options)
	}

	// Print out all of the current users
	log.Debug("---------------------------------------------------------------")
	log.Debug("Current users:")
	for i, s2 := range sessions { // This is a map[int]*Session
		log.Debug(strconv.Itoa(i) + " - " + s2.Username() + " - " + s2.Status() + " - " + strconv.Itoa(s2.CurrentGame()))
	}
	log.Debug("---------------------------------------------------------------")
}
