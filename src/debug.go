package main

import (
	"fmt"
	"reflect"
	"strconv"
)

func debug(s *Session, d *CommandData) {
	// Validate that this message was sent from the lobby
	if d.Discord {
		chatServerSend("You can only perform that command from the lobby.")
		return
	}

	// Validate that they are an administrator
	if !s.Admin() {
		chatServerSend("You can only perform that command if you are an administrator.")
		return
	}

	// Print out all of the current games
	log.Debug("---------------------------------------------------------------")
	log.Debug("Current games:")
	for i, g := range games { // This is a map[int]*Game
		log.Debug(strconv.Itoa(i) + " - " + g.Name)

		// Print out all of the fields
		// From: https://stackoverflow.com/questions/24512112/how-to-print-struct-variables-in-console
		s := reflect.ValueOf(g).Elem()
		typeOfT := s.Type()
		for i := 0; i < s.NumField(); i++ {
			f := s.Field(i)
			line := fmt.Sprintf("  %s\t= %v\n", typeOfT.Field(i).Name, f.Interface())
			log.Debug(line)
		}
		log.Debug("\n")

		// Manually enumerate the slices and maps
		log.Debug("  Players:")
		for j, p := range g.Players { // This is a []*Player
			log.Debug("    " + strconv.Itoa(j) + " - User ID: " + strconv.Itoa(p.ID) + ", Username: " + p.Name)
		}
		if len(g.Players) == 0 {
			log.Debug("    [no players]")
		}
		log.Debug("  Spectators:")
		for j, s := range g.Spectators { // This is a []*Session
			log.Debug("    " + strconv.Itoa(j) + " - User ID: " + strconv.Itoa(s.UserID()) + ", Username: " + s.Username())
		}
		if len(g.Spectators) == 0 {
			log.Debug("    [no spectators]")
		}
		log.Debug("  DisconSpectators:")
		for k, v := range g.DisconSpectators { // This is a map[int]*bool
			log.Debug("        User ID: " + strconv.Itoa(k) + " - " + strconv.FormatBool(v))
		}
		if len(g.DisconSpectators) == 0 {
			log.Debug("    [no disconnected spectators]")
		}
	}

	// Print out all of the current users
	log.Debug("---------------------------------------------------------------")
	log.Debug("Current users:")
	for i, s2 := range sessions { // This is a map[int]*Session
		log.Debug("  User ID: " + strconv.Itoa(i) + ", Username: " + s2.Username() + ", Status: " + s2.Status() + ", Current game: " + strconv.Itoa(s2.CurrentGame()))
	}

	// Print out the waiting list
	log.Debug("---------------------------------------------------------------")
	log.Debug("Waiting list:")
	for i, p := range waitingList { // This is a []*models.Waiter
		log.Debug("  " + strconv.Itoa(i) + " - " + p.Username + " - " + p.DiscordMention + " - " + p.DatetimeExpired.String())
	}
	log.Debug("  discordLastAtHere:", discordLastAtHere)

	log.Debug("---------------------------------------------------------------")
}
