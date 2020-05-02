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

// restoreTables recreates tables that were ongoing at the time of the last server restart
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

		// If this is a timed game, give the current player some additional seconds
		// to make up for the fact that they are forced to refresh
		if g.Options.Timed {
			g.Players[g.ActivePlayer].Time += 20 * time.Second
		}

		tables[t.ID] = t
		logger.Info(t.GetName() + "Restored table.")

		if err := os.Remove(tablePath); err != nil {
			logger.Fatal("Failed to delete \""+tablePath+"\":", err)
		}
	}

	// (we do not need to adjust the "newTableID" variable because
	// we have logic to not allow duplicate game IDs)
}
