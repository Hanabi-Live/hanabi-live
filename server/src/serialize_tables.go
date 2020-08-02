package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"path"
	"strconv"
	"time"

	"github.com/mitchellh/mapstructure"
)

// serializeTables saves any ongoing tables to disk as JSON files so that they can be restored later
func serializeTables() bool {
	for _, t := range tables {
		logger.Info("Serializing table:", t.ID)

		// Only serialize ongoing games
		if !t.Running || t.Replay {
			logger.Info("Skipping due to it being unstarted or a replay.")
			continue
		}

		// Force all of the spectators to leave, if any
		for _, sp := range t.Spectators {
			s := sp.Session
			if s == nil {
				// A spectator's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s = newFakeSession(sp.ID, sp.Name)
				logger.Info("Created a new fake session in the \"serializeTables()\" function.")
			} else {
				// Boot them from the game
				s.NotifyBoot(t)
			}
			commandTableUnattend(s, &CommandData{
				TableID: t.ID,
			})
		}
		if len(t.Spectators) > 0 {
			t.Spectators = make([]*Spectator, 0)
		}
		if len(t.DisconSpectators) > 0 {
			t.DisconSpectators = make(map[int]struct{})
		}

		// Set all the player sessions to nil, since it is not necessary to serialize those
		for _, p := range t.Players {
			p.Session = nil
			p.Present = false
		}

		// "t.Game.Table", "t.Game.Options", and "t.Game.ExtraOptions" are circular references;
		// we do not have to unset them because we have specified `json:"-"` on their fields,
		// so the JSON encoder will ignore them

		var tableJSON []byte
		if v, err := json.Marshal(t); err != nil {
			logger.Error("Failed to marshal table "+strconv.Itoa(t.ID)+":", err)
			return false
		} else {
			tableJSON = v
		}

		tablePath := path.Join(tablesPath, strconv.Itoa(t.ID)+".json")
		if err := ioutil.WriteFile(tablePath, tableJSON, 0600); err != nil {
			logger.Error("Failed to write the table "+strconv.Itoa(t.ID)+" to "+
				"\""+tablePath+"\":", err)
			return false
		}
	}

	return true
}

// restoreTables recreates tables that were ongoing at the time of the last server restart
// Tables were serialized to flat files in the "tablesPath" directory
func restoreTables() {
	var files []os.FileInfo
	if v, err := ioutil.ReadDir(tablesPath); err != nil {
		log.Fatal("Failed to get the files in the \""+tablesPath+"\" directory: ", err)
		return
	} else {
		files = v
	}

	for _, f := range files {
		if f.Name() == ".gitignore" {
			continue
		}

		tablePath := path.Join(tablesPath, f.Name())
		var tableJSON []byte
		if v, err := ioutil.ReadFile(tablePath); err != nil {
			log.Fatal("Failed to read \""+tablePath+"\":", err)
			return
		} else {
			tableJSON = v
		}

		t := &Table{} // We must initialize the table for "Unmarshal()" to work
		if err := json.Unmarshal(tableJSON, t); err != nil {
			logger.Fatal("Failed to unmarshal \""+tablePath+"\":", err)
			return
		}

		// Restore the circular references that could not be represented in JSON
		g := t.Game
		g.Table = t
		g.Options = t.Options
		g.ExtraOptions = t.ExtraOptions
		for _, gp := range g.Players {
			gp.Game = g
		}

		// Restore the types of the actions
		for i, a := range g.Actions {
			if action, ok := a.(map[string]interface{}); !ok {
				logger.Fatal("Failed to convert the action " + strconv.Itoa(i) + " of table " +
					strconv.Itoa(t.ID) + " to a map.")
			} else if action["type"] == "draw" {
				actionDraw := ActionDraw{}
				if err := mapstructure.Decode(a, &actionDraw); err != nil {
					logger.Fatal("Failed to convert the action " + strconv.Itoa(i) + " of table " +
						strconv.Itoa(t.ID) + " to a draw action.")
				}
				g.Actions[i] = actionDraw
			}
			// (we don't have to bother converting any other actions)
		}

		// Restored tables will never be automatically terminated due to idleness because the
		// "CheckIdle()" function was never initiated; manually do this
		go t.CheckIdle()

		if g.Options.Timed {
			// Give the current player some additional seconds to make up for the fact that they are
			// forced to refresh
			g.Players[g.ActivePlayerIndex].Time += 20 * time.Second

			// Players will never run out of time on restored tables because the "CheckTimer()"
			// function was never initiated; manually do this
			go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayerIndex])
		}

		tables[t.ID] = t
		logger.Info(t.GetName() + "Restored table.")

		if err := os.Remove(tablePath); err != nil {
			logger.Fatal("Failed to delete \""+tablePath+"\":", err)
		}
	}

	// (we do not need to adjust the "newTableID" variable because
	// we have logic to not allow duplicate game IDs)

	if len(tables) == 1 {
		logger.Info("Restored " + strconv.Itoa(len(tables)) + " table.")
	} else if len(tables) >= 2 {
		logger.Info("Restored " + strconv.Itoa(len(tables)) + " tables.")
	}
}
