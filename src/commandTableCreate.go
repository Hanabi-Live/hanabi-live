package main

import (
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
)

const (
	// The maximum number of characters that a game name can be
	maxGameNameLength = 45
)

var (
	newTableID    = 1 // Start at 1 and increment for every game created
	seedRegExp    = regexp.MustCompile(`^!seed (.+)$`)
	replayRegExp1 = regexp.MustCompile(`^!replay (\d+)$`)
	replayRegExp2 = regexp.MustCompile(`^!replay (\d+) (\d+)$`)
	dealRegExp    = regexp.MustCompile(`^!deal (.+)$`)
)

func commandTableCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the server is not in shutdown mode
	if shuttingDown {
		s.Warning("The server is restarting soon (when all ongoing games have finished). " +
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
	if !isAlphanumericSpacesAndSafeSpecialCharacters(d.Name) {
		s.Warning("Game names can only contain English letters, numbers, spaces, hyphens, " +
			"and exclamation marks.")
		return
	}

	// If they are trying to create a game with a special option, validate the options
	setSeed := ""
	setReplay := 0
	setReplayTurn := 0
	setDeal := ""
	if strings.HasPrefix(d.Name, "!") {
		if strings.HasPrefix(d.Name, "!seed") {
			// !seed - Play a specific seed
			match := seedRegExp.FindStringSubmatch(d.Name)
			if match == nil {
				s.Warning("Games on specific seeds must be created in the form: " +
					"!seed [seed number]")
				return
			}
			setSeed = match[1]
		} else if strings.HasPrefix(d.Name, "!replay") {
			// !replay - Replay a specific game up to a specific turn
			match1 := replayRegExp1.FindStringSubmatch(d.Name)
			match2 := replayRegExp2.FindStringSubmatch(d.Name)
			if match1 != nil {
				if v, err := strconv.Atoi(match1[1]); err != nil {
					logger.Error("Failed to convert the !replay argument to a number:", err)
					s.Error("Failed to create the game. Please contact an administrator.")
					return
				} else {
					setReplay = v
				}
				setReplayTurn = 1
			} else if match2 != nil {
				if v, err := strconv.Atoi(match2[1]); err != nil {
					logger.Error("Failed to convert the first !replay argument to a number:", err)
					s.Error("Failed to create the game. Please contact an administrator.")
					return
				} else {
					setReplay = v
				}
				if v, err := strconv.Atoi(match2[2]); err != nil {
					logger.Error("Failed to convert the second !replay argument to a number:", err)
					s.Error("Failed to create the game. Please contact an administrator.")
					return
				} else {
					setReplayTurn = v
				}
				if setReplayTurn < 1 {
					s.Warning("The replay turn must be greater than 0.")
					return
				}
			} else {
				s.Warning("Replays of specific games must be created in the form: " +
					"!replay [game ID] [turn number]")
				return
			}

			// We have to minus the turn by one since turns are stored on the server starting at 0
			// and turns are shown to the user starting at 1
			setReplayTurn--

			// Check to see if the game ID exists on the server
			if exists, err := models.Games.Exists(setReplay); err != nil {
				logger.Error("Failed to check to see if game "+
					strconv.Itoa(setReplay)+" exists:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else if !exists {
				s.Warning("That game ID does not exist in the database.")
				return
			}

			// Check to see if this turn is valid
			// (it has to be a turn before the game ends)
			var numTurns int
			if v, err := models.Games.GetNumTurns(setReplay); err != nil {
				logger.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(setReplay)+":", err)
				s.Error(initFail)
				return
			} else {
				numTurns = v
			}
			if setReplayTurn >= numTurns {
				s.Warning("That turn is not valid for the specified game ID.")
				return
			}

			// Set the options of the game to be the same as the one in the database
			if v, err := models.Games.GetOptions(setReplay); err != nil {
				logger.Error("Failed to get the variant from the database for game "+strconv.Itoa(setReplay)+":", err)
				s.Error(initFail)
				return
			} else {
				// The variant is submitted to the server as a name but stored in the database as an integer
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
		} else if strings.HasPrefix(d.Name, "!deal") {
			// !deal - Play a specific deal read from a text file
			match := dealRegExp.FindStringSubmatch(d.Name)
			if match == nil {
				s.Warning("Games on specific deals must be created in the form: !deal [filename]")
				return
			}
			setDeal = match[1]

			// Check to see if the file exists on the server
			filePath := path.Join(projectPath, "specific-deals", setDeal+".txt")
			if _, err := os.Stat(filePath); err != nil {
				s.Error("That preset deal does not exist on the server.")
				return
			}
			// (we won't bother parsing the file until the game is actually started)
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

		SetSeed:       setSeed,
		SetReplay:     setReplay,
		SetReplayTurn: setReplayTurn,
		SetDeal:       setDeal,
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
}
