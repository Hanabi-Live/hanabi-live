package main

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

// Print out a bunch of debug information about the current state of the server
func print() {
	printCurrentUsers()
	printTableStats()
	printTables()
}

func printCurrentUsers() {
	sessionsMutex.RLock()
	defer sessionsMutex.RUnlock()

	logger.Debug("---------------------------------------------------------------")
	logger.Debug("Current users (" + strconv.Itoa(len(sessions)) + "):")
	if len(sessions) == 0 {
		logger.Debug("    [no users]")
	}
	for i, s2 := range sessions { // This is a map[int]*Session
		logger.Debug("    User ID: " + strconv.Itoa(i) + ", " +
			"Username: " + s2.Username + ", " +
			"Status: " + strconv.Itoa(s2.Status()))
	}
}

func printTableStats() {
	tablesMutex.RLock()
	defer tablesMutex.RUnlock()

	logger.Debug("---------------------------------------------------------------")
	logger.Debug("Current total tables:", len(tables))

	numUnstarted := 0
	numRunning := 0
	numReplays := 0

	for _, t := range tables { // This is a map[int]*Table
		if !t.Running {
			numUnstarted++
		}

		if t.Running && !t.Replay {
			numRunning++
		}

		if t.Replay {
			numReplays++
		}
	}

	logger.Debug("Current unstarted tables:", numUnstarted)
	logger.Debug("Current ongoing tables:", numRunning)
	logger.Debug("Current replays:", numReplays)
}

func printTables() {
	tablesMutex.RLock()
	defer tablesMutex.RUnlock()

	logger.Debug("---------------------------------------------------------------")
	logger.Debug("Current table list:")
	logger.Debug("---------------------------------------------------------------")

	if len(tables) == 0 {
		logger.Debug("[no current tables]")
	}

	for tableID, t := range tables { // This is a map[int]*Table
		logger.Debug(strconv.FormatUint(tableID, 10) + " - " + t.Name)
		logger.Debug("\n")

		// Print out all of the fields
		// https://stackoverflow.com/questions/24512112/how-to-print-struct-variables-in-console
		logger.Debug("    All fields:")
		fieldsToIgnore := []string{
			"Players",
			"Spectators",
			"DisconSpectators",
			"Options",
			"ExtraOptions",
			"Chat",
		}
		s := reflect.ValueOf(t).Elem()
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
			logger.Debug(line)
		}
		logger.Debug("\n")

		printTablePlayers(t)
		printTableSpectators(t)
		printTableDisconSpectators(t)
		printTableOptions(t)
		printTableExtraOptions(t)
		printTableChat(t)

		logger.Debug("---------------------------------------------------------------")
	}
}

func printTablePlayers(t *Table) {
	logger.Debug("    Players (" + strconv.Itoa(len(t.Players)) + "):")
	if t.Players == nil {
		logger.Debug("      [Players is nil; this should never happen]")
	} else {
		for j, p := range t.Players { // This is a []*Player
			logger.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(p.ID) + ", " +
				"Username: " + p.Name + ", " +
				"Present: " + strconv.FormatBool(p.Present))
		}
		if len(t.Players) == 0 {
			logger.Debug("        [no players]")
		}
	}
	logger.Debug("\n")
}

func printTableSpectators(t *Table) {
	logger.Debug("    Spectators (" + strconv.Itoa(len(t.Spectators)) + "):")
	if t.Spectators == nil {
		logger.Debug("      [Spectators is nil; this should never happen]")
	} else {
		for j, sp := range t.Spectators { // This is a []*Spectator
			logger.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(sp.ID) + ", " +
				"Username: " + sp.Name)
		}
		if len(t.Spectators) == 0 {
			logger.Debug("        [no spectators]")
		}
	}
	logger.Debug("\n")
}

func printTableDisconSpectators(t *Table) {
	logger.Debug("    DisconSpectators (" + strconv.Itoa(len(t.DisconSpectators)) + "):")
	if t.DisconSpectators == nil {
		logger.Debug("      [DisconSpectators is nil; this should never happen]")
	} else {
		for k := range t.DisconSpectators { // This is a map[int]struct{}
			logger.Debug("        User ID: " + strconv.Itoa(k))
		}
		if len(t.DisconSpectators) == 0 {
			logger.Debug("        [no disconnected spectators]")
		}
	}
	logger.Debug("\n")
}

func printTableOptions(t *Table) {
	logger.Debug("    Options:")
	if t.Options == nil {
		logger.Debug("      [Options is nil; this should never happen]")
	} else {
		s := reflect.ValueOf(t.Options).Elem()
		printTableSubField(s)
	}
	logger.Debug("\n")
}

func printTableExtraOptions(t *Table) {
	logger.Debug("    ExtraOptions:")
	if t.ExtraOptions == nil {
		logger.Debug("      [ExtraOptions is nil; this should never happen]")
	} else {
		s := reflect.ValueOf(t.ExtraOptions).Elem()
		printTableSubField(s)
	}
	logger.Debug("\n")
}

func printTableSubField(s reflect.Value) {
	maxChars := 0
	for i := 0; i < s.NumField(); i++ {
		fieldName := s.Type().Field(i).Name
		if len(fieldName) > maxChars {
			maxChars = len(fieldName)
		}
	}
	for i := 0; i < s.NumField(); i++ {
		fieldName := s.Type().Field(i).Name
		f := s.Field(i)
		line := "    "
		for i := len(fieldName); i < maxChars; i++ {
			line += " "
		}
		line += "%s = %v"
		line = fmt.Sprintf(line, fieldName, f.Interface())
		if strings.HasSuffix(line, " = ") {
			line += "[empty string]"
		}
		line += "\n"
		logger.Debug(line)
	}
}

func printTableChat(t *Table) {
	logger.Debug("    Chat (" + strconv.Itoa(len(t.Chat)) + "):")
	if t.Chat == nil {
		logger.Debug("      [Chat is nil; this should never happen]")
	} else {
		for j, m := range t.Chat { // This is a []*TableChatMessage
			msg := "        " + strconv.Itoa(j) + " - " +
				"[Server: " + strconv.FormatBool(m.Server) + "] " +
				"[User ID: " + strconv.Itoa(m.UserID) + "] " +
				"<" + m.Username + "> " + m.Msg
			logger.Debug(msg)
		}
		if len(t.Chat) == 0 {
			logger.Debug("        [no chat]")
		}
	}
	logger.Debug("\n")
}
