package main

import (
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
	// Start at 1 and increment for every game created
	newGameID = 1
)

func commandGameCreate(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the server is not in shutdown mode
	if shutdownMode > 0 {
		s.Warning("The server is restarting soon (when all ongoing games have finished). " +
			"You cannot start any new games for the time being.")
		return
	}

	// Validate that the player is not joined to another game
	if s.CurrentGame() != -1 {
		s.Warning("You cannot create a new game when you are already in one.")
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
			var seedRegExp *regexp.Regexp
			if v, err := regexp.Compile(`^!seed (.+)$`); err != nil {
				log.Error("Failed to create the seed regular expression:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				seedRegExp = v
			}
			match := seedRegExp.FindStringSubmatch(d.Name)
			if match == nil {
				s.Warning("Games on specific seeds must be created in the form: " +
					"!seed [seed number]")
				return
			}
			setSeed = match[1]

		} else if strings.HasPrefix(d.Name, "!replay") {
			// !replay - Replay a specific game up to a specific turn
			var replayRegExp *regexp.Regexp
			if v, err := regexp.Compile(`^!replay (\d+) (\d+)$`); err != nil {
				log.Error("Failed to create the replay regular expression:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				replayRegExp = v
			}
			match := replayRegExp.FindStringSubmatch(d.Name)
			if match == nil {
				s.Warning("Replays of specific games must be created in the form: " +
					"!seed [game ID] [turn number]")
				return
			}
			if v, err := strconv.Atoi(match[1]); err != nil {
				log.Error("Failed to convert the first argument to a number:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				setReplay = v
			}
			if v, err := strconv.Atoi(match[2]); err != nil {
				log.Error("Failed to convert the second argument to a number:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				setReplayTurn = v
			}

			// We have to minus the turn by one since turns are stored on the server starting at 0
			// and turns are shown to the user starting at 1
			setReplayTurn--

			// Check to see if the game ID exists on the server
			if exists, err := db.Games.Exists(setReplay); err != nil {
				log.Error("Failed to check to see if game "+
					"\""+strconv.Itoa(setReplay)+"\" exists:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else if !exists {
				s.Warning("That game ID does not exist in the database.")
				return
			}

			// Check to see if this turn is valid
			// (it has to be a turn before the game ends)
			var numTurns int
			if v, err := db.Games.GetNumTurns(setReplay); err != nil {
				log.Error("Failed to get the number of turns from the database for game "+strconv.Itoa(setReplay)+":", err)
				s.Error("Failed to initialize the game. Please contact an administrator.")
				return
			} else {
				numTurns = v
			}
			if setReplayTurn >= numTurns {
				s.Warning("That turn is not valid for the specified game ID.")
				return
			}

			// Set the variant of the game to be the same as the one in the database
			if v, err := db.Games.GetVariant(setReplay); err != nil {
				log.Error("Failed to get the variant from the database for game "+strconv.Itoa(setReplay)+":", err)
				s.Error("Failed to initialize the game. Please contact an administrator.")
				return
			} else {
				d.Variant = variantsID[v]
			}

		} else if strings.HasPrefix(d.Name, "!deal") {
			// !deal - Play a specific deal read from a text file
			var dealRegExp *regexp.Regexp
			if v, err := regexp.Compile(`^!deal (.+)$`); err != nil {
				log.Error("Failed to create the deal regular expression:", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				dealRegExp = v
			}
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
	valid := false
	for variant := range variants {
		if d.Variant == variant {
			valid = true
			break
		}
	}
	if !valid {
		s.Warning("That is not a valid variant.")
		return
	}

	// Validate that the time controls are sane
	if d.Timed && d.BaseTimeMinutes <= 0 {
		s.Warning("That is not a valid value for \"Base Time\".")
		return
	}
	if d.Timed && d.TimePerTurnSeconds <= 0 {
		s.Warning("That is not a valid value for \"Time per Turn\".")
		return
	}

	// Blank out the time controls if this is not a timed game
	if !d.Timed {
		d.BaseTimeMinutes = 0
		d.TimePerTurnSeconds = 0
	}

	/*
		Create
	*/

	// Get the new game ID
	gameID := newGameID
	newGameID++

	// Create the game object
	g := &Game{
		ID:       gameID,
		Name:     d.Name,
		Owner:    s.UserID(),
		Password: d.Password,
		Options: &Options{
			Variant:              d.Variant,
			Timed:                d.Timed,
			TimeBase:             d.BaseTimeMinutes,
			TimePerTurn:          d.TimePerTurnSeconds,
			DeckPlays:            d.DeckPlays,
			EmptyClues:           d.EmptyClues,
			CharacterAssignments: d.CharacterAssignments,
			SetSeed:              setSeed,
			SetReplay:            setReplay,
			SetReplayTurn:        setReplayTurn,
			SetDeal:              setDeal,
		},
		Players:            make([]*Player, 0),
		Spectators:         make([]*Spectator, 0),
		DisconSpectators:   make(map[int]bool),
		Clues:              maxClues,
		DatetimeCreated:    time.Now(),
		DatetimeLastAction: time.Now(),
		Deck:               make([]*Card, 0),
		Stacks:             make([]int, 0),
		StackDirections:    make([]int, 0),
		Actions:            make([]interface{}, 0),
		EndTurn:            -1,
		Chat:               make([]*GameChatMessage, 0),
	}
	if strings.HasPrefix(g.Options.Variant, "Clue Starved") {
		// In this variant, having 1 clue available is represented with a value of 2
		// We want the players to start with the normal amount of clues,
		// so we have to double the starting amount
		g.Clues *= 2
	}
	msg := g.GetName() + "User \"" + s.Username() + "\" created"
	if g.Options.Timed {
		msg += " (timed)"
	}
	msg += "."
	log.Info(msg)

	// Add it to the map
	games[gameID] = g

	// Let everyone know about the new table
	notifyAllTable(g)

	// Join the user to the new table
	d.ID = gameID
	commandGameJoin(s, d)

	// Alert the people on the waiting list, if any
	if d.AlertWaiters && g.Password == "" && !strings.HasPrefix(g.Name, "test") {
		// Even if they check the "Alert people" checkbox,
		// we don't want to alert on password-protected games or test games
		waitingListAlert(g, s.Username())
	}
}
