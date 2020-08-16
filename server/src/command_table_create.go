package main

import (
	"strconv"
	"strings"
	"time"

	"github.com/alexedwards/argon2id"
)

const (
	// The maximum number of characters that a game name can be
	MaxGameNameLength = 45
)

// commandTableCreate is sent when the user submits the "Create a New Game" form
//
// Example data:
// {
//   name: 'my new table',
//   options: {
//     variant: 'No Variant',
//     [other options omitted; see "Options.ts"]
//   },
//   password: 'super_secret',
// }
func commandTableCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the server is not about to go offline
	if checkImminentShutdown(s) {
		return
	}

	// Validate that the server is not undergoing maintenance
	if maintenanceMode.IsSet() {
		s.Warning("The server is undergoing maintenance. " +
			"You cannot start any new games for the time being.")
		return
	}

	// Validate that the player is not joined to another table
	if !strings.HasPrefix(s.Username(), "Bot-") {
		if t2 := s.GetJoinedTable(); t2 != nil {
			s.Warning("You cannot join more than one table at a time. " +
				"Terminate your other game before creating a new one.")
			return
		}
	}

	// Truncate long table names
	// (we do this first to prevent wasting CPU cycles on validating extremely long table names)
	if len(d.Name) > MaxGameNameLength {
		d.Name = d.Name[0 : MaxGameNameLength-1]
	}

	// Trim whitespace from both sides
	d.Name = strings.TrimSpace(d.Name)

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = getName()
	}

	// Check for non-ASCII characters
	if !isPrintableASCII(d.Name) {
		s.Warning("Game names can only contain ASCII characters.")
		return
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS attacks)
	if !isAlphanumericSpacesSafeSpecialCharacters(d.Name) {
		msg := "Game names can only contain English letters, numbers, spaces, " +
			"<code>!</code>, " +
			"<code>@</code>, " +
			"<code>#</code>, " +
			"<code>$</code>, " +
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

	createTable(s, d, true)
}

// This function is run after some validation in the "commandTableCreate()" function
// Validation is bypassed if the server creates the game from a "restart" command
// "preGameVisible" is false if this game should be hidden before it starts,
// such as a restarted game
func createTable(s *Session, d *CommandData, preGameVisible bool) {
	// Set default values for the custom game options
	setSeedSuffix := ""
	setReplay := false
	databaseID := -1
	setReplayTurn := 0
	var setReplayOptions *Options

	// Handle special game option creation
	if strings.HasPrefix(d.Name, "!") {
		args := strings.Split(d.Name, " ")
		command := args[0]
		args = args[1:] // This will be an empty slice if there is nothing after the command
		command = strings.TrimPrefix(command, "!")
		command = strings.ToLower(command) // Commands are case-insensitive

		if command == "seed" {
			// !seed - Play a specific seed
			if len(args) != 1 {
				s.Warning("Games on specific seeds must be created in the form: " +
					"!seed [seed number]")
				return
			}

			// For normal games, the server creates seed suffixes sequentially from 0, 1, 2,
			// and so on
			// However, the seed does not actually have to be a number,
			// so allow the user to use any arbitrary string as a seed suffix
			setSeedSuffix = args[0]
		} else if command == "replay" {
			// !replay - Replay a specific game up to a specific turn
			if len(args) != 1 && len(args) != 2 {
				s.Warning("Replays of specific games must be created in the form: " +
					"!replay [game ID] [turn number]")
				return
			}

			if v, err := strconv.Atoi(args[0]); err != nil {
				s.Warning("The game ID of \"" + args[0] + "\" is not a number.")
				return
			} else {
				databaseID = v
			}

			if len(args) == 1 {
				setReplayTurn = 1
			} else {
				if v, err := strconv.Atoi(args[1]); err != nil {
					s.Warning("The turn of \"" + args[1] + "\" is not a number.")
					return
				} else {
					setReplayTurn = v
				}

				if setReplayTurn < 1 {
					s.Warning("The replay turn must be greater than 0.")
					return
				}
			}

			// We have to minus the turn by one since turns are stored on the server starting at 0
			// and turns are shown to the user starting at 1
			setReplayTurn--

			// Check to see if the game ID exists on the server
			if exists, err := models.Games.Exists(databaseID); err != nil {
				logger.Error("Failed to check to see if game "+strconv.Itoa(databaseID)+
					" exists:", err)
				s.Error(CreateGameFail)
				return
			} else if !exists {
				s.Warning("That game ID does not exist in the database.")
				return
			}

			// Check to see if this turn is valid
			// (it has to be a turn before the game ends)
			var numTurns int
			if v, err := models.Games.GetNumTurns(databaseID); err != nil {
				logger.Error("Failed to get the number of turns from the database for game "+
					strconv.Itoa(databaseID)+":", err)
				s.Error(InitGameFail)
				return
			} else {
				numTurns = v
			}
			if setReplayTurn >= numTurns {
				s.Warning("Game #" + strconv.Itoa(databaseID) + " only has " +
					strconv.Itoa(numTurns) + ".")
				return
			}

			// Set the options of the game to be the same as the one in the database
			if v, err := models.Games.GetOptions(databaseID); err != nil {
				logger.Error("Failed to get the variant from the database for game "+
					strconv.Itoa(databaseID)+":", err)
				s.Error(InitGameFail)
				return
			} else {
				setReplayOptions = v
			}

			setReplay = true
		} else {
			msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
			s.Warning(msg)
			return
		}
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = &Options{
			VariantName: "No Variant",
		}
	}

	// Validate that the variant name is valid
	if _, ok := variants[d.Options.VariantName]; !ok {
		s.Warning("\"" + d.Options.VariantName + "\" is not a valid variant.")
		return
	}

	// Validate that the time controls are sane
	if d.Options.Timed {
		if d.Options.TimeBase <= 0 {
			s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too small of a value for \"Base Time\".")
			return
		}
		if d.Options.TimeBase > 604800 { // 1 week in seconds
			s.Warning("\"" + strconv.Itoa(d.Options.TimeBase) + "\" is too large of a value for \"Base Time\".")
			return
		}
		if d.Options.TimePerTurn <= 0 {
			s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too small of a value for \"Time per Turn\".")
			return
		}
		if d.Options.TimePerTurn > 86400 { // 1 day in seconds
			s.Warning("\"" + strconv.Itoa(d.Options.TimePerTurn) + "\" is too large of a value for \"Time per Turn\".")
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

	/*
		Create
	*/

	passwordHash := ""
	if d.Password != "" {
		// Create an Argon2id hash of the plain-text password
		if v, err := argon2id.CreateHash(d.Password, argon2id.DefaultParams); err != nil {
			logger.Error("Failed to create a hash from the submitted table password:", err)
			s.Error(CreateGameFail)
			return
		} else {
			passwordHash = v
		}
	}

	t := NewTable(d.Name, s.UserID())
	t.Mutex.Lock()
	defer t.Mutex.Unlock()
	t.Visible = preGameVisible
	t.PasswordHash = passwordHash
	if setReplayOptions == nil {
		t.Options = d.Options
	} else {
		t.Options = setReplayOptions
	}
	t.ExtraOptions = &ExtraOptions{
		DatabaseID:    databaseID,
		SetSeedSuffix: setSeedSuffix,
		SetReplay:     setReplay,
		SetReplayTurn: setReplayTurn,
	}

	// Add it to the map
	tablesMutex.Lock()
	tables[t.ID] = t
	tablesMutex.Unlock()

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" created a table.")
	// (a "table" message will be sent in the "commandTableJoin" function below)

	// Join the user to the new table
	d.TableID = t.ID
	commandTableJoin(s, d)

	// If the server is shutting down / restarting soon, warn the players
	if shuttingDown.IsSet() {
		timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())

		msg := "The server is shutting down in " + strconv.Itoa(minutesLeft) + " minutes. " +
			"Keep in mind that if your game is not finished in time, it will be terminated."
		chatServerSend(msg, t.GetRoomName())
	}
}
