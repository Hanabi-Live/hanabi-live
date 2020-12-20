package commands

/*
// commandReplayCreate is sent when the user clicks on the "Watch Replay", "Share Replay",
// or "Watch Specific Replay" button
// It means that they want to view the replay of a game from the database or that they are
// submitting arbitrary actions from a hypothetical game
// In order to derive the JSON actions to send to the client,
// we need to play through a mock game using these actions
//
// Example data:
// {
//   source: 'id',
//   databaseID: 15103, // Only if source is "id"
//   json: '{"actions"=[],"deck"=[]}', // Only if source is "json"
//   visibility: 'solo', // Can also be "shared"
// }
func commandReplayCreate(ctx context.Context, s *Session, d *CommandData) {
	// Validate that there is not a password
	if d.Password != "" {
		s.Warning("You cannot create a replay with a password.")
		return
	}

	// Validate the visibility
	if d.Visibility != "solo" && d.Visibility != "shared" {
		s.Warning("That is not a valid replay visibility.")
		return
	}

	if d.Source == "id" {
		// Before creating a new game and emulating the actions,
		// ensure that the ID exists in the database
		if !validateDatabase(s, d) {
			return
		}
	} else if d.Source == "json" {
		// Before creating a new game and emulating the actions,
		// ensure that the submitted JSON does not have any obvious errors
		if !validateJSON(s, d) {
			return
		}
	}

	replayCreate(ctx, s, d)
}

func replayCreate(ctx context.Context, s *Session, d *CommandData) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that the player is not spectating another table
	// (this cannot be in the "commandReplayCreate()" function because we need the tables lock)
	if len(tables.GetTablesUserSpectating(s.UserID)) > 0 {
		s.Warning("You cannot spectate more than one table at a time. Leave your other table before creating a new replay.")
		return
	}

	// If this is a replay of a game in the database,
	// validate that there is not another table open with this table ID
	// For simplicity, we only allow one shared replay of the same table ID at once
	if d.Source == "id" {
		tableList := tables.GetList(false)
		for _, t := range tableList {
			if t.Replay && t.Visible && t.ExtraOptions.DatabaseID == d.DatabaseID {
				commandTableSpectate(ctx, s, &CommandData{ // nolint: exhaustivestruct
					TableID:              t.ID,
					ShadowingPlayerIndex: -1,
					NoTablesLock:         true,
				})
				return
			}
		}
	}

	// Generate the name for the table
	var gameDescription string
	if d.Source == "id" {
		gameDescription = fmt.Sprintf("game #%v", d.DatabaseID)
	} else if d.Source == "json" {
		usernamePossessive := s.Username + "'"
		if !strings.HasSuffix(s.Username, "s") {
			usernamePossessive += "s"
		}
		gameDescription = fmt.Sprintf("%v JSON game", usernamePossessive)
	}
	name := fmt.Sprintf("%v replay for %v", strings.Title(d.Visibility), gameDescription)

	// Create a table
	t := NewTable(name, -1)
	t.Visible = d.Visibility == "shared"

	// Load the options and players
	if d.Source == "id" {
		var dbPlayers []*DBPlayer
		if v, ok := loadDatabaseOptionsToTable(s, d.DatabaseID, t); !ok {
			return
		} else {
			dbPlayers = v
		}

		playerNames := make([]string, 0)
		for _, dbPlayer := range dbPlayers {
			playerNames = append(playerNames, dbPlayer.Name)
		}

		loadFakePlayers(t, playerNames)
	} else if d.Source == "json" {
		loadJSONOptionsToTable(d, t)
		loadFakePlayers(t, d.GameJSON.Players)
	}

	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)

	var replayString string
	if d.Source == "id" {
		replayString = fmt.Sprintf("replay for game %v", d.DatabaseID)
	} else if d.Source == "json" {
		replayString = "JSON replay"
	}

	hLog.Infof(
		"%v %v created a new %v %v.",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
		d.Visibility,
		replayString,
	)
	// (a "table" message will be sent in the "commandTableSpectate" function below)

	// Start the (fake) game
	commandTableStart(ctx, t.Players[0].Session, &CommandData{ // nolint: exhaustivestruct
		TableID:      t.ID,
		NoTableLock:  true,
		NoTablesLock: true,
	})
	g := t.Game
	if g == nil {
		hLog.Errorf("Failed to start the game after loading database game: %v", d.DatabaseID)
		s.Error(constants.CreateGameFail)
		deleteTable(t)
		return
	}

	if !applyNotesToPlayers(s, d, g) {
		deleteTable(t)
		return
	}

	// Handle custom code that is creating replays with no associated session
	// (e.g. only testing for errors when emulating the actions)
	if s == nil {
		deleteTable(t)
		return
	}

	// Do a mini-version of the steps in the "g.End()" function
	t.Replay = true
	g.EndTurn = g.Turn
	g.Turn = 0 // We want to start viewing the replay at the beginning, not the end
	t.Progress = 0

	if d.Source == "id" {
		// Fill in the DatetimeStarted and DatetimeFinished" values from the database
		if v1, v2, err := models.Games.GetDatetimes(t.ExtraOptions.DatabaseID); err != nil {
			hLog.Errorf(
				"Failed to get the datetimes for game %v: %v",
				t.ExtraOptions.DatabaseID,
				err,
			)
			s.Error(constants.CreateGameFail)
			deleteTable(t)
			return
		} else {
			g.DatetimeStarted = v1
			g.DatetimeFinished = v2
		}
	}

	// Join the user to the new replay
	commandTableSpectate(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:              t.ID,
		ShadowingPlayerIndex: -1,
		NoTableLock:          true,
		NoTablesLock:         true,
	})
	t.OwnerID = s.UserID

	// Start the idle timeout
	go t.CheckIdle(ctx)

	// The "commandTableSpectate()" function above sends the user the "tableStart" message
	// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
	// to begin the process of loading the UI and putting them in the game
}

func validateDatabase(s *Session, d *CommandData) bool {
	// Check to see if the game exists in the database
	if exists, err := models.Games.Exists(d.DatabaseID); err != nil {
		hLog.Errorf("Failed to check to see if database ID %v exists: %v", d.DatabaseID, err)
		s.Error(constants.CreateGameFail)
		return false
	} else if !exists {
		s.Warningf("Game %v does not exist in the database.", d.DatabaseID)
		return false
	}

	return true
}

func loadFakePlayers(t *Table, playerNames []string) {
	// Convert the JSON player objects to Player objects
	for i, name := range playerNames {
		// The session ID and the user ID can be any arbitrary unique number,
		// but we set them to -1, -2, etc., so that they will not overlap with any valid user IDs
		id := (i + 1) * -1

		player := &Player{
			UserID:    id,
			Name:      name,
			Session:   NewFakeSession(id, name),
			Present:   true,
			Stats:     &PregameStats{},
			Typing:    false,
			LastTyped: time.Time{},
		}
		t.Players = append(t.Players, player)
	}
}

func applyNotesToPlayers(s *Session, d *CommandData, g *Game) bool {
	var notes [][]string
	if d.Source == "id" {
		// Get the notes from the database
		variant := variants[g.Options.VariantName]
		noteSize := variant.GetDeckSize() + len(variant.Suits)
		if v, err := models.Games.GetNotes(d.DatabaseID, len(g.Players), noteSize); err != nil {
			hLog.Errorf(
				"Failed to get the notes from the database for game %v: %v",
				d.DatabaseID,
				err,
			)
			s.Error(constants.CreateGameFail)
			return false
		} else {
			notes = v
		}
	} else if d.Source == "json" {
		notes = d.GameJSON.Notes
	}

	// Ensure that the note arrays are the correct length
	for len(notes) < len(g.Players) {
		notes = append(notes, make([]string, 0))
	}
	for i := range notes {
		for len(notes[i]) < g.GetNotesSize() {
			notes[i] = append(notes[i], "")
		}
	}

	// Apply the notes
	for i, gp := range g.Players {
		gp.Notes = notes[i]
	}

	return true
}
*/
