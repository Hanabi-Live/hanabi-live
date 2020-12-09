package httpmain

import (
	"net/http"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/gin-gonic/gin"
)

func export(c *gin.Context) {
	// Local variables
	w := c.Writer

	// Parse the game ID from the URL
	databaseIDString := c.Param("databaseID")
	if databaseIDString == "" {
		http.Error(w, "Error: You must specify a database game ID.", http.StatusNotFound)
		return
	}

	// Validate that it is an integer
	var databaseID int
	if v, err := strconv.Atoi(databaseIDString); err != nil {
		http.Error(w, "Error: That is not a valid database game ID.", http.StatusBadRequest)
		return
	} else {
		databaseID = v
	}

	// Check to see if the game exists in the database
	if exists, err := hModels.Games.Exists(databaseID); err != nil {
		hLog.Errorf("Failed to check to see if database ID %v exists: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else if !exists {
		http.Error(w, "Error: That game does not exist in the database.", http.StatusNotFound)
		return
	}

	// Get the players from the database
	var dbPlayers []*DBPlayer
	if v, err := models.Games.GetPlayers(databaseID); err != nil {
		hLog.Errorf("Failed to get the players from the database for game %v: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		dbPlayers = v
	}

	// Make a list of their names
	playerNames := make([]string, 0)
	for _, dbP := range dbPlayers {
		playerNames = append(playerNames, dbP.Name)
	}

	// Get the options from the database
	var options *Options
	if v, err := models.Games.GetOptions(databaseID); err != nil {
		hLog.Errorf("Failed to get the options from the database for game %v: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		options = v
	}

	// Deck specification for a particular game are not stored in the database
	// Thus, we must recalculate the deck order based on the seed of the game
	// Get the seed from the database
	var seed string
	if v, err := models.Games.GetSeed(databaseID); err != nil {
		hLog.Errorf("Failed to get the seed from the database for game %v: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		seed = v
	}

	// Make a deck and shuffle it
	g := &Game{ // nolint: exhaustivestruct
		Options:      options,
		ExtraOptions: &ExtraOptions{},
		Seed:         seed,
	}
	g.InitDeck()
	setSeed(g.Seed) // Seed the random number generator
	g.ShuffleDeck()

	// Get the actions from the database
	var actions []*GameAction
	if v, err := models.GameActions.GetAll(databaseID); err != nil {
		hLog.Errorf("Failed to get the actions from the database for game %v: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		actions = v
	}

	// Get the notes from the database
	variant := variants[g.Options.VariantName]
	noteSize := variant.GetDeckSize() + len(variant.Suits)
	var notes [][]string
	if v, err := models.Games.GetNotes(databaseID, len(dbPlayers), noteSize); err != nil {
		hLog.Errorf("Failed to get the notes from the database for game %v: %v", databaseID, err)
		http.Error(
			w,
			http.StatusText(http.StatusInternalServerError),
			http.StatusInternalServerError,
		)
		return
	} else {
		notes = v
	}

	// Trim off trailing empty notes
	allPlayerNotesEmpty := true
	for i, playerNotes := range notes {
		for len(playerNotes) > 0 && playerNotes[len(playerNotes)-1] == "" {
			playerNotes = playerNotes[:len(playerNotes)-1]
		}
		notes[i] = playerNotes
		if len(playerNotes) > 0 {
			allPlayerNotesEmpty = false
		}
	}
	if allPlayerNotesEmpty {
		notes = nil
	}

	// If this was a game with the "Detrimental Characters" option turned on,
	// make a list of the characters for each player
	var characterAssignments []*CharacterAssignment
	if options.DetrimentalCharacters {
		characterAssignments = getCharacterAssignmentsFromDBPlayers(dbPlayers)
	}

	// Create JSON options
	// (we want the pointers to remain nil if the option is the default value
	// so that they are not added to the JSON object)
	optionsJSON := &OptionsJSON{}
	allDefaultOptions := true
	if options.StartingPlayer != 0 {
		optionsJSON.StartingPlayer = &options.StartingPlayer
		allDefaultOptions = false
	}
	if options.VariantName != variants.DefaultVariantName {
		optionsJSON.Variant = &variant.Name
		allDefaultOptions = false
	}
	if options.Timed {
		optionsJSON.Timed = &options.Timed
		optionsJSON.TimeBase = &options.TimeBase
		optionsJSON.TimePerTurn = &options.TimePerTurn
		allDefaultOptions = false
	}
	if options.Speedrun {
		optionsJSON.Speedrun = &options.Speedrun
		allDefaultOptions = false
	}
	if options.CardCycle {
		optionsJSON.CardCycle = &options.CardCycle
		allDefaultOptions = false
	}
	if options.DeckPlays {
		optionsJSON.DeckPlays = &options.DeckPlays
		allDefaultOptions = false
	}
	if options.EmptyClues {
		optionsJSON.EmptyClues = &options.EmptyClues
		allDefaultOptions = false
	}
	if options.OneExtraCard {
		optionsJSON.OneExtraCard = &options.OneExtraCard
		allDefaultOptions = false
	}
	if options.OneLessCard {
		optionsJSON.OneLessCard = &options.OneLessCard
		allDefaultOptions = false
	}
	if options.AllOrNothing {
		optionsJSON.AllOrNothing = &options.AllOrNothing
		allDefaultOptions = false
	}
	if options.DetrimentalCharacters {
		optionsJSON.DetrimentalCharacters = &options.DetrimentalCharacters
		allDefaultOptions = false
	}
	if allDefaultOptions {
		optionsJSON = nil
	}

	// Create a JSON game
	gameJSON := &GameJSON{
		ID:         databaseID,
		Players:    playerNames,
		Deck:       g.CardIdentities,
		Actions:    actions,
		Options:    optionsJSON,
		Notes:      notes,
		Characters: characterAssignments,
		Seed:       seed,
	}

	c.JSON(http.StatusOK, gameJSON)
}
