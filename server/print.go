package main

import (
	"context"
	"fmt"
	"reflect"
	"strings"

	"github.com/Zamiell/hanabi-live/server/pkg/sessions"
)

// Print out a bunch of debug information about the current state of the server
func print(ctx context.Context) {
	sessionList := sessionsManager.GetList()
	tableList := tables.GetList(true)

	printLine()
	hLog.Debug("*** PRINTING EVERYTHING ***")
	printLine()
	printCurrentUsers(sessionList)
	printLine()
	printTableStats(ctx, tableList)
	printLine()
	printTables(ctx, tableList)
	printLine()
	printUserRelationships(ctx)
	printLine()
}

func printCurrentUsers(sessionList []*sessions.Description) {
	hLog.Debugf("Current users (%v):", len(sessionList))
	if len(sessionList) == 0 {
		hLog.Debug("    [no users]")
	}
	for i, s := range sessionList {
		hLog.Debugf("    User ID: %v, Username: %v, Status: %v", i, s.Username, s.Status)
	}
}

func printTableStats(ctx context.Context, tableList []*Table) {
	hLog.Debugf("Current total tables: %v", len(tableList))

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

	hLog.Debugf("Current unstarted tables: %v", numUnstarted)
	hLog.Debugf("Current ongoing tables: %v", numRunning)
	hLog.Debugf("Current replays: %v", numReplays)
}

func printTables(ctx context.Context, tableList []*Table) {
	hLog.Debug("Current tables list:")

	if len(tableList) == 0 {
		hLog.Debug("[no current tables]")
	}

	for _, t := range tableList {
		printLine()

		t.Lock(ctx)

		hLog.Debugf("%v - %v", t.ID, t.Name)
		hLog.Debug("\n")

		// Print out all of the fields
		// https://stackoverflow.com/questions/24512112/how-to-print-struct-variables-in-console
		hLog.Debug("    All fields:")
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
			line += fmt.Sprintf("%v = %v", fieldName, f.Interface())
			if strings.HasSuffix(line, " = ") {
				line += "[empty string]"
			}
			line += "\n"
			hLog.Debug(line)
		}
		hLog.Debug("\n")

		printTablePlayers(t)
		printTableSpectators(t)
		printTableOptions(t)
		printTableExtraOptions(t)
		printTableChat(t)

		t.Unlock(ctx)
	}
}

func printTablePlayers(t *Table) {
	hLog.Debugf("    Players (%v):", len(t.Players))
	if t.Players == nil {
		hLog.Debug("      [Players is nil; this should never happen]")
	} else {
		for j, p := range t.Players { // This is a []*Player
			hLog.Debugf(
				"        %v - User ID: %v, Username: %v, Present: %v",
				j,
				p.UserID,
				p.Name,
				p.Present,
			)
		}
		if len(t.Players) == 0 {
			hLog.Debug("        [no players]")
		}
	}
	hLog.Debug("\n")
}

func printTableSpectators(t *Table) {
	hLog.Debugf("    Spectators (%v):", len(t.Spectators))
	if t.Spectators == nil {
		hLog.Debug("      [Spectators is nil; this should never happen]")
	} else {
		for j, sp := range t.Spectators { // This is a []*Spectator
			hLog.Debugf("        %v - User ID: %v, Username: %v", j, sp.UserID, sp.Name)
		}
		if len(t.Spectators) == 0 {
			hLog.Debug("        [no spectators]")
		}
	}
	hLog.Debug("\n")
}

func printTableOptions(t *Table) {
	hLog.Debug("    Options:")
	if t.Options == nil {
		hLog.Debug("      [Options is nil; this should never happen]")
	} else {
		s := reflect.ValueOf(t.Options).Elem()
		printTableSubField(s)
	}
	hLog.Debug("\n")
}

func printTableExtraOptions(t *Table) {
	hLog.Debug("    ExtraOptions:")
	if t.ExtraOptions == nil {
		hLog.Debug("      [ExtraOptions is nil; this should never happen]")
	} else {
		s := reflect.ValueOf(t.ExtraOptions).Elem()
		printTableSubField(s)
	}
	hLog.Debug("\n")
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
		line += fmt.Sprintf("%v = %v", fieldName, f.Interface())
		if strings.HasSuffix(line, " = ") {
			line += "[empty string]"
		}
		line += "\n"
		hLog.Debug(line)
	}
}

func printTableChat(t *Table) {
	hLog.Debugf("    Chat (%v):", len(t.Chat))
	if t.Chat == nil {
		hLog.Debug("      [Chat is nil; this should never happen]")
	} else {
		for j, m := range t.Chat { // This is a []*ChatMessage
			hLog.Debugf(
				"        %v - [Server: %v] [User ID: %v] <%v> %v",
				j,
				m.Server,
				m.UserID,
				m.Username,
				m.Msg,
			)
		}
		if len(t.Chat) == 0 {
			hLog.Debug("        [no chat]")
		}
	}
	hLog.Debug("\n")
}

func printUserRelationships(ctx context.Context) {
	hLog.Debug("Current user to table relationships:")
	printLine()

	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	tables.PrintPlaying()
	tables.PrintSpectating()
	tables.PrintDisconSpectating()
}

func printLine() {
	hLog.Debug("------------------------------------")
}
