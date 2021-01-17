package httpmain

import (
	"github.com/gin-gonic/gin"
)

func (m *Manager) export(c *gin.Context) {
	/*
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
		if exists, err := m.models.Games.Exists(c, databaseID); err != nil {
			m.logger.Errorf("Failed to check to see if database ID %v exists: %v", databaseID, err)
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
		var dbPlayers []*models.DBPlayer
		if v, err := m.models.Games.GetPlayers(c, databaseID); err != nil {
			m.logger.Errorf("Failed to get the players from the database for game %v: %v", databaseID, err)
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
		var opts *options.Options
		if v, err := m.models.Games.GetOptions(c, databaseID); err != nil {
			m.logger.Errorf(
				"Failed to get the options from the database for game %v: %v",
				databaseID,
				err,
			)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			opts = v
		}

		// Deck specification for a particular game are not stored in the database
		// Thus, we must recalculate the deck order based on the seed of the game
		// Get the seed from the database
		var seed string
		if v, err := m.models.Games.GetSeed(c, databaseID); err != nil {
			m.logger.Errorf("Failed to get the seed from the database for game %v: %v", databaseID, err)
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
		g := &table.Game{ // nolint: exhaustivestruct
			Options:      opts,
			ExtraOptions: &options.ExtraOptions{},
			Seed:         seed,
		}

		// TODO
		g.InitDeck()
		setSeed(g.Seed) // Seed the random number generator
		g.ShuffleDeck()

		// Get the actions from the database
		var actions []*options.GameAction
		if v, err := m.models.GameActions.GetAll(c, databaseID); err != nil {
			m.logger.Errorf(
				"Failed to get the actions from the database for game %v: %v",
				databaseID,
				err,
			)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			actions = v
		}

		// Get the variant
		var variant *variants.Variant
		if v, err := m.Dispatcher.Variants.GetVariant(g.Options.VariantName); err != nil {
			m.logger.Errorf(
				"Failed to get the variant from the variants map: %v",
				err,
			)
			http.Error(
				w,
				http.StatusText(http.StatusInternalServerError),
				http.StatusInternalServerError,
			)
			return
		} else {
			variant = v
		}

		// Get the notes from the database
		noteSize := variant.GetDeckSize() + len(variant.Suits)
		var notes [][]string
		if v, err := m.models.Games.GetNotes(c, databaseID, len(dbPlayers), noteSize); err != nil {
			m.logger.Errorf("Failed to get the notes from the database for game %v: %v", databaseID, err)
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
		var characterAssignments []*options.CharacterAssignment
		if opts.DetrimentalCharacters {
			// TODO
			// characterAssignments = getCharacterAssignmentsFromDBPlayers(dbPlayers)
			characterAssignments = make([]*options.CharacterAssignment, 0)
		}

		// Create JSON options
		// (we want the pointers to remain nil if the option is the default value
		// so that they are not added to the JSON object)
		optionsJSON := &options.JSON{}
		allDefaultOptions := true
		if opts.StartingPlayer != 0 {
			optionsJSON.StartingPlayer = &opts.StartingPlayer
			allDefaultOptions = false
		}
		if opts.VariantName != variants.DefaultVariantName {
			optionsJSON.Variant = &variant.Name
			allDefaultOptions = false
		}
		if opts.Timed {
			optionsJSON.Timed = &opts.Timed
			optionsJSON.TimeBase = &opts.TimeBase
			optionsJSON.TimePerTurn = &opts.TimePerTurn
			allDefaultOptions = false
		}
		if opts.Speedrun {
			optionsJSON.Speedrun = &opts.Speedrun
			allDefaultOptions = false
		}
		if opts.CardCycle {
			optionsJSON.CardCycle = &opts.CardCycle
			allDefaultOptions = false
		}
		if opts.DeckPlays {
			optionsJSON.DeckPlays = &opts.DeckPlays
			allDefaultOptions = false
		}
		if opts.EmptyClues {
			optionsJSON.EmptyClues = &opts.EmptyClues
			allDefaultOptions = false
		}
		if opts.OneExtraCard {
			optionsJSON.OneExtraCard = &opts.OneExtraCard
			allDefaultOptions = false
		}
		if opts.OneLessCard {
			optionsJSON.OneLessCard = &opts.OneLessCard
			allDefaultOptions = false
		}
		if opts.AllOrNothing {
			optionsJSON.AllOrNothing = &opts.AllOrNothing
			allDefaultOptions = false
		}
		if opts.DetrimentalCharacters {
			optionsJSON.DetrimentalCharacters = &opts.DetrimentalCharacters
			allDefaultOptions = false
		}
		if allDefaultOptions {
			optionsJSON = nil
		}

		// Create a JSON game
		gameJSON := &table.GameJSON{
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
	*/
}
