package main

import (
	"context"
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
func commandTableStart(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that this is the owner of the table
	if s.UserID != t.OwnerID {
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

	// Validate that the right amount of players is in the game
	// for games with a set amount of players
	// (e.g. "!replay" games and games with custom JSON)
	if t.ExtraOptions.CustomNumPlayers != 0 {
		if len(t.Players) != t.ExtraOptions.CustomNumPlayers {
			s.Warning("You currently have " + strconv.Itoa(len(t.Players)) +
				" players, but this game needs " + strconv.Itoa(t.ExtraOptions.CustomNumPlayers) +
				" players.")
			return
		}

		// Validate that everyone is present
		// (this only applies to games with a set amount of players because we need to emulate
		// player actions using their session)
		for _, p := range t.Players {
			if !p.Present {
				s.Warning("Everyone must be present before you can start this game.")
				return
			}
		}
	}

	if d.IntendedPlayers != nil {
		// Check that the game is starting with the intended set of players

		// If not, fail silently and allow the user to notice that the button they pressed has
		// become disabled
		if len(*d.IntendedPlayers) != len(t.Players) {
			return
		}
		for _, p := range t.Players {
			found := false
			for _, name := range *d.IntendedPlayers {
				if name == p.Name {
					found = true
					break
				}
			}
			if !found {
				return
			}
		}
	}

	tableStart(ctx, s, d, t)
}

func tableStart(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	variant := variants[t.Options.VariantName]

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
	go t.CheckIdle(ctx)

	g.InitDeck()

	// Handle setting the seed
	shuffleDeck := true
	shufflePlayers := true
	seedPrefix := "p" + strconv.Itoa(len(t.Players)) +
		"v" + strconv.Itoa(variant.ID) +
		"s" // e.g. "p2v0s" for a 2-player no variant game
	if t.ExtraOptions.JSONReplay {
		// This is a replay from arbitrary JSON data (or a custom game from arbitrary JSON data)
		shufflePlayers = false
		if t.ExtraOptions.CustomSeed == "" {
			// No custom seed was specified along with the JSON, so use the specified deck
			g.Seed = "JSON"
			shuffleDeck = false
		} else {
			// A custom seed was specified along with the JSON,
			// so ignore the deck provided in the JSON, generate a deck based on the specified seed,
			// and shuffle it as per normal
			g.Seed = g.ExtraOptions.CustomSeed
		}
	} else if t.ExtraOptions.CustomSeed != "" {
		// This is a replay from the database (or a custom "!replay" game)
		g.Seed = t.ExtraOptions.CustomSeed
		shufflePlayers = false
	} else if t.ExtraOptions.SetSeedSuffix != "" {
		// This is a custom table created with the "!seed" prefix
		// (e.g. playing a deal with a specific seed)
		g.Seed = seedPrefix + t.ExtraOptions.SetSeedSuffix
	} else {
		// This is a normal game with a random seed / a random deck
		// Get a list of all the seeds that these players have played before
		seedMap := make(map[string]struct{})
		for _, p := range t.Players {
			var seeds []string
			if v, err := models.Games.GetPlayerSeeds(p.UserID, variant.ID); err != nil {
				logger.Error("Failed to get the past seeds for \"" + s.Username + "\": " +
					err.Error())
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
	logger.Info(t.GetName() + "Using seed: " + g.Seed)
	logger.Info("Shuffling deck: " + strconv.FormatBool(shuffleDeck))
	logger.Info("Shuffling players: " + strconv.FormatBool(shufflePlayers))

	setSeed(g.Seed) // Seed the random number generator
	if shuffleDeck {
		g.ShuffleDeck()
	}

	// Mark the order of all of the cards in the deck
	for i, c := range g.Deck {
		c.Order = i
	}

	// The 0th player will always go first
	// Since we want a random player to start first, we need to shuffle the order of the players
	// Additionally, we need to shuffle the order of the players so that the order that the players
	// joined the game in does not correspond to the order of the players in the actual game
	// https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	// For this step, we don't care about explicitly seeding the random number generator,
	// since any random shuffling will do
	if shufflePlayers {
		for i := range t.Players {
			j := rand.Intn(i + 1) // nolint: gosec
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

			Hand:              make([]*Card, 0),
			Time:              0,
			Notes:             make([]string, g.GetNotesSize()),
			RequestedPause:    false,
			Character:         "",
			CharacterMetadata: -1,
		}
		gp.InitTime(t.Options)
		g.Players = append(g.Players, gp)
	}

	// Decide the random character assignments
	// (this has to be after seed generation and initialization)
	charactersGenerate(g)

	// Initialize all of the players to not being present
	// This is so that we don't send them unnecessary messages during the game initialization
	// (we will set them back to present once they send the "getGameInfo2" message)
	listOfAwayPlayers := make([]int, 0)
	for _, p := range t.Players {
		if p.Present {
			p.Present = false
		} else {
			listOfAwayPlayers = append(listOfAwayPlayers, p.UserID)
		}
	}

	// Deal the cards
	handSize := g.GetHandSize()
	for _, p := range g.Players {
		for i := 0; i < handSize; i++ {
			p.DrawCard()
		}
	}

	// Now that all of the initial game actions have been performed, mark that the game has started
	t.Running = true
	g.DatetimeStarted = time.Now()

	// If custom actions were provided, emulate those actions
	if t.ExtraOptions.CustomActions != nil {
		emulateActions(ctx, s, d, t)

		// Reset all of the player's clocks to avoid some bugs relating to taking super-fast turns
		for _, p := range g.Players {
			p.InitTime(t.Options)
		}
	}

	// Send a "tableStart" message to everyone in the game
	for _, p := range t.Players {
		// If a player is back in the lobby, then don't automatically force them into the game
		if !intInSlice(p.UserID, listOfAwayPlayers) {
			p.Session.NotifyTableStart(t)
		}
	}

	// If we are emulating actions on a replay, we do not have to tell anyone about the table yet
	if !t.ExtraOptions.NoWriteToDatabase {
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
				p.Session.SetStatus(StatusPlaying)
				p.Session.SetTableID(t.ID)
				notifyAllUser(p.Session)
			}
		}
	}

	// The "CheckTimer()" function will be called when the starting player has finished loading
}

func emulateActions(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	g := t.Game

	if t.ExtraOptions.CustomActions == nil {
		return
	}

	for i, action := range t.ExtraOptions.CustomActions {
		if t.ExtraOptions.SetReplay && t.ExtraOptions.SetReplayTurn == i {
			// This is a "!replay" game and we have reached the intended turn
			return
		}

		p := t.Players[g.ActivePlayerIndex]

		commandAction(ctx, p.Session, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			Type:         action.Type,
			Target:       action.Target,
			Value:        action.Value,
			NoTableLock:  true,
			NoTablesLock: d.NoTablesLock,
		})

		if g.InvalidActionOccurred {
			logger.Info("An invalid action occurred for game " + strconv.Itoa(d.DatabaseID) + "; " +
				"not emulating the rest of the actions.")
			if s != nil {
				s.Warning("The action at index " + strconv.Itoa(i) +
					" was not valid. Skipping all subsequent actions. " +
					"Please report this error to an administrator.")
			}
			badGameIDs = append(badGameIDs, d.DatabaseID)
			return
		}
	}
}
