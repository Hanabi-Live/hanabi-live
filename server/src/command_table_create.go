package main

import (
	"io/ioutil"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/alexedwards/argon2id"
)

const (
	// The maximum number of characters that a game name can be
	MaxGameNameLength = 45
)

var (
	cardRegExp = regexp.MustCompile(`^(\w)(\d)$`)
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
//   alertWaiters: false,
// }
func commandTableCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the server is not about to go offline
	if checkImminenntShutdown(s) {
		return
	}

	// Validate that the server is not undergoing maintenance
	if maintenanceMode {
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

// This function is run after some validation in commandTableCreate
// that may be bypassed if the server creates the game from a restart, for example
// preGameVisible is false if this game should be hidden before it starts, such as a restarted game
func createTable(s *Session, d *CommandData, preGameVisible bool) {
	// Set default values for the custom game options
	var customDeck []SimpleCard
	setSeedSuffix := ""
	setReplay := false
	databaseID := 0
	setReplayTurn := 0
	var setReplayOptions *Options

	// Hande special game option creation
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
		} else if command == "deal" {
			// !deal - Play a specific deal read from a text file
			if len(args) != 1 {
				s.Warning("Games on specific deals must be created in the form: !deal [filename]")
				return
			}

			if !isAlphanumeric(args[0]) {
				s.Warning("The filename must consist of only letters and numbers.")
				return
			}

			// Check to see if the file exists on the server
			filePath := path.Join(dataPath, "specific-deals", args[0]+".txt")
			if _, err := os.Stat(filePath); err != nil {
				s.Warning("That preset deal does not exist on the server.")
				return
			}

			var lines []string
			if v, err := ioutil.ReadFile(filePath); err != nil {
				logger.Error("Failed to read \""+filePath+"\":", err)
				s.Error(CreateGameFail)
				return
			} else {
				lines = strings.Split(string(v), "\n")
			}

			customDeck = make([]SimpleCard, 0)
			for i, line := range lines {
				// Ignore empty lines (the last line of the file might be empty)
				if line == "" {
					continue
				}

				// Parse the line for the suit and the rank
				match := cardRegExp.FindStringSubmatch(line)
				if match == nil {
					s.Warning("Failed to parse line " + strconv.Itoa(i+1) + ": " + line)
					return
				}

				// Parse the suit
				suit := strings.ToLower(match[1])
				var newSuit int
				if suit == "r" {
					newSuit = 0
				} else if suit == "y" {
					newSuit = 1
				} else if suit == "g" {
					newSuit = 2
				} else if suit == "b" {
					newSuit = 3
				} else if suit == "p" {
					newSuit = 4
				} else if suit == "m" || suit == "t" {
					newSuit = 5
				} else {
					s.Warning("Failed to parse the suit on line " + strconv.Itoa(i+1) + ": " + suit)
					return
				}

				// Parse the rank
				rank := match[2]
				var newRank int
				if v, err := strconv.Atoi(rank); err != nil {
					s.Warning("Failed to parse the rank on line " + strconv.Itoa(i+1) + ": " + rank)
					return
				} else {
					newRank = v
				}

				customDeck = append(customDeck, SimpleCard{
					Suit: newSuit,
					Rank: newRank,
				})
			}
		} else {
			msg := "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command."
			s.Warning(msg)
			return
		}
	}

	// Validate that they sent the options object
	if d.Options == nil {
		d.Options = &Options{
			Variant: "No Variant",
		}
	}

	// Validate that the variant name is valid
	if _, ok := variants[d.Options.Variant]; !ok {
		s.Warning("\"" + d.Options.Variant + "\" is not a valid variant.")
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
	t.PreGameVisible = preGameVisible
	t.PasswordHash = passwordHash
	t.AlertWaiters = d.AlertWaiters
	if setReplayOptions == nil {
		t.Options = d.Options
	} else {
		t.Options = setReplayOptions
	}
	t.ExtraOptions = &ExtraOptions{
		CustomDeck:    customDeck,
		SetSeedSuffix: setSeedSuffix,
		SetReplay:     setReplay,
		DatabaseID:    databaseID,
		SetReplayTurn: setReplayTurn,
	}
	tables[t.ID] = t // Add it to the map
	logger.Info(t.GetName() + "User \"" + s.Username() + "\" created a table.")
	// (a "table" message will be sent in the "commandTableJoin" function below)

	// Join the user to the new table
	d.TableID = t.ID
	commandTableJoin(s, d)

	// Alert the people on the waiting list, if any
	// (even if they check the "Alert people on the waiting list" checkbox,
	// we don't want to alert on password-protected games or test games)
	if preGameVisible &&
		t.AlertWaiters &&
		t.PasswordHash == "" &&
		t.Name != "test" &&
		!strings.HasPrefix(t.Name, "test ") {

		waitingListAlert(t, s.Username())
	}

	// If the server is shutting down / restarting soon, warn the players
	if shuttingDown {
		timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())

		msg := "The server is shutting down in " + strconv.Itoa(minutesLeft) + " minutes. " +
			"Keep in mind that if your game is not finished in time, it will be terminated."
		chatServerSend(msg, "table"+strconv.Itoa(t.ID))
	}
}
