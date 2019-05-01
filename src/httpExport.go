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
	gameIDString := c.Param("game")
	if gameIDString == "" {
		http.Error(w, "Error: You must specify a database game ID.", http.StatusNotFound)
		return
	}

	// Validate that it is a number
	var gameID int
	if v, err := strconv.Atoi(gameIDString); err != nil {
		http.Error(w, "Error: That is not a valid database game ID.", http.StatusBadRequest)
		return
	} else {
		gameID = v
	}

	// Check to see if the game exists in the database
	if exists, err := db.Games.Exists(gameID); err != nil {
		log.Error("Failed to check to see if game "+strconv.Itoa(gameID)+" exists:", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else if !exists {
		http.Error(w, http.StatusText(http.StatusNotFound), http.StatusNotFound)
		return
	}

	// Get the actions from the database
	var actionStrings []string
	if v, err := db.GameActions.GetAll(gameID); err != nil {
		log.Error("Failed to get the actions from the database "+
			"for game "+strconv.Itoa(gameID)+":", err)
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
			log.Error("Failed to unmarshal an action while exporting a game:", err)
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
		text := "Error: You cannot export older games without the \"deckOrder\" action in it."
		log.Info(text)
		http.Error(w, text, http.StatusBadRequest)
		return
	}

	// Get the notes from the database
	var dbNotes []models.NoteList
	if v, err := db.Games.GetNotes(gameID); err != nil {
		log.Error("Failed to get the notes from the database "+
			"for game "+strconv.Itoa(gameID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		dbNotes = v
	}

	// Get the players from the database
	var dbPlayers []*models.Player
	if v, err := db.Games.GetPlayers(gameID); err != nil {
		log.Error("Failed to get the players from the database for game "+strconv.Itoa(gameID)+":", err)
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
	if v, err := db.Games.GetOptions(gameID); err != nil {
		log.Error("Failed to get the options from the database for game "+strconv.Itoa(gameID)+":", err)
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return
	} else {
		options = v
	}

	// Start to create a JSON game
	g := &GameJSON{
		Actions:     actions,
		Deck:        deck,
		FirstPlayer: firstPlayer,
		Notes:       notes,
		Players:     players,
		Variant:     variantsID[options.Variant],
	}

	c.JSON(http.StatusOK, g)
}
