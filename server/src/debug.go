package main

import (
	"fmt"
	"reflect"
	"strconv"
	"strings"
)

var (
	fuckedIDs = make([]int, 0)
)

func debugPrint() {
	logger.Debug("---------------------------------------------------------------")
	logger.Debug("Current total tables:", len(tables))

	numUnstarted := 0
	for _, t := range tables { // This is a map[int]*Table
		if !t.Running {
			numUnstarted++
		}
	}
	logger.Debug("Current unstarted tables:", numUnstarted)

	numRunning := 0
	for _, t := range tables { // This is a map[int]*Table
		if t.Running && !t.Replay {
			numRunning++
		}
	}
	logger.Debug("Current ongoing tables:", numRunning)

	numReplays := 0
	for _, t := range tables { // This is a map[int]*Table
		if t.Replay {
			numReplays++
		}
	}
	logger.Debug("Current replays:", numReplays)

	logger.Debug("---------------------------------------------------------------")
	logger.Debug("Current table list:")
	logger.Debug("---------------------------------------------------------------")

	// Print out all of the current tables
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

		// Manually enumerate the slices and maps
		logger.Debug("    Options:")
		if t.Options == nil {
			logger.Debug("      [Options is nil; this should never happen]")
		} else {
			s2 := reflect.ValueOf(t.Options).Elem()
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
				logger.Debug(line)
			}
		}
		logger.Debug("\n")

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

		logger.Debug("    Spectators (" + strconv.Itoa(len(t.Spectators)) + "):")
		if t.Spectators == nil {
			logger.Debug("      [Spectators is nil; this should never happen]")
		} else {
			for j, sp := range t.Spectators { // This is a []*Session
				logger.Debug("        " + strconv.Itoa(j) + " - " +
					"User ID: " + strconv.Itoa(sp.ID) + ", " +
					"Username: " + sp.Name)
			}
			if len(t.Spectators) == 0 {
				logger.Debug("        [no spectators]")
			}
		}
		logger.Debug("\n")

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

		logger.Debug("    Chat (" + strconv.Itoa(len(t.Chat)) + "):")
		if t.Chat == nil {
			logger.Debug("      [Chat is nil; this should never happen]")
		} else {
			for j, m := range t.Chat { // This is a []*GameChatMessage
				logger.Debug("        " + strconv.Itoa(j) + " - " +
					"[" + strconv.Itoa(m.UserID) + "] <" + m.Username + "> " + m.Msg)
			}
			if len(t.Chat) == 0 {
				logger.Debug("        [no chat]")
			}
		}
		logger.Debug("\n")

		logger.Debug("---------------------------------------------------------------")
	}

	// Print out all of the current users
	logger.Debug("Current users (" + strconv.Itoa(len(sessions)) + "):")
	if len(sessions) == 0 {
		logger.Debug("    [no users]")
	}
	for i, s2 := range sessions { // This is a map[int]*Session
		logger.Debug("    User ID: " + strconv.Itoa(i) + ", " +
			"Username: " + s2.Username() + ", " +
			"Status: " + strconv.Itoa(s2.Status()))
	}
	logger.Debug("---------------------------------------------------------------")
}

func debugFunction() {
	logger.Debug("Executing debug function(s).")

	/*
		updateAllUserStats()
		updateAllVariantStats()
	*/

	// Get all game IDs
	var ids []int
	if v, err := models.Games.GetAllIDs(); err != nil {
		logger.Fatal("Failed to get all of the game IDs:", err)
		return
	} else {
		ids = v
	}

	for i, id := range ids {
		if i > 1000 {
			break
		}
		logger.Debug("ON GAME:", id)
		s := newFakeSession(1, "Server")
		commandReplayCreate(s, &CommandData{
			Source:     "id",
			GameID:     id,
			Visibility: "solo",
		})
		commandTableUnattend(s, &CommandData{
			TableID: newTableID,
		})
	}

	logger.Debug("FUCKED IDS:")
	logger.Debug(fuckedIDs)

	logger.Debug("Debug function(s) complete.")
}

/*
func updateAllUserStats() {
	if err := models.UserStats.UpdateAll(variantGetHighestID()); err != nil {
		logger.Error("Failed to update the stats for every user:", err)
	} else {
		logger.Info("Updated the stats for every user.")
	}
}

func updateAllVariantStats() {
	highestID := variantGetHighestID()
	maxScores := make([]int, 0)
	for i := 0; i <= highestID; i++ {
		maxScores = append(maxScores, variants[variantsID[i]].MaxScore)
	}

	if err := models.VariantStats.UpdateAll(highestID, maxScores); err != nil {
		logger.Error("Failed to update the stats for every variant:", err)
	} else {
		logger.Info("Updated the stats for every variant.")
	}
}

func variantGetHighestID() int {
	highestID := 0
	for k := range variantsID {
		if k > highestID {
			highestID = k
		}
	}
	return highestID
}
*/
