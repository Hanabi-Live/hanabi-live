package main

import (
	"math/rand"
	"strconv"
	"time"
)

// commandTableStart is sent when the owner of a table clicks on the "Start Game" button
// It will echo back a "tableStart" command if the game successfully started
// (at which point the client will send a "getTableInfo1" message to get more information about the
// game)
//
// Example data:
// {
//   tableID: 5,
// }
func commandTableStart(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the table exists
	tableID := d.TableID
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
	if t.ExtraOptions.SetReplay {
		// Validate that the right amount of players is in the game
		if numPlayers, err := models.Games.GetNumPlayers(t.ExtraOptions.DatabaseID); err != nil {
			logger.Error("Failed to get the number of players in game "+
				strconv.Itoa(t.ExtraOptions.DatabaseID)+":", err)
			s.Error(StartGameFail)
			return
		} else if len(t.Players) != numPlayers {
			s.Warning("You currently have " + strconv.Itoa(len(t.Players)) + " players but game " +
				strconv.Itoa(t.ExtraOptions.DatabaseID) + " needs " + strconv.Itoa(numPlayers) +
				" players.")
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

	// Record the number of players
	t.Options.NumPlayers = len(t.Players)

	// Make everyone stop typing
	for _, p := range t.Players {
		if p.Typing {
			p.Typing = false
			t.NotifyChatTyping(p.Name, false)
		}
	}

	// Create the game object
	g := NewGame(t)

	// Start the idle timeout
	go t.CheckIdle()

	// Record the stack directions
	t.NotifyStackDirections()

	g.InitDeck()

	// Handle setting the seed
	shuffleDeck := true
	shufflePlayers := true
	seedPrefix := "p" + strconv.Itoa(len(t.Players)) + // e.g. p2v0s
		"v" + strconv.Itoa(variants[t.Options.VariantName].ID) + "s"
	if t.ExtraOptions.DatabaseID != -1 {
		// This is a replay of a game from the database or
		// a custom game created with the "!replay" prefix
		if v, err := models.Games.GetSeed(t.ExtraOptions.DatabaseID); err != nil {
			logger.Error("Failed to get the seed for game "+
				"\""+strconv.Itoa(t.ExtraOptions.DatabaseID)+"\":", err)
			s.Error(StartGameFail)
			return
		} else {
			g.Seed = v
		}
		shufflePlayers = false
	} else if t.ExtraOptions.SetSeedSuffix != "" {
		// This is a custom game created with the "!seed" prefix
		// (e.g. playing a deal with a specific seed)
		g.Seed = seedPrefix + t.ExtraOptions.SetSeedSuffix
	} else if t.ExtraOptions.CustomDeck != nil {
		// This is a replay of a game from JSON
		g.Seed = "JSON"
		shuffleDeck = false
		shufflePlayers = false
	} else {
		// This is a normal game with a random seed / a random deck
		// Get a list of all the seeds that these players have played before
		seedMap := make(map[string]struct{})
		for _, p := range t.Players {
			var seeds []string
			if v, err := models.Games.GetPlayerSeeds(
				p.ID,
				variants[g.Options.VariantName].ID,
			); err != nil {
				logger.Error("Failed to get the past seeds for \""+s.Username()+"\":", err)
				s.Error(StartGameFail)
				return
			} else {
				seeds = v
			}

			for _, seed := range seeds {
				seedMap[seed] = struct{}{}
			}
		}

		// Find a seed that no-one has played before
		seedNum := 0
		looking := true
		for looking {
			seedNum++
			g.Seed = seedPrefix + strconv.Itoa(seedNum)
			if _, ok := seedMap[g.Seed]; !ok {
				looking = false
			}
		}
	}
	logger.Info(t.GetName()+"Using seed:", g.Seed)

	setSeed(g.Seed) // Seed the random number generator
	if shuffleDeck {
		g.ShuffleDeck()
	}

	// Mark the order of all of the cards in the deck
	for i, c := range g.Deck {
		c.Order = i
	}

	/*
		// Log the deal (so that it can be distributed to others if necessary)
		logger.Info("--------------------------------------------------")
		logger.Info("Deal for seed: " + g.Seed + " (from top to bottom)")
		logger.Info("(cards are dealt to a player until their hand fills up before moving on to the next one)")
		for i, c := range g.Deck {
			logger.Info(strconv.Itoa(i+1) + ") " + c.Name(g))
		}
		logger.Info("--------------------------------------------------")
	*/

	// The 0th player will always go first
	// Since we want a random player to start first, we need to shuffle the order of the players
	// Additionally, we need to shuffle the order of the players so that the order that the players
	// joined the game in does not correspond to the order of the players in the actual game
	// https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	if shufflePlayers {
		for i := range t.Players {
			j := rand.Intn(i + 1)
			t.Players[i], t.Players[j] = t.Players[j], t.Players[i]
		}
	}

	// Games created prior to April 2020 do not always have the 0th player taking the first turn
	if t.Options.StartingPlayer != 0 {
		g.ActivePlayerIndex = t.Options.StartingPlayer
	}

	// Initialize the GamePlayer objects
	for i, p := range t.Players {
		gp := &GamePlayer{
			Name:  p.Name,
			Index: i,
			Game:  g,

			Hand:  make([]*Card, 0),
			Notes: make([]string, g.GetNotesSize()),
		}
		gp.InitTime(t.Options)
		g.Players = append(g.Players, gp)
	}

	// Decide the random character assignments
	// (this has to be after seed generation and initialization)
	characterGenerate(g)

	// Initialize all of the players to not being present
	// This is so that we don't send them unnecessary messages during the game initialization
	// (we will set them back to present once they send the "getGameInfo2" message)
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
			p.DrawCard()
		}
	}

	// Record the initial status of the game
	t.NotifyStatus()

	// Record a message about the first turn
	t.NotifyTurn()

	// Now that all of the initial game actions have been performed, mark that the game has started
	t.Running = true
	g.DatetimeStarted = time.Now()

	// If we are replaying an existing game up to a certain point,
	// emulate all of the actions until turn N
	if t.ExtraOptions.SetReplay {
		d.Source = "id"
		d.GameID = t.ExtraOptions.DatabaseID
		if !emulateActions(s, d, t) {
			return
		}

		// We have to reset all of the player's clocks to avoid some bugs relating to
		// taking super-fast turns
		for _, p := range g.Players {
			p.InitTime(t.Options)
		}
	}

	// Send a "tableStart" message to everyone in the game
	for _, p := range t.Players {
		// If a player is back in the lobby, then don't automatically force them into the game
		if !intInSlice(p.ID, listOfAwayPlayers) {
			p.Session.NotifyTableStart(t)
		}
	}

	// If we are emulating actions, we do not have to tell anyone about the table yet
	if !t.ExtraOptions.Replay {
		if t.ExtraOptions.Restarted {
			// If this is a restarted game, we can make it visible in the lobby now
			t.Visible = true
		}
		// Let everyone know that the game has started, which will turn the
		// "Join Game" button into "Spectate"
		notifyAllTable(t)

		// Set the status for all of the users in the game
		for _, p := range t.Players {
			if p.Session != nil {
				p.Session.Set("status", StatusPlaying)
				p.Session.Set("table", t.ID)
				notifyAllUser(p.Session)
			}
		}
	}

	// Start a timer to detect if the current player runs out of time
	if t.Options.Timed && !t.ExtraOptions.Replay {
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayerIndex])
	}
}
