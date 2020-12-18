package commands

import (
	"regexp"

	"github.com/Zamiell/hanabi-live/server/pkg/options"
)

const (
	// This is the maximum number of characters that a table name can be.
	MaxTableNameLength = 45
)

var (
	isValidTableName = regexp.MustCompile(`^[a-zA-Z0-9 !@#$\(\)\-_=\+;:,\.\?]+$`).MatchString
)

type tableCreateData struct {
	name     string
	options  *options.Options
	password string
}

// SpecialGameData is data relating to tables created with a special custom prefix (e.g. "!seed").
type SpecialGameData struct {
	DatabaseID       int
	CustomNumPlayers int
	CustomActions    []*options.GameAction

	SetSeedSuffix string
	SetReplay     bool
	SetReplayTurn int
}

// tableCreate is sent when the user submits the "Create a New Game" form.
func (m *Manager) tableCreate(userID int, data interface{}) {
	var d *tableCreateData
	if v, ok := data.(*tableCreateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(d.name)

	// TODO
	/*
		// Validate that the server is not about to go offline
		if checkImminentShutdown(s) {
			return
		}

		// Validate that the server is not undergoing maintenance
		if maintenanceMode.IsSet() {
			s.Warning("The server is undergoing maintenance. You cannot start any new games for the time being.")
			return
		}
	*/

	/*

		// Truncate long table names
		// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
		if len(d.Name) > MaxGameNameLength {
			d.Name = d.Name[0 : MaxGameNameLength-1]
		}

		// Remove any non-printable characters, if any
		d.Name = removeNonPrintableCharacters(d.Name)

		// Trim whitespace from both sides
		d.Name = strings.TrimSpace(d.Name)

		// Make a default game name if they did not provide one
		if len(d.Name) == 0 {
			d.Name = getName()
		}

		// Check for non-ASCII characters
		if !containsAllPrintableASCII(d.Name) {
			s.Warning("Game names can only contain ASCII characters.")
			return
		}

		// Validate that the game name does not contain any special characters
		// (this mitigates XSS attacks)
		if !isValidTableName(d.Name) {
			msg := "Game names can only contain English letters, numbers, spaces, " +
				"<code>!</code>, " +
				"<code>@</code>, " +
				"<code>#</code>, " +
				"<code>$</code>, " +
				"<code>(</code>, " +
				"<code>)</code>, " +
				"<code>-</code>, " +
				"<code>_</code>, " +
				"<code>=</code>, " +
				"<code>+</code>, " +
				"<code>;</code>, " +
				"<code>:</code>, " +
				"<code>,</code>, " +
				"<code>.</code>, " +
				"and <code>?</code>."
			s.Warning(msg)
			return
		}

		// Set default values for data relating to tables created with a special prefix or custom data
		data := &SpecialGameData{
			DatabaseID:       -1, // Normally, the database ID of an ongoing game should be -1
			CustomNumPlayers: 0,
			CustomActions:    nil,

			SetSeedSuffix: "",
			SetReplay:     false,
			SetReplayTurn: 0,
		}

		// Handle special game option creation
		if strings.HasPrefix(d.Name, "!") {
			if d.GameJSON != nil {
				s.Warning("You cannot create a table with a special prefix if JSON data is also provided.")
				return
			}

			args := strings.Split(d.Name, " ")
			command := args[0]
			args = args[1:] // This will be an empty slice if there is nothing after the command
			command = strings.TrimPrefix(command, "!")
			command = strings.ToLower(command) // Commands are case-insensitive

			if command == "seed" {
				// !seed - Play a specific seed
				if len(args) != 1 {
					s.Warning("Games on specific seeds must be created in the form: !seed [seed number]")
					return
				}

				// For normal games, the server creates seed suffixes sequentially from 0, 1, 2,
				// and so on
				// However, the seed does not actually have to be a number,
				// so allow the user to use any arbitrary string as a seed suffix
				data.SetSeedSuffix = args[0]
			} else if command == "replay" {
				// !replay - Replay a specific game up to a specific turn
				if len(args) != 1 && len(args) != 2 {
					s.Warning("Replays of specific games must be created in the form: !replay [game ID] [turn number]")
					return
				}

				if v, err := strconv.Atoi(args[0]); err != nil {
					s.Warningf("The game ID of \"%v\" is not an integer.", args[0])
					return
				} else {
					data.DatabaseID = v
				}

				// Check to see if the game ID exists on the server
				if exists, err := models.Games.Exists(data.DatabaseID); err != nil {
					hLog.Errorf("Failed to check to see if game %v exists: %v", data.DatabaseID, err)
					s.Error(CreateGameFail)
					return
				} else if !exists {
					s.Warningf("The game ID of %v does not exist in the database.", data.DatabaseID)
					return
				}

				if len(args) == 1 {
					data.SetReplayTurn = 1
				} else {
					if v, err := strconv.Atoi(args[1]); err != nil {
						s.Warningf("The turn of \"%v\" is not an integer.", args[1])
						return
					} else {
						data.SetReplayTurn = v
					}

					if data.SetReplayTurn < 1 {
						s.Warning("The replay turn must be greater than 0.")
						return
					}
				}

				// We have to minus the turn by one since turns are stored on the server starting at 0
				// and turns are shown to the user starting at 1
				data.SetReplayTurn--

				// Check to see if this turn is valid
				// (it has to be a turn before the game ends)
				var numTurns int
				if v, err := models.Games.GetNumTurns(data.DatabaseID); err != nil {
					hLog.Errorf(
						"Failed to get the number of turns from the database for game %v: %v",
						data.DatabaseID,
						err,
					)
					s.Error(InitGameFail)
					return
				} else {
					numTurns = v
				}
				if data.SetReplayTurn >= numTurns {
					s.Warningf("Game %v only has %v turns.", data.DatabaseID, numTurns)
					return
				}

				data.SetReplay = true
			} else {
				s.Warning("You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command.")
				return
			}
		}

		// Validate that they sent the options object
		if d.Options == nil {
			d.Options = NewOptions()
		}

		// Validate that the variant name is valid
		// (and store the variant ID on the options object)
		if variant, ok := variants[d.Options.VariantName]; !ok {
			s.Warningf("\"%v\" is not a valid variant.", d.Options.VariantName)
			return
		} else {
			d.Options.VariantID = variant.ID
		}

		// Validate that the time controls are sane
		if d.Options.Timed {
			if d.Options.TimeBase <= 0 {
				s.Warningf("\"%v\" is too small of a value for \"Base Time\".", d.Options.TimeBase)
				return
			}
			if d.Options.TimeBase > 604800 { // 1 week in seconds
				s.Warningf("\"%v\" is too large of a value for \"Base Time\".", d.Options.TimeBase)
				return
			}
			if d.Options.TimePerTurn <= 0 {
				s.Warningf(
					"\"%v\" is too small of a value for \"Time per Turn\".",
					d.Options.TimePerTurn,
				)
				return
			}
			if d.Options.TimePerTurn > 86400 { // 1 day in seconds
				s.Warningf(
					"\"%v\" is too large of a value for \"Time per Turn\".",
					d.Options.TimePerTurn,
				)
				return
			}
		}

		// Validate that there can be no time controls if this is not a timed game
		if !d.Options.Timed {
			d.Options.TimeBase = 0
			d.Options.TimePerTurn = 0
		}

		// Validate that a speedrun cannot be timed
		if d.Options.Speedrun {
			d.Options.Timed = false
			d.Options.TimeBase = 0
			d.Options.TimePerTurn = 0
		}

		// Validate that they did not send both the "One Extra Card" and the "One Less Card" option at
		// the same time (they effectively cancel each other out)
		if d.Options.OneExtraCard && d.Options.OneLessCard {
			d.Options.OneExtraCard = false
			d.Options.OneLessCard = false
		}

		// Validate games with custom JSON
		if d.GameJSON != nil {
			if !validateJSON(s, d) {
				return
			}
		}

		tableCreate(ctx, s, d, data)

	*/
}

/*
func tableCreate2(ctx context.Context, s *Session, d *CommandData, data *SpecialGameData) {
	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that the player is not joined to another table
	// (this cannot be in the "commandTableCreate()" function because we need the tables lock)
	if !strings.HasPrefix(s.Username, "Bot-") {
		if len(tables.GetTablesUserPlaying(s.UserID)) > 0 {
			s.Warning("You cannot join more than one table at a time. Terminate your other game before creating a new one.")
			return
		}
	}

	passwordHash := ""
	if d.Password != "" {
		// Create an Argon2id hash of the plain-text password
		if v, err := argon2id.CreateHash(d.Password, argon2id.DefaultParams); err != nil {
			hLog.Errorf("Failed to create a hash from the submitted table password: %v", err)
			s.Error(CreateGameFail)
			return
		} else {
			passwordHash = v
		}
	}

	t := NewTable(d.Name, s.UserID)
	t.Lock(ctx)
	defer t.Unlock(ctx)
	t.Visible = !d.HidePregame
	t.PasswordHash = passwordHash
	t.Options = d.Options
	t.ExtraOptions = &ExtraOptions{
		DatabaseID:                 data.DatabaseID,
		NoWriteToDatabase:          false,
		JSONReplay:                 false,
		CustomNumPlayers:           data.CustomNumPlayers,
		CustomCharacterAssignments: nil,
		CustomSeed:                 "",
		CustomDeck:                 nil,
		CustomActions:              nil,
		Restarted:                  false,
		SetSeedSuffix:              data.SetSeedSuffix,
		SetReplay:                  false,
		SetReplayTurn:              0,
	}

	// If this is a "!replay" game, override the options with the ones found in the database
	if data.SetReplay {
		if _, success := loadDatabaseOptionsToTable(s, data.DatabaseID, t); !success {
			return
		}

		// "loadJSONOptionsToTable()" sets the database ID to a positive number
		// The database ID for an ongoing game should be set to -1
		t.ExtraOptions.DatabaseID = -1

		// "loadDatabaseOptionsToTable()" marks that the game should not be written to the database,
		// which is not true in this special case
		t.ExtraOptions.NoWriteToDatabase = false

		// "loadDatabaseOptionsToTable()" does not specify the "!replay" options
		t.ExtraOptions.SetReplay = data.SetReplay
		t.ExtraOptions.SetReplayTurn = data.SetReplayTurn
	}

	// If the user specified JSON data,
	// override the options with the ones specified in the JSON data
	if d.GameJSON != nil {
		loadJSONOptionsToTable(d, t)

		// "loadJSONOptionsToTable()" sets the database ID to 0, which corresponds to a JSON replay
		// The database ID for an ongoing game should be set to -1
		t.ExtraOptions.DatabaseID = -1

		// "loadJSONOptionsToTable()" marks that the game should not be written to the database,
		// which is not true in this special case
		t.ExtraOptions.NoWriteToDatabase = false

		// "loadJSONOptionsToTable()" marks that the game is a JSON replay,
		// which is not true in this special case
		t.ExtraOptions.JSONReplay = false
	}

	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)

	hLog.Infof(
		"%v %v created a table.",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
	)
	// (a "table" message will be sent in the "commandTableJoin" function below)

	// Log a chat message so that future players can see a timestamp of when the table was created
	msg := fmt.Sprintf("%v created the table.", s.Username)
	chatServerSend(ctx, msg, t.GetRoomName(), true)

	// If the server is shutting down / restarting soon, warn the players
	if shuttingDown.IsSet() {
		timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())

		msg := fmt.Sprintf(
			"The server is shutting down in %v minutes. Keep in mind that if your game is not finished in time, it will be terminated.",
			minutesLeft,
		)
		chatServerSend(ctx, msg, t.GetRoomName(), true)
	}

	// Join the user to the new table
	commandTableJoin(ctx, s, &CommandData{ // nolint: exhaustivestruct
		TableID:      t.ID,
		Password:     d.Password,
		NoTableLock:  true,
		NoTablesLock: true,
	})
}
*/
