/*
	Sent when the owner of a table clicks on the "Start Game" button
	(the client will send a "hello" message after getting "tableStart")

	"data" is empty
*/

package main

import (
	"encoding/json"
	"hash/crc64"
	"math/rand"
	"regexp"
	"strconv"
	"time"
)

var (
	cardRegExp = regexp.MustCompile(`^(\w)(\d)$`)
)

func commandTableStart(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that this is the owner of the table
	if s.UserID() != t.Owner {
		s.Warning("Only the owner of a table can start the game.")
		return
	}

	// Validate that the table has at least 2 players
	if len(t.Players) < 2 {
		s.Warning("You need at least 2 players before you can start a game.")
		return
	}

	// Validate that the game is not started yet
	if t.Running {
		s.Warning("The game has already started, so you cannot start it.")
		return
	}

	// Validate extra things for "!replay" games
	if t.Options.SetReplay != 0 {
		// Validate that the right amount of players is in the game
		if numPlayers, err := models.Games.GetNumPlayers(t.Options.SetReplay); err != nil {
			logger.Error("Failed to get the number of players in game "+
				strconv.Itoa(t.Options.SetReplay)+":", err)
			s.Error("Failed to create the game. Please contact an administrator.")
			return
		} else if len(t.Players) != numPlayers {
			s.Warning("You currently have " + strconv.Itoa(len(t.Players)) + " players but game " +
				strconv.Itoa(t.Options.SetReplay) + " needs " + strconv.Itoa(numPlayers) + " players.")
			return
		}

		// Validate that everyone is present
		// (this only applies to "!replay" because
		// we need to emulate player actions using their session)
		for _, p := range t.Players {
			if !p.Present {
				s.Warning("Everyone must be present before you can start this game.")
				return
			}
		}
	}

	/*
		Start
	*/

	logger.Info(t.GetName() + "Starting the game.")

	// Create the game object
	g := NewGame(t)

	// Start the idle timeout
	go t.CheckIdle()

	g.InitDeck()

	// Handle setting the seed
	preset := false
	seedPrefix := "p" + strconv.Itoa(len(t.Players)) + "v" + strconv.Itoa(variants[t.Options.Variant].ID) + "s"
	if t.Options.SetSeed != "" {
		// This is a game with a preset seed
		g.Seed = seedPrefix + t.Options.SetSeed
	} else if t.Options.SetReplay != 0 {
		// This is a replay of an existing game
		if v, err := models.Games.GetSeed(t.Options.SetReplay); err != nil {
			logger.Error("Failed to get the seed for game \""+strconv.Itoa(t.Options.SetReplay)+"\":", err)
			s.Error("Failed to create the game. Please contact an administrator.")
			return
		} else {
			g.Seed = v
		}
	} else if t.Options.SetDeal != "" {
		// This is a preset deal from a file, so just set the seed equal to the file name
		g.Seed = t.Options.SetDeal
		preset = true // Later on, we need to skip shuffling the deck
		if g.SetPresetDeck(s) {
			return
		}
	} else {
		// This is a normal game with a random seed / a random deck
		// Get a list of all the seeds that these players have played before
		seedMap := make(map[string]bool)
		for _, p := range t.Players {
			var seeds []string
			if v, err := models.Games.GetPlayerSeeds(p.ID); err != nil {
				logger.Error("Failed to get the past seeds for \""+s.Username()+"\":", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				seeds = v
			}

			for _, v := range seeds {
				seedMap[v] = true
			}
		}

		// Find a seed that no-one has played before
		seedNum := 0
		looking := true
		for looking {
			seedNum++
			g.Seed = seedPrefix + strconv.Itoa(seedNum)
			if !seedMap[g.Seed] {
				looking = false
			}
		}
	}
	logger.Info(t.GetName()+"Using seed:", g.Seed)

	// Seed the random number generator with the game seed
	// Golang's "rand.Seed()" function takes an int64, so we need to convert a string to an int64
	// We use the CRC64 hash function to do this
	// Also note that seeding with negative numbers will not work
	crc64Table := crc64.MakeTable(crc64.ECMA)
	intSeed := crc64.Checksum([]byte(g.Seed), crc64Table)
	rand.Seed(int64(intSeed))

	// Shuffle the deck
	// From: https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	if !preset {
		for i := range g.Deck {
			j := rand.Intn(i + 1)
			g.Deck[i], g.Deck[j] = g.Deck[j], g.Deck[i]
		}
	}

	// Mark the order of all of the cards in the deck
	for i, c := range g.Deck {
		c.Order = i
	}

	// Log the deal (so that it can be distributed to others if necessary)
	logger.Info("--------------------------------------------------")
	logger.Info("Deal for seed: " + g.Seed + " (from top to bottom)")
	logger.Info("(cards are dealt to a player until their hand fills up before moving on to the next one)")
	for i, c := range g.Deck {
		logger.Info(strconv.Itoa(i+1) + ") " + c.Name(g))
	}
	logger.Info("--------------------------------------------------")

	// Get a random player to start first (based on the game seed)
	// (but skip doing this if we are playing a preset deal from a file,
	// since the player that goes first is specified on the file line of the file)
	if !preset {
		g.ActivePlayer = rand.Intn(len(t.Players))
	}

	// Shuffle the order of the players
	// (otherwise, the seat order would always correspond to the order that
	// the players joined the game in)
	// From: https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	for i := range t.Players {
		j := rand.Intn(i + 1)
		t.Players[i], t.Players[j] = t.Players[j], t.Players[i]
	}

	// Initialize the GamePlayer objects
	for i, p := range t.Players {
		gp := &GamePlayer{
			Name:  p.Name,
			Index: i,

			Hand: make([]*Card, 0),
			// There are notes for every card in the deck + the stack bases for each suit
			Notes:              make([]string, len(g.Deck)+len(variants[t.Options.Variant].Suits)),
			CharacterMetadata:  -1,
			CharacterMetadata2: -1,
		}
		gp.InitTime(t.Options)
		g.Players = append(g.Players, gp)
	}

	// Decide the random character assignments
	// (this has to be after seed generation and initialization)
	characterGenerate(g)

	// Initialize all of the players to not being present
	// This is so that we don't send them unnecessary messages during the game initialization
	// (we will set them back to present once they send the "ready" message)
	listOfAwayPlayers := make([]int, 0)
	for _, p := range t.Players {
		if p.Present {
			p.Present = false
		} else {
			listOfAwayPlayers = append(listOfAwayPlayers, p.ID)
		}
	}

	// Deal the cards
	handSize := g.GetHandSize()
	for _, p := range g.Players {
		for i := 0; i < handSize; i++ {
			p.DrawCard(g)
		}
	}

	// Record the initial status of the game
	t.NotifyStatus(false) // The argument is "doubleDiscard"

	// Show who goes first
	// (this must be sent before the "turn" message
	// so that the text appears on the first turn of the replay)
	text := g.Players[g.ActivePlayer].Name + " goes first"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	logger.Info(t.GetName() + text)

	// Record a message about the first turn
	t.NotifyTurn()

	// Now that all of the initial game actions have been performed, mark that the game has started
	t.Running = true
	t.DatetimeStarted = time.Now()

	// If we are replaying an existing game up to a certain point,
	// start emulating all of the actions
	if t.Options.SetReplay != 0 {
		if emulateGameplayFromDatabaseActions(t, s) {
			return
		}
	}

	// Send a "tableStart" message to everyone in the game
	for _, p := range t.Players {
		// If a player is back in the lobby, then don't automatically force them into the game
		if !intInSlice(p.ID, listOfAwayPlayers) {
			p.Session.NotifyTableStart()
		}
	}

	// Let everyone know that the game has started, which will turn the
	// "Join Game" button into "Spectate"
	notifyAllTable(t)

	// Set the status for all of the users in the game
	for _, p := range t.Players {
		p.Session.Set("status", statusPlaying)
		notifyAllUser(p.Session)
	}

	// Start the timer
	if t.Options.Timed {
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayer])
	}
}

func emulateGameplayFromDatabaseActions(t *Table, s *Session) bool {
	g := t.Game

	// Ensure that the correct session values are set for all of the players
	// (before we start sending messages on their behalf)
	for _, p := range t.Players {
		p.Session.Set("currentTable", t.ID)
		p.Session.Set("status", statusPlaying)
	}

	var actionStrings []string
	if v, err := models.GameActions.GetAll(t.Options.SetReplay); err != nil {
		logger.Error("Failed to get the actions from the database for game "+
			strconv.Itoa(t.Options.SetReplay)+":", err)
		s.Error(initFail)
		return true
	} else {
		actionStrings = v
	}

	for _, actionString := range actionStrings {
		// Convert it from JSON
		var action map[string]interface{}
		if err := json.Unmarshal([]byte(actionString), &action); err != nil {
			logger.Error("Failed to unmarshal an action while emulating gameplay from the database:", err)
			s.Error(initFail)
			return true
		}

		// Emulate the various actions
		if action["type"] == "clue" {
			// Unmarshal the specific action type
			var actionClue ActionClue
			if err := json.Unmarshal([]byte(actionString), &actionClue); err != nil {
				logger.Error("Failed to unmarshal a clue action:", err)
				s.Error(initFail)
				return true
			}

			// Emulate the clue action
			commandAction(t.Players[actionClue.Giver].Session, &CommandData{
				Type:   actionTypeClue,
				Target: actionClue.Target,
				Clue:   actionClue.Clue,
			})
		} else if action["type"] == "play" {
			// Unmarshal the specific action type
			var actionPlay ActionPlay
			if err := json.Unmarshal([]byte(actionString), &actionPlay); err != nil {
				logger.Error("Failed to unmarshal a play action:", err)
				s.Error(initFail)
				return true
			}

			// Emulate the play action
			commandAction(t.Players[actionPlay.Which.Index].Session, &CommandData{
				Type:   actionTypePlay,
				Target: actionPlay.Which.Order,
			})
		} else if action["type"] == "discard" {
			// Unmarshal the specific action type
			var actionDiscard ActionDiscard
			if err := json.Unmarshal([]byte(actionString), &actionDiscard); err != nil {
				logger.Error("Failed to unmarshal a discard action:", err)
				s.Error(initFail)
				return true
			}

			// Emulate the discard action
			commandAction(t.Players[actionDiscard.Which.Index].Session, &CommandData{
				Type:   actionTypeDiscard,
				Target: actionDiscard.Which.Order,
			})
		} else if action["type"] == "turn" {
			// Unmarshal the specific action type
			var actionTurn ActionTurn
			if err := json.Unmarshal([]byte(actionString), &actionTurn); err != nil {
				logger.Error("Failed to unmarshal a turn action:", err)
				s.Error(initFail)
				return true
			}

			// Stop if we have reached the intended turn
			if actionTurn.Num == t.Options.SetReplayTurn {
				// We have to reset all of the player's clocks before we proceed
				// to avoid some bugs relating to taking super-fast turns
				for _, p := range g.Players {
					p.InitTime(t.Options)
				}

				return false
			}
		}
	}

	logger.Error("Failed to find the intended turn before reaching the end of game " +
		strconv.Itoa(t.Options.SetReplay) + ".")
	s.Error(initFail)
	return true
}
