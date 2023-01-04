package main

import (
	"context"
	"fmt"
	"reflect"
	"strconv"
	"strings"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// Print out a bunch of debug information about the current state of the server
func print(ctx context.Context) {
	tableList := tables.GetList(true)

	printLine()
	logger.Debug("*** PRINTING EVERYTHING ***")
	printLine()
	printCurrentUsers()
	printLine()
	printTableStats(ctx, tableList)
	printLine()
	printTables(ctx, tableList)
	printLine()
	printUserRelationships(ctx)
	printLine()
}

func printCurrentUsers() {
	sessionList := sessions.GetList()

	logger.Debug("Current users (" + strconv.Itoa(len(sessionList)) + "):")
	if len(sessionList) == 0 {
		logger.Debug("    [no users]")
	}
	for i, s2 := range sessionList {
		logger.Debug("    User ID: " + strconv.Itoa(i) + ", " +
			"Username: " + s2.Username + ", " +
			"Status: " + strconv.Itoa(s2.Status()))
	}
}

func printTableStats(ctx context.Context, tableList []*Table) {
	logger.Debug("Current total tables: " + strconv.Itoa(len(tableList)))

	numUnstarted := 0
	numRunning := 0
	numReplays := 0

	for _, t := range tableList {
		t.Lock(ctx)

		if !t.Running {
			numUnstarted++
		}

		if t.Running && !t.Replay {
			numRunning++
		}

		if t.Replay {
			numReplays++
		}

		t.Unlock(ctx)
	}

	logger.Debug("Current unstarted tables: " + strconv.Itoa(numUnstarted))
	logger.Debug("Current ongoing tables: " + strconv.Itoa(numRunning))
	logger.Debug("Current replays: " + strconv.Itoa(numReplays))
}

func printTables(ctx context.Context, tableList []*Table) {
	logger.Debug("Current table list:")

	if len(tableList) == 0 {
		logger.Debug("[no current tables]")
	}

	for _, t := range tableList {
		printLine()

		t.Lock(ctx)

		logger.Debug(strconv.FormatUint(t.ID, 10) + " - " + t.Name)
		logger.Debug("\n")

		// Print out all of the fields
		// https://stackoverflow.com/questions/24512112/how-to-print-struct-variables-in-console
		logger.Debug("    All fields:")
		fieldsToIgnore := []string{
			"Players",
			"Spectators",
			"Options",
			"ExtraOptions",
			"Chat",
			"mutex",
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
		printTableOptions(t)
		printTableExtraOptions(t)
		printTableChat(t)

		t.Unlock(ctx)
	}
}

func printTablePlayers(t *Table) {
	logger.Debug("    Players (" + strconv.Itoa(len(t.Players)) + "):")
	if t.Players == nil {
		logger.Debug("      [Players is nil; this should never happen]")
	} else {
		for j, p := range t.Players { // This is a []*Player
			logger.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(p.UserID) + ", " +
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
	logger.Debug("    Spectators (" + strconv.Itoa(len(t.ActiveSpectators())) + "):")
	if t.Spectators == nil {
		logger.Debug("      [Spectators is nil; this should never happen]")
	} else {
		for j, sp := range t.ActiveSpectators() { // This is a []*Spectator
			logger.Debug("        " + strconv.Itoa(j) + " - " +
				"User ID: " + strconv.Itoa(sp.UserID) + ", " +
				"Username: " + sp.Name)
		}
		if len(t.ActiveSpectators()) == 0 {
			logger.Debug("        [no spectators]")
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

func printUserRelationships(ctx context.Context) {
	logger.Debug("Current user to table relationships:")
	printLine()

	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	tables.PrintPlaying()
	tables.PrintSpectating()
	tables.PrintDisconSpectating()
}

func printLine() {
	logger.Debug("------------------------------------")
}
