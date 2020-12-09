package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path"
	"time"

	"github.com/mitchellh/mapstructure"
	"github.com/sasha-s/go-deadlock"
)

// serializeTables saves any ongoing tables to disk as JSON files so that they can be restored later
func serializeTables() bool {
	tableList := tables.GetList(true)
	for _, t := range tableList {
		// t.Lock()
		// TODO: right now, we don't acquire the table lock so that we can save games in case of a
		// deadlock

		// Only serialize ongoing games
		if t.Running && !t.Replay {
			hLog.Infof("Serializing table: %v", t.ID)

			// Several fields on the Table object and the Game object are set with `json:"-"` to prevent
			// the JSON encoder from serializing them
			// Otherwise, we would have to explicitly unset some fields here to avoid circular
			// references, session data, and so forth
			var tableJSON []byte
			if v, err := json.Marshal(t); err != nil {
				hLog.Errorf("Failed to marshal table %v: %v", t.ID, err)
				return false
			} else {
				tableJSON = v
			}

			tableFilename := fmt.Sprintf("%v.json", t.ID)
			tablePath := path.Join(tablesPath, tableFilename)
			if err := ioutil.WriteFile(tablePath, tableJSON, 0600); err != nil {
				hLog.Errorf("Failed to write \"%v\": %v", tablePath, err)
				return false
			}
		}

		// t.Unlock()
		// TODO: right now, we don't acquire the table lock so that we can save games in case of a
		// deadlock
	}

	return true
}

// restoreTables recreates tables that were ongoing at the time of the last server restart
// Tables were serialized to flat files in the "tablesPath" directory
func restoreTables() {
	ctx := NewMiscContext("restoreTables")

	// We first acquire the tables lock so that we can safely modify the tables map
	tables.Lock(ctx)
	defer tables.Unlock(ctx)

	var files []os.FileInfo
	if v, err := ioutil.ReadDir(tablesPath); err != nil {
		hLog.Fatalf("Failed to get the files in the \"%v\" directory: %v", tablesPath, err)
	} else {
		files = v
	}

	if len(files) == 0 {
		hLog.Info("No previously running tables to restore.")
		return
	}

	numTablesRestored := 0
	for _, f := range files {
		if restoreTable(ctx, f) {
			numTablesRestored++
		}
	}

	// (we do not need to adjust the "tableIDCounter" variable because
	// we have logic to not allow duplicate game IDs)

	tableString := "table"
	if numTablesRestored >= 2 {
		tableString += "s"
	}
	hLog.Infof("Restored %v previously running %v.", numTablesRestored, tableString)
}

func restoreTable(ctx context.Context, f os.FileInfo) bool {
	if f.Name() == ".gitignore" {
		return false
	}

	tablePath := path.Join(tablesPath, f.Name())
	var tableJSON []byte
	if v, err := ioutil.ReadFile(tablePath); err != nil {
		hLog.Fatalf("Failed to read file \"%v\": %v", tablePath, err)
	} else {
		tableJSON = v
	}

	t := &Table{} // We must initialize the table for "Unmarshal()" to work
	if err := json.Unmarshal(tableJSON, t); err != nil {
		hLog.Fatalf("Failed to unmarshal file \"%v\": %v", tablePath, err)
	}
	t.Spectators = make([]*Spectator, 0)
	t.KickedPlayers = make(map[int]struct{})
	if t.ChatRead == nil {
		t.ChatRead = make(map[int]int)
	}
	t.mutex = &deadlock.Mutex{}

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
		restoreTableAction(t, i, a)
	}

	for _, p := range t.Players {
		// Ensure that all of the players are not present
		// (they were presumably present and connected when the table serialization happened)
		p.Present = false

		// Restore the player relationships
		tables.AddPlaying(p.UserID, t.ID)
	}

	if g.Options.Timed {
		// Give the current player some additional seconds to make up for the fact that they are
		// forced to refresh
		g.Players[g.ActivePlayerIndex].Time += 20 * time.Second

		// Players will never run out of time on restored tables because the "CheckTimer()"
		// function was never initiated; manually do this
		activePlayer := g.Players[g.ActivePlayerIndex]
		go g.CheckTimer(ctx, activePlayer.Time, g.Turn, g.PauseCount, activePlayer)
	}

	tables.Set(t.ID, t)
	hLog.Infof("%v Restored table.", t.GetName())

	if err := os.Remove(tablePath); err != nil {
		hLog.Fatalf("Failed to delete file \"%v\": %v", tablePath, err)
	}

	// Restored tables will never be automatically terminated due to idleness because the
	// "CheckIdle()" function was never initiated; manually do this
	go t.CheckIdle(ctx)

	return true
}

func restoreTableAction(t *Table, i int, a interface{}) {
	// Local variables
	g := t.Game

	var action map[string]interface{}
	if v, ok := a.(map[string]interface{}); !ok {
		hLog.Fatalf("Failed to convert action %v of table %v to a map.", i, t.ID)
	} else {
		action = v
	}

	actionType := action["type"].(string)

	if actionType == "cardIdentity" {
		actionCardIdentity := ActionCardIdentity{}
		if err := mapstructure.Decode(a, &actionCardIdentity); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionCardIdentity
	} else if actionType == "clue" {
		actionClue := ActionClue{}
		if err := mapstructure.Decode(a, &actionClue); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionClue
	} else if actionType == "discard" {
		actionDiscard := ActionDiscard{}
		if err := mapstructure.Decode(a, &actionDiscard); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionDiscard
	} else if actionType == "draw" {
		actionDraw := ActionDraw{}
		if err := mapstructure.Decode(a, &actionDraw); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionDraw
	} else if actionType == "gameOver" {
		actionGameOver := ActionGameOver{}
		if err := mapstructure.Decode(a, &actionGameOver); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionGameOver
	} else if actionType == "play" {
		actionPlay := ActionPlay{}
		if err := mapstructure.Decode(a, &actionPlay); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionPlay
	} else if actionType == "playerTimes" {
		actionDraw := ActionDraw{}
		if err := mapstructure.Decode(a, &actionDraw); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionDraw
	} else if actionType == "strike" {
		actionStrike := ActionStrike{}
		if err := mapstructure.Decode(a, &actionStrike); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionStrike
	} else if actionType == "status" {
		actionStatus := ActionStatus{}
		if err := mapstructure.Decode(a, &actionStatus); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionStatus
	} else if actionType == "turn" {
		actionTurn := ActionTurn{}
		if err := mapstructure.Decode(a, &actionTurn); err != nil {
			restoreTableActionFatal(i, t.ID, actionType)
		}
		g.Actions[i] = actionTurn
	} else {
		hLog.Fatalf("Table %v had an unknown action type of: %v", t.ID, actionType)
	}
}

func restoreTableActionFatal(i int, tableID uint64, actionType string) {
	hLog.Fatalf(
		"Failed to convert action %v of table %v to a \"%v\" action.",
		i,
		tableID,
		actionType,
	)
}
