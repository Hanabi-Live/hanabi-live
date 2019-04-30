package main

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

func debug(s *Session, d *CommandData) {
	if !isAdmin(s, d) {
		return
	}

	debug2()
}

func debug2() {
	log.Debug("---------------------------------------------------------------")

	// Print out all of the current games
	if len(games) == 0 {
		log.Debug("[no current games]")
	}
	for i, g := range games { // This is a map[int]*Game
		log.Debug(strconv.Itoa(i) + " - " + g.Name)
		log.Debug("\n")

		// Print out all of the fields
		// From: https://stackoverflow.com/questions/24512112/how-to-print-struct-variables-in-console
		log.Debug("    All fields:")
		fieldsToIgnore := []string{
			"Actions",
			"Deck",
			"Options",
			"Players",
			"Spectators",
			"DisconSpectators",
		}
		s := reflect.ValueOf(g).Elem()
		maxChars := 0
		for i := 0; i < s.NumField(); i++ {
			fieldName := s.Type().Field(i).Name
			if stringInSlice(fieldName, fieldsToIgnore) {
				continue
			}
			if len(fieldName) > maxChars {
				maxChars = len(fieldName)
			}
		}
		for i := 0; i < s.NumField(); i++ {
			fieldName := s.Type().Field(i).Name
			if stringInSlice(fieldName, fieldsToIgnore) {
				continue
			}
			f := s.Field(i)
			line := "  "
			for i := len(fieldName); i < maxChars; i++ {
				line += " "
			}
			line += "%s = %v"
			line = fmt.Sprintf(line, fieldName, f.Interface())
			if strings.HasSuffix(line, " = ") {
				line += "[empty string]"
			}
			line += "\n"
			log.Debug(line)
		}
		log.Debug("\n")

		// Manually enumerate the slices and maps
		log.Debug("    Options:")
		s2 := reflect.ValueOf(g.Options).Elem()
		maxChars2 := 0
		for i := 0; i < s2.NumField(); i++ {
			fieldName := s2.Type().Field(i).Name
			if len(fieldName) > maxChars2 {
				maxChars2 = len(fieldName)
			}
		}
		for i := 0; i < s2.NumField(); i++ {
			fieldName := s2.Type().Field(i).Name
			f := s2.Field(i)
			line := "    "
			for i := len(fieldName); i < maxChars2; i++ {
				line += " "
			}
			line += "%s = %v"
			line = fmt.Sprintf(line, fieldName, f.Interface())
			if strings.HasSuffix(line, " = ") {
				line += "[empty string]"
			}
			line += "\n"
			log.Debug(line)
		}
		log.Debug("\n")

		log.Debug("    Players:")
		for j, p := range g.Players { // This is a []*Player
			log.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(p.ID) + ", " +
				"Username: " + p.Name + ", " +
				"Present: " + strconv.FormatBool(p.Present))
		}
		if len(g.Players) == 0 {
			log.Debug("        [no players]")
		}
		log.Debug("\n")

		log.Debug("    Spectators:")
		for j, sp := range g.Spectators { // This is a []*Session
			log.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(sp.ID) + ", " +
				"Username: " + sp.Name)
		}
		if len(g.Spectators) == 0 {
			log.Debug("        [no spectators]")
		}
		log.Debug("\n")

		log.Debug("    DisconSpectators:")
		for k, v := range g.DisconSpectators { // This is a map[int]*bool
			log.Debug("        User ID: " + strconv.Itoa(k) + " - " + strconv.FormatBool(v))
		}
		if len(g.DisconSpectators) == 0 {
			log.Debug("        [no disconnected spectators]")
		}
		log.Debug("\n")

		log.Debug("    Chat:")
		for j, m := range g.Chat { // This is a []*GameChatMessage
			log.Debug("        " + strconv.Itoa(j) + " - " +
				"[" + strconv.Itoa(m.UserID) + "] <" + m.Username + "> " + m.Msg)
		}
		if len(g.Chat) == 0 {
			log.Debug("        [no chat]")
		}
		log.Debug("\n")

		log.Debug("---------------------------------------------------------------")
	}

	// Print out all of the current users
	log.Debug("Current users:")
	if len(sessions) == 0 {
		log.Debug("    [no users]")
	}
	for i, s2 := range sessions { // This is a map[int]*Session
		log.Debug("    User ID: " + strconv.Itoa(i) + ", " +
			"Username: " + s2.Username() + ", " +
			"Status: " + strconv.Itoa(s2.Status()) + ", " +
			"Current game: " + strconv.Itoa(s2.CurrentGame()))
	}
	log.Debug("---------------------------------------------------------------")

	// Print out the waiting list
	log.Debug("Waiting list:")
	if len(waitingList) == 0 {
		log.Debug("    [no people on the waiting list]")
	}
	for i, p := range waitingList { // This is a []*models.Waiter
		log.Debug("    " + strconv.Itoa(i) + " - " +
			p.Username + " - " + p.DiscordMention + " - " + p.DatetimeExpired.String())
	}
	log.Debug("    discordLastAtHere:", discordLastAtHere)
	log.Debug("---------------------------------------------------------------")

	//updateBestScores()
}

/*
func updateBestScores() {
	if err := db.UserStats.UpdateAll(variantGetHighestID()); err != nil {
		log.Error("Failed to update the best scores for every user:", err)
	} else {
		log.Info("Updated the best scores for every user.")
	}
}

func variantGetHighestID() int {
	highestID := 0
	for _, v := range variantDefinitions {
		if v.ID > highestID {
			highestID = v.ID
		}
	}
	return highestID
}
*/
