package main

import (
	"context"
	"strconv"
)

// commandTableUpdate is sent when the user submits
// the "Create a New Game" form from within pre-game
//
// Example data:
// {
//   name: 'my new table',
//   options: {
//     variant: 'No Variant',
//     [other options omitted; see "Options.ts"]
//   },
// }
func commandTableUpdate(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	if t.Running {
		s.Warning(StartedFail)
		return
	}

	if s.UserID != t.OwnerID {
		s.Warning(NotOwnerFail)
		return
	}

	// Perform name fixes
	d.Name = fixTableName(d.Name)

	// Check for valid name
	isValid, msg := isTableNameValid(d.Name, true)
	if !isValid {
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

	// Perform options fixes
	d.Options = fixGameOptions(d.Options)

	// Check for valid options
	isValid, msg = areGameOptionsValid(d.Options)
	if !isValid {
		s.Warning(msg)
		return
	}

	tableUpdate(ctx, s, d, data, t)
}

func tableUpdate(ctx context.Context, s *Session, d *CommandData, data *SpecialGameData, t *Table) {
	// Local variables
	variant := variants[d.Options.VariantName]

	// First, change the table options
	t.Name = d.Name
	t.Visible = !d.HidePregame
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

	// Update the variant-specific stats for each player at the table
	for _, p := range t.Players {
		var variantStats *UserStatsRow
		if v, err := models.UserStats.Get(p.UserID, variant.ID); err != nil {
			logger.Error("Failed to get the stats for player \"" + s.Username + "\" for variant " +
				strconv.Itoa(variant.ID) + ": " + err.Error())
			s.Error(DefaultErrorMsg)
			return
		} else {
			variantStats = v
		}

		p.Stats = &PregameStats{
			NumGames: p.Stats.NumGames,
			Variant:  variantStats,
		}
	}

	// Even though no-one has joined or left the game, this function will update the display of the
	// variant on the client and refresh all of the variant-specific stats
	t.NotifyPlayerChange()

	// Update the variant in the table list for everyone in the lobby
	notifyAllTable(t)

	msg := s.Username + " has changed game options."
	chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)

	// Add the table to a map so that we can keep track of all of the active tables
	tables.Set(t.ID, t)
}
