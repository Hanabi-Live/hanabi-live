package main

import (
	"io/ioutil"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// The maximum number of characters that a game name can be
	maxGameNameLength = 45
)

var (
	cardRegExp = regexp.MustCompile(`^(\w)(\d)$`)
)

// commandTableCreate is sent when the user submits the "Create a New Game" form
//
// Example data:
// {
//   name: 'my new table',
//   variant: 'No Variant',
//   timed: true,
//   baseTime: 120,
//   timePerTurn: 20,
//   speedrun: false,
//   cardCycle: false,
//   deckPlays: false,
//   emptyClues: false,
//   characterAssignments: false,
//   password: '1b5f02e630254f609c90ac2d1a6404373644dd96111e7e1a2d9b05fd61905ffb',
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
	if t2 := s.GetJoinedTable(); t2 != nil {
		s.Warning("You cannot join more than one table at a time. " +
			"Terminate your old game before joining a new one.")
		return
	}

	// Make a default game name if they did not provide one
	if len(d.Name) == 0 {
		d.Name = s.Username() + "'s game"
	}

	// Validate that the game name is not excessively long
	if len(d.Name) > maxGameNameLength {
		s.Warning("You cannot have a game name be longer than " +
			strconv.Itoa(maxGameNameLength) + " characters.")
		return
	}

	// Validate that the game name does not contain any special characters
	// (this mitigates XSS-style attacks)
	if !isAlphanumericSpacesSafeSpecialCharacters(d.Name) {
		s.Warning("Game names can only contain English letters, numbers, spaces, hyphens, " +
			"and exclamation marks.")
		return
	}

	// Set default values for the custom game options
	var customDeck []SimpleCard
	setSeedSuffix := ""
	setReplay := false
	databaseID := 0
	setReplayTurn := 0

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
				logger.Error("Failed to check to see if game "+
					strconv.Itoa(databaseID)+" exists:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
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
				s.Error(initFail)
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
				s.Error(initFail)
				return
			} else {
				// The variant is submitted to the server as a name
				// but stored in the database as an integer
				d.Variant = variantsID[v.Variant]
				d.Timed = v.Timed
				d.BaseTime = v.BaseTime
				d.TimePerTurn = v.TimePerTurn
				d.Speedrun = v.Speedrun
				d.CardCycle = v.CardCycle
				d.DeckPlays = v.DeckPlays
				d.EmptyClues = v.EmptyClues
				d.CharacterAssignments = v.CharacterAssignments
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
			filePath := path.Join(projectPath, "specific-deals", args[0]+".txt")
			if _, err := os.Stat(filePath); err != nil {
				s.Warning("That preset deal does not exist on the server.")
				return
			}

			var lines []string
			if v, err := ioutil.ReadFile(filePath); err != nil {
				logger.Error("Failed to read \""+filePath+"\":", err)
				s.Error("Failed to create the game. Please contact an administrator.")
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
			s.Warning("You cannot start a game with an exclamation mark unless " +
				"you are trying to use a specific game creation command.")
			return
		}
	}

	// Validate that the variant name is valid
	if _, ok := variants[d.Variant]; !ok {
		s.Warning("That is not a valid variant.")
		return
	}

	// Validate that the time controls are sane
	if d.Timed {
		if d.BaseTime <= 0 {
			s.Warning("That is not a valid value for \"Base Time\".")
			return
		}
		if d.BaseTime > 604800 { // 1 week in seconds
			s.Warning("The value for \"Base Time\" is too large.")
			return
		}
		if d.TimePerTurn <= 0 {
			s.Warning("That is not a valid value for \"Time per Turn\".")
			return
		}
		if d.TimePerTurn > 86400 { // 1 day in seconds
			s.Warning("The value for \"Time per Turn\" is too large.")
			return
		}
	}

	// Validate that there can be no time controls if this is not a timed game
	if !d.Timed {
		d.BaseTime = 0
		d.TimePerTurn = 0
	}

	// Validate that a speedrun cannot be timed
	if d.Speedrun {
		d.Timed = false
		d.BaseTime = 0
		d.TimePerTurn = 0
	}

	/*
		Create
	*/

	t := NewTable(d.Name, s.UserID())
	t.Password = d.Password
	t.AlertWaiters = d.AlertWaiters
	t.Options = &Options{
		Variant:              d.Variant,
		Timed:                d.Timed,
		BaseTime:             d.BaseTime,
		TimePerTurn:          d.TimePerTurn,
		Speedrun:             d.Speedrun,
		CardCycle:            d.CardCycle,
		DeckPlays:            d.DeckPlays,
		EmptyClues:           d.EmptyClues,
		CharacterAssignments: d.CharacterAssignments,

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
	// (even if they check the "Alert people" checkbox,
	// we don't want to alert on password-protected games or test games)
	if t.AlertWaiters &&
		t.Password == "" &&
		t.Name != "test" &&
		!strings.HasPrefix(t.Name, "test ") {

		waitingListAlert(t, s.Username())
	}

	// If the server is shutting down / restarting soon, warn the players
	if shuttingDown {
		timeLeft := shutdownTimeout - time.Since(datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())

		msg := "The server is shutting down in " + strconv.Itoa(minutesLeft) + " minutes. "
		msg += "Keep in mind that if your game is not finished in time, it will be terminated."
		chatServerSend(msg, "table"+strconv.Itoa(t.ID))
	}
}
