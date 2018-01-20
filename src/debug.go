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
		log.Debug("   ", g)
		log.Debug("    Options:")
		log.Debug("       ", g.Options)
		log.Debug("    Players:")
		for j, p := range g.Players { // This is a map[int]*Player
			log.Debug("        " + strconv.Itoa(j) + " - " + p.Name)
		}
		if len(g.Players) == 0 {
			log.Debug("        [no players]")
		}
		log.Debug("    Spectators:")
		for j, s := range g.Spectators { // This is a map[int]*Session
			log.Debug("        " + strconv.Itoa(j) + " - " + s.Username())
		}
		if len(g.Spectators) == 0 {
			log.Debug("        [no spectators]")
		}
		log.Debug("    DisconSpectators:")
		for j := range g.DisconSpectators { // This is a map[int]*bool
			log.Debug("        " + strconv.Itoa(j))
		}
		if len(g.DisconSpectators) == 0 {
			log.Debug("        [no disconnected spectators]")
		}
	}

	// Print out all of the current users
	log.Debug("---------------------------------------------------------------")
	log.Debug("Current users:")
	for i, s2 := range sessions { // This is a map[int]*Session
		log.Debug(strconv.Itoa(i) + " - " + s2.Username() + " - " + s2.Status() + " - " + strconv.Itoa(s2.CurrentGame()))
	}
	log.Debug("---------------------------------------------------------------")
}
