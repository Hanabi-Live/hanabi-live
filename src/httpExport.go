package main

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
	"github.com/gin-gonic/gin"
)

func httpExport(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the player name from the URL
	tableIDString := c.Param("table")
	if tableIDString == "" {
		http.Error(w, "Error: You must specify a database table ID.", http.StatusNotFound)
		return
	}

	// Validate that it is a number
	var tableID int
	if v, err := strconv.Atoi(tableIDString); err != nil {
		http.Error(w, "Error: That is not a valid database table ID.", http.StatusBadRequest)
		return
	} else {
		tableID = v
	}

	// Check to see if the table exists in the database
	if exists, err := db.Games.Exists(tableID); err != nil {
		log.Error("Failed to check to see if table "+strconv.Itoa(tableID)+" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if !exists {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Get the actions from the database
	var actionStrings []string
	if v, err := db.GameActions.GetAll(tableID); err != nil {
		log.Error("Failed to get the actions from the database "+
			"for table "+strconv.Itoa(tableID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		actionStrings = v
	}

	// Convert the actions
	actions := make([]ActionJSON, 0)
	deck := make([]CardSimple, 0)
	firstPlayer := -1
	for _, actionString := range actionStrings {
		// Convert it from JSON
		var action map[string]interface{}
		if err := json.Unmarshal([]byte(actionString), &action); err != nil {
			log.Error("Failed to unmarshal an action while exporting a table:", err)
			http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
			return
		}

		// Emulate the various actions
		if action["type"] == "turn" && firstPlayer == -1 {
			// Unmarshal the specific action type
			var actionTurn ActionTurn
			if err := json.Unmarshal([]byte(actionString), &actionTurn); err != nil {
				log.Error("Failed to unmarshal a turn action:", err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			firstPlayer = actionTurn.Who

		} else if action["type"] == "clue" {
			// Unmarshal the specific action type
			var actionClue ActionClue
			if err := json.Unmarshal([]byte(actionString), &actionClue); err != nil {
				log.Error("Failed to unmarshal a clue action:", err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			actions = append(actions, ActionJSON{
				Clue:   actionClue.Clue,
				Target: actionClue.Target,
				Type:   actionTypeClue,
			})

		} else if action["type"] == "play" {
			// Unmarshal the specific action type
			var actionPlay ActionPlay
			if err := json.Unmarshal([]byte(actionString), &actionPlay); err != nil {
				log.Error("Failed to unmarshal a play action:", err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			actions = append(actions, ActionJSON{
				Target: actionPlay.Which.Order,
				Type:   actionTypePlay,
			})

		} else if action["type"] == "discard" {
			// Unmarshal the specific action type
			var actionDiscard ActionDiscard
			if err := json.Unmarshal([]byte(actionString), &actionDiscard); err != nil {
				log.Error("Failed to unmarshal a discard action:", err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			// Account for failed plays, which show up in the database as discards,
			// but handily have the "Failed" property set to true
			actionType := actionTypeDiscard
			if actionDiscard.Failed {
				actionType = actionTypePlay
			}

			actions = append(actions, ActionJSON{
				Target: actionDiscard.Which.Order,
				Type:   actionType,
			})
		} else if action["type"] == "deckOrder" {
			// Unmarshal the specific action type
			var actionDeckOrder ActionDeckOrder
			if err := json.Unmarshal([]byte(actionString), &actionDeckOrder); err != nil {
				log.Error("Failed to unmarshal a deckOrder action:", err)
				http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
				return
			}

			deck = actionDeckOrder.Deck
		}
	}
	if len(deck) == 0 {
		text := "Error: You cannot export older tables without the \"deckOrder\" action in it."
		log.Info(text)
		http.Error(w, text, http.StatusBadRequest)
		return
	}

	// Get the notes from the database
	var dbNotes []models.NoteList
	if v, err := db.Games.GetNotes(tableID); err != nil {
		log.Error("Failed to get the notes from the database "+
			"for table "+strconv.Itoa(tableID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		dbNotes = v
	}

	// Get the players from the database
	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(tableID); err != nil {
		log.Error("Failed to get the players from the database for table "+strconv.Itoa(tableID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		dbPlayers = v
	}

	// Convert the players
	players := make([]string, 0)
	for _, p := range dbPlayers {
		players = append(players, p.Name)
	}

	// Convert the notes
	notes := make([][]string, 0)
	for _, noteList := range dbNotes {
		notes = append(notes, noteList.Notes)
	}

	// Get the options from the database
	var options models.Options
	if v, err := db.Games.GetOptions(tableID); err != nil {
		log.Error("Failed to get the options from the database for table "+strconv.Itoa(tableID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		options = v
	}

	// Start to create a JSON table
	t := &GameJSON{
		Actions:     actions,
		Deck:        deck,
		FirstPlayer: firstPlayer,
		Notes:       notes,
		Players:     players,
		Variant:     variantsID[options.Variant],
	}

	c.JSON(http.StatusOK, t)
}
